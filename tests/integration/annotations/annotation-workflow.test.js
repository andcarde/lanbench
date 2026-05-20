'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');
const { createPasswordHasher } = require('../../../services/password-hasher');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { TEST_DATA_PATH } = require('../../../constants/paths');
const { normalizeBigInts } = require('../_helpers/bigint');

const app = createApp();

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

const XML_FILE_PATH = path.join(TEST_DATA_PATH, 'test.xml');
const INPUT_FILE_PATH = path.join(TEST_DATA_PATH, 'test_input_1.txt');
const TOTAL_ENTRIES = 20;
const SECTION_SIZE = 10;

const SENTENCES_BY_EID = {
    1: 'Punjab, Pakistán, está dirigido por la Asamblea Provincial del Punjab.',
    2: 'San Sebastián de los Reyes forma parte de la Comunidad de Madrid.'
};

const passwordHasher = createPasswordHasher();
const inputContexts = JSON.parse(fs.readFileSync(INPUT_FILE_PATH, 'utf8'));
const inputContextByEid = new Map(inputContexts.map((/** @type {*} */ ctx) => [ctx.eid, ctx]));

let baseUrl = '';
/** @type {any} */
let httpServer = null;
let sessionCookie = '';
let testEmail = '';
let testUserId = 0;
/** @type {any} */
let createdDatasetId = null;

describe('annotation workflow integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    before(async function () {
        if (!await warnIfDatabaseInactive({ logger: console }))
            return this.skip();

        assert.ok(fs.existsSync(XML_FILE_PATH), `Falta el fichero ${XML_FILE_PATH}`);
        assert.ok(fs.existsSync(INPUT_FILE_PATH), `Falta el fichero ${INPUT_FILE_PATH}`);

        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;
        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => error ? reject(error) : resolve(undefined));
        });

        // ── Step 1: create user ──
        testEmail = `annot_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        testUserId = 2000000 + crypto.randomInt(900000);
        const passwordHash = await passwordHasher.hashPassword('AnnotPass99!');

        await dbQuery('DELETE FROM `users` WHERE `email` = ? OR `id` = ?', [testEmail, testUserId]);
        await dbQuery(
            'INSERT INTO `users` (`id`, `email`, `password`, `is_moderator`) VALUES (?, ?, ?, ?)',
            [testUserId, testEmail, passwordHash, 1]
        );
    });

    after(async () => {
        // Delete dataset via API (cascade: Annotation, Entry, Lex, Triple, Permits, SectionAssignment...)
        if (createdDatasetId && sessionCookie) {
            try {
                await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`, {
                    method: 'DELETE',
                    headers: { cookie: sessionCookie }
                });
            } catch (cleanupError) {
                console.warn(`Cleanup: no se pudo borrar el dataset ${createdDatasetId}: ${/** @type {any} */ (cleanupError).message}`);
            }
            createdDatasetId = null;
        }

        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));

        // Deletion order to respect FKs: dependents before users
        if (testUserId) {
            await dbQuery('DELETE FROM `active_sessions` WHERE `user_id` = ?', [testUserId]);
            await dbQuery('DELETE FROM `section_assignments` WHERE `user_id` = ?', [testUserId]);
            await dbQuery('DELETE FROM `permits` WHERE `user_id` = ?', [testUserId]);
        }
        if (testEmail)
            await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);
    });

    it('flujo completo: login → crear dataset → anotar 2 entries → estadísticas', async function () {
        if (this && typeof this.timeout === 'function')
            this.timeout(60000);

        // ── Step 2: login ──
        const loginResponse = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: testEmail, password: 'AnnotPass99!' })
        });
        assert.equal(loginResponse.status, 200, 'el login debería devolver 200');
        sessionCookie = extractSessionCookie(loginResponse) || '';
        assert.ok(sessionCookie, 'no se recibió cookie de sesión');

        // ── Step 3: create dataset from test.xml in "No reviewer", "No LLM" mode ──
        const xmlContent = fs.readFileSync(XML_FILE_PATH);
        const formData = new FormData();
        formData.append('xmlFile', new Blob([xmlContent], { type: 'application/xml' }), 'test.xml');
        formData.append('llmMode', 'none');
        formData.append('isReviewEnabled', 'false');
        formData.append('hasAdditionalReviews', 'false');

        const createResponse = await fetch(`${baseUrl}/api/datasets`, {
            method: 'POST',
            headers: { cookie: sessionCookie },
            body: formData
        });
        const createBody = await createResponse.text();
        assert.equal(createResponse.status, 201, `la creación del dataset debería ser 201. Body: ${createBody}`);
        const createPayload = JSON.parse(createBody);
        createdDatasetId = createPayload.datasetId;
        assert.ok(Number.isInteger(createdDatasetId) && createdDatasetId > 0, 'el datasetId debe ser entero positivo');

        // Verify in the DB that the dataset was saved with the No reviewer / No LLM configuration
        const [datasetRow] = await dbQuery(
            'SELECT `llm_mode` AS llmMode, `is_review_enabled` AS isReviewEnabled, `has_additional_reviews` AS hasAdditionalReviews, `total_entries` AS entries FROM `datasets` WHERE `id` = ?',
            [createdDatasetId]
        );
        assert.equal(datasetRow.llmMode, 'none', 'llmMode debería ser "none"');
        assert.equal(Number(datasetRow.isReviewEnabled), 0, 'isReviewEnabled debería ser false');
        assert.equal(Number(datasetRow.hasAdditionalReviews), 0, 'hasAdditionalReviews debería ser false');
        assert.equal(Number(datasetRow.entries), TOTAL_ENTRIES, `el dataset debería tener ${TOTAL_ENTRIES} entries`);

        // ── Step 4: start annotating (continue button) ──
        const continueResponse1 = await fetch(`${baseUrl}/api/annotations/${createdDatasetId}/continue`, {
            method: 'POST',
            headers: { cookie: sessionCookie }
        });
        assert.equal(continueResponse1.status, 200);
        const continuePayload1 = await continueResponse1.json();
        assert.equal(continuePayload1.caseNumber, 5, 'la primera llamada a continue debería ser caso 5 (asignación nueva)');
        assert.equal(continuePayload1.sectionNumber, 1, 'la sección asignada debería ser la 1');
        assert.equal(continuePayload1.entryPosition, 0, 'el entryPosition inicial debería ser 0');
        assert.equal(continuePayload1.entryId, 1, 'el entryId (eid) inicial debería ser 1');

        // ── Step 5: the section was created correctly ──
        const assignmentRows = await dbQuery(
            'SELECT `section_index` AS sectionIndex, `status` FROM `section_assignments` WHERE `user_id` = ? AND `dataset_id` = ?',
            [testUserId, createdDatasetId]
        );
        assert.equal(assignmentRows.length, 1, 'debería existir exactamente un SectionAssignment para el usuario');
        assert.equal(assignmentRows[0].sectionIndex, 1, 'el sectionIndex asignado debería ser 1');
        assert.equal(assignmentRows[0].status, 'active', 'el SectionAssignment debería estar activo');

        const activeSessionRows = await dbQuery(
            'SELECT `section_number` AS sectionNumber, `entry_number` AS entryNumber FROM `active_sessions` WHERE `user_id` = ? AND `dataset_id` = ?',
            [testUserId, createdDatasetId]
        );
        assert.equal(activeSessionRows.length, 1, 'debería existir una ActiveSession para el usuario');
        assert.equal(activeSessionRows[0].sectionNumber, 1);
        assert.equal(activeSessionRows[0].entryNumber, 0);

        // ── Step 6: the first entry of the dataset is being received ──
        const nextResponse = await fetch(`${baseUrl}/api/annotations/${createdDatasetId}/next`, {
            headers: { cookie: sessionCookie }
        });
        assert.equal(nextResponse.status, 200);
        const nextPayload = await nextResponse.json();
        assert.equal(nextPayload.sectionNumber, 1);
        assert.equal(nextPayload.totalEntriesInSection, SECTION_SIZE, `la sección debería tener ${SECTION_SIZE} entries`);
        assert.equal(nextPayload.entryIndexInSection, 0);
        assert.equal(nextPayload.isLastEntryInSection, false);
        assert.equal(nextPayload.entry.entryId, 1, 'la primera entry de la sección debería ser eid=1');

        const expectedTriplesEntry1 = inputContextByEid.get(1).triples;
        assert.deepEqual(
            nextPayload.entry.triples.map(humanizeTriple),
            expectedTriplesEntry1,
            'los triples de la entry 1 deberían coincidir (humanizados) con test_input_1.txt'
        );

        // ── Step 7: annotate entry 1 and submit ──
        const sendResponse1 = await fetch(`${baseUrl}/api/annotations/send`, {
            method: 'POST',
            headers: { cookie: sessionCookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                datasetId: createdDatasetId,
                entryId: 1,
                sentences: [{ sentence: SENTENCES_BY_EID[1], rejectionReason: null }],
                sectionNumber: 1
            })
        });
        const sendBody1 = await sendResponse1.text();
        assert.equal(sendResponse1.status, 200, `el envío de la anotación 1 debería ser 200. Body: ${sendBody1}`);

        // ── Step 8: annotation 1 is in the database ──
        const [annotation1] = await dbQuery(
            `SELECT a.\`user_id\` AS id, a.\`dataset_id\` AS datasetId, a.sentence, a.origin, e.eid
             FROM \`annotations\` a
             JOIN \`entries\` e ON e.\`id\` = a.\`entry_id\`
             WHERE a.\`dataset_id\` = ? AND e.eid = ?`,
            [createdDatasetId, 1]
        );
        assert.ok(annotation1, 'debería existir Annotation para la entry eid=1');
        assert.equal(annotation1.id, testUserId);
        assert.equal(annotation1.datasetId, createdDatasetId);
        assert.equal(annotation1.sentence, SENTENCES_BY_EID[1]);
        assert.equal(annotation1.origin, 'manual');

        // ── Step 9: next continue → case 4, returns entry 2 ──
        const continueResponse2 = await fetch(`${baseUrl}/api/annotations/${createdDatasetId}/continue`, {
            method: 'POST',
            headers: { cookie: sessionCookie }
        });
        assert.equal(continueResponse2.status, 200);
        const continuePayload2 = await continueResponse2.json();
        assert.equal(continuePayload2.caseNumber, 4, 'la segunda llamada a continue debería ser caso 4 (sesión activa)');
        assert.equal(continuePayload2.sectionNumber, 1);
        assert.equal(continuePayload2.entryPosition, 1, 'el entryPosition debería haber avanzado a 1');
        assert.equal(continuePayload2.entryId, 2, 'la siguiente entry debería ser eid=2');

        // ── Step 10: annotate entry 2 and submit ──
        const sendResponse2 = await fetch(`${baseUrl}/api/annotations/send`, {
            method: 'POST',
            headers: { cookie: sessionCookie, 'content-type': 'application/json' },
            body: JSON.stringify({
                datasetId: createdDatasetId,
                entryId: 2,
                sentences: [{ sentence: SENTENCES_BY_EID[2], rejectionReason: null }],
                sectionNumber: 1
            })
        });
        const sendBody2 = await sendResponse2.text();
        assert.equal(sendResponse2.status, 200, `el envío de la anotación 2 debería ser 200. Body: ${sendBody2}`);

        // ── Step 11: annotation 2 is in the database ──
        const [annotation2] = await dbQuery(
            `SELECT a.\`user_id\` AS id, a.\`dataset_id\` AS datasetId, a.sentence, a.origin
             FROM \`annotations\` a
             JOIN \`entries\` e ON e.\`id\` = a.\`entry_id\`
             WHERE a.\`dataset_id\` = ? AND e.eid = ?`,
            [createdDatasetId, 2]
        );
        assert.ok(annotation2, 'debería existir Annotation para la entry eid=2');
        assert.equal(annotation2.id, testUserId);
        assert.equal(annotation2.datasetId, createdDatasetId);
        assert.equal(annotation2.sentence, SENTENCES_BY_EID[2]);
        assert.equal(annotation2.origin, 'manual');

        const [annotationTotal] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `annotations` WHERE `dataset_id` = ?',
            [createdDatasetId]
        );
        assert.equal(Number(annotationTotal.total), 2, 'el dataset debería tener exactamente 2 anotaciones');

        // ── Step 12: enter the Administration section (statistics) ──
        const statsResponse = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/statistics`, {
            headers: { cookie: sessionCookie }
        });
        assert.equal(statsResponse.status, 200, 'las estadísticas deberían devolver 200');
        const stats = await statsResponse.json();

        // ── Step 13: the statistics match what was annotated ──
        assert.equal(stats.dataset.datasetId, createdDatasetId);
        assert.equal(stats.dataset.totalEntries, TOTAL_ENTRIES);
        assert.equal(stats.annotation.length, 1, 'debería haber una sola fila de anotación (un solo anotador)');

        const annotationStatsRow = stats.annotation[0];
        assert.equal(annotationStatsRow.userId, testUserId);
        assert.equal(annotationStatsRow.email, testEmail);
        assert.equal(annotationStatsRow.totalEntries, 2, 'el anotador debería tener 2 entries anotadas');
        assert.equal(annotationStatsRow.datasetPercent, '10.00%', '2 / 20 = 10.00 %');
        assert.equal(annotationStatsRow.precision, '100.00%', '2 / 2 aceptadas a la primera = 100.00 %');
        assert.equal(stats.review.length, 0, 'no debería haber revisiones (isReviewEnabled = false)');
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replaces underscores with spaces in subject/predicate/object so the
 * persisted triple (RDF form, with underscores) can be compared with the
 * humanized form expected in test_input_1.txt.
 * @param {*} triple - Original triple {subject, predicate, object}.
 * @returns {*} Triple with spaces instead of underscores.
 */
function humanizeTriple(triple) {
    return {
        subject: String(triple.subject).replaceAll('_', ' '),
        predicate: triple.predicate,
        object: String(triple.object).replaceAll('_', ' ')
    };
}

/**
 * Extracts the session cookie from the Set-Cookie header.
 * @param {Response} response - HTTP response.
 * @returns {string|null} Session cookie, or null if not found.
 */
function extractSessionCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        const session = cookies.find(c => c.startsWith('connect.sid='));
        return session ? session.split(';')[0] : null;
    }
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(/connect\.sid=[^;]+/);
    return match ? match[0] : null;
}

/**
 * Runs a SQL query against Prisma and returns the result.
 * For SELECT it returns the rows; for INSERT/UPDATE/DELETE it returns {affectedRows}.
 * @param {string} sql - SQL statement.
 * @param {Array<*>} [params] - Positional parameters.
 * @returns {Promise<*>} Result rows, or affected-rows summary.
 */
async function dbQuery(sql, params = []) {
    if (/^\s*SELECT\b/i.test(sql)) {
        const rows = await prisma.$queryRawUnsafe(sql, ...params);
        return normalizeBigInts(rows);
    }
    const affected = await prisma.$executeRawUnsafe(sql, ...params);
    return { affectedRows: Number(affected) };
}

/**
 * Returns a free TCP port.
 * @returns {Promise<number>} Available port.
 */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error) return reject(error);
                if (!address || typeof address !== 'object')
                    return reject(new Error('No se pudo resolver un puerto libre.'));
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}
