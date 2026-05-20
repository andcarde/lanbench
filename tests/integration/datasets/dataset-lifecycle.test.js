'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');

const app = createApp();
const { createPasswordHasher } = require('../../../services/password-hasher');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { TEST_DATA_PATH } = require('../../../constants/paths');
const { normalizeBigInts } = require('../_helpers/bigint');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

const XML_FILE_PATH = path.join(TEST_DATA_PATH, 'ru_dev.xml');

const passwordHasher = createPasswordHasher();

let baseUrl = '';
/** @type {any} */
let httpServer = null;
let sessionCookie = '';
let testEmail = '';
let testUserId = 0;
/** @type {any} */
let createdDatasetId = null;

describe('dataset lifecycle integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    before(async function () {
        if (!await warnIfDatabaseInactive({ logger: console }))
            return this.skip();

        assert.ok(
            fs.existsSync(XML_FILE_PATH),
            `El fichero de prueba no existe: ${XML_FILE_PATH}`
        );

        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;

        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => error ? reject(error) : resolve(undefined));
        });

        testEmail = `lifecycle_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        testUserId = 1000000 + crypto.randomInt(900000);
        const passwordHash = await passwordHasher.hashPassword('TestPass99!');

        await dbQuery('DELETE FROM `users` WHERE `email` = ? OR `id` = ?', [testEmail, testUserId]);
        await dbQuery(
            'INSERT INTO `users` (`id`, `email`, `password`, `is_moderator`) VALUES (?, ?, ?, ?)',
            [testUserId, testEmail, passwordHash, 1]
        );

        const loginResponse = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: testEmail, password: 'TestPass99!' })
        });

        assert.equal(loginResponse.status, 200, 'El login del usuario de prueba debería devolver 200.');
        sessionCookie = extractSessionCookie(loginResponse) || '';
        assert.ok(sessionCookie, 'No se recibió cookie de sesión.');
    });

    after(async () => {
        // Delete the dataset via API while the server is still running
        if (createdDatasetId && sessionCookie) {
            try {
                await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`, {
                    method: 'DELETE',
                    headers: { cookie: sessionCookie }
                });
            } catch (cleanupError) {
                console.warn(`Cleanup: no se pudo borrar el dataset ${createdDatasetId} vía API: ${/** @type {any} */ (cleanupError).message}`);
            }
            createdDatasetId = null;
        }

        // Close the server before the final cleanup queries
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));

        // Delete permits before users to avoid the FK fk_permits_user
        if (testUserId)
            await dbQuery('DELETE FROM `permits` WHERE `user_id` = ?', [testUserId]);

        if (testEmail)
            await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);
    });

    it('crea un dataset desde ru_dev.xml, verifica sus filas y lo borra comprobando el borrado en cascada', async function () {
        if (this && typeof this.timeout === 'function')
            this.timeout(60000);

        // ── 1. Upload the XML file ────────────────────────────────────────────
        const xmlContent = fs.readFileSync(XML_FILE_PATH);
        const formData = new FormData();
        formData.append('xmlFile', new Blob([xmlContent], { type: 'application/xml' }), 'ru_dev.xml');

        const createResponse = await fetch(`${baseUrl}/api/datasets`, {
            method: 'POST',
            headers: { cookie: sessionCookie },
            body: formData
        });

        const createBody = await createResponse.text();
        assert.equal(createResponse.status, 201, `La creación del dataset debería devolver 201. Body: ${createBody}`);

        const createPayload = JSON.parse(createBody);
        assert.ok(createPayload.ok, 'La respuesta debería tener ok: true.');
        assert.ok(Number.isInteger(createPayload.datasetId) && createPayload.datasetId > 0, 'Se debería devolver un datasetId positivo.');

        createdDatasetId = createPayload.datasetId;

        // ── 2. Verify in the DB that the dataset exists with its dependencies ─
        const [datasetRows] = await dbQuery(
            'SELECT `id` AS datasetId, name FROM `datasets` WHERE `id` = ?',
            [createdDatasetId]
        );
        assert.ok(datasetRows, 'El dataset debería existir en la tabla datasets.');
        assert.equal(datasetRows.datasetId, createdDatasetId);

        const [permitsCount] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `permits` WHERE `dataset_id` = ?',
            [createdDatasetId]
        );
        assert.ok(permitsCount.total > 0, 'Deberían existir filas en permits para el dataset.');

        const [entryCount] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `entries` WHERE `dataset_id` = ?',
            [createdDatasetId]
        );
        assert.ok(entryCount.total > 0, 'Deberían existir entries para el dataset.');

        const entryIds = await dbQuery(
            'SELECT `id` AS entryId FROM `entries` WHERE `dataset_id` = ?',
            [createdDatasetId]
        );
        const entryIdList = entryIds.map((/** @type {*} */ r) => r.entryId);
        assert.ok(entryIdList.length > 0);

        const [triplesetCount] = await dbQuery(
            `SELECT COUNT(*) AS total FROM \`triplesets\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
            entryIdList
        );
        assert.ok(triplesetCount.total > 0, 'Deberían existir triplesets para las entries del dataset.');

        const triplesetIds = await dbQuery(
            `SELECT \`id\` FROM \`triplesets\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
            entryIdList
        );
        const triplesetIdList = triplesetIds.map((/** @type {*} */ r) => r.id);

        const [tripleCount] = await dbQuery(
            `SELECT COUNT(*) AS total FROM \`triples\` WHERE \`tripleset_id\` IN (${placeholders(triplesetIdList)})`,
            triplesetIdList
        );
        assert.ok(tripleCount.total > 0, 'Deberían existir triples para los triplesets del dataset.');

        const [lexCount] = await dbQuery(
            `SELECT COUNT(*) AS total FROM \`lexes\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
            entryIdList
        );
        assert.ok(lexCount.total > 0, 'Deberían existir lexicalizaciones para las entries del dataset.');

        // ── 3. Delete the dataset through the API ─────────────────────────────
        const deleteResponse = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`, {
            method: 'DELETE',
            headers: { cookie: sessionCookie }
        });

        const deleteBody = await deleteResponse.text();
        assert.equal(deleteResponse.status, 200, `El borrado debería devolver 200. Body: ${deleteBody}`);
        const deletePayload = JSON.parse(deleteBody);
        assert.equal(deletePayload.ok, true, 'La respuesta de borrado debería tener ok: true.');

        createdDatasetId = null;

        // ── 4. Verify via API that the dataset no longer exists ──────────────
        const getResponse = await fetch(`${baseUrl}/api/datasets/${createPayload.datasetId}`, {
            headers: { cookie: sessionCookie }
        });
        assert.equal(getResponse.status, 404, 'El dataset borrado debería devolver 404 al consultarlo.');

        // ── 5. Verify the cascade deletion in the DB ──────────────────────────
        const datasetId = createPayload.datasetId;

        const [deletedDataset] = await dbQuery(
            'SELECT `id` AS datasetId FROM `datasets` WHERE `id` = ?',
            [datasetId]
        );
        assert.equal(deletedDataset, undefined, 'La fila del dataset debería haber sido eliminada.');

        const [remainingPermits] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `permits` WHERE `dataset_id` = ?',
            [datasetId]
        );
        assert.equal(Number(remainingPermits.total), 0, 'Los permits del dataset deberían haber sido eliminados.');

        const [remainingEntries] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `entries` WHERE `dataset_id` = ?',
            [datasetId]
        );
        assert.equal(Number(remainingEntries.total), 0, 'Las entries del dataset deberían haber sido eliminadas.');

        if (triplesetIdList.length > 0) {
            const [remainingTriplesets] = await dbQuery(
                `SELECT COUNT(*) AS total FROM \`triplesets\` WHERE \`id\` IN (${placeholders(triplesetIdList)})`,
                triplesetIdList
            );
            assert.equal(Number(remainingTriplesets.total), 0, 'Los triplesets del dataset deberían haber sido eliminados.');

            const [remainingTriples] = await dbQuery(
                `SELECT COUNT(*) AS total FROM \`triples\` WHERE \`tripleset_id\` IN (${placeholders(triplesetIdList)})`,
                triplesetIdList
            );
            assert.equal(Number(remainingTriples.total), 0, 'Los triples del dataset deberían haber sido eliminados.');
        }

        if (entryIdList.length > 0) {
            const [remainingLex] = await dbQuery(
                `SELECT COUNT(*) AS total FROM \`lexes\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
                entryIdList
            );
            assert.equal(Number(remainingLex.total), 0, 'Las lexicalizaciones del dataset deberían haber sido eliminadas.');

            const [remainingDbpedia] = await dbQuery(
                `SELECT COUNT(*) AS total FROM \`dbpedia_links\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
                entryIdList
            );
            assert.equal(Number(remainingDbpedia.total), 0, 'Los dbpedialinks del dataset deberían haber sido eliminados.');

            const [remainingLinks] = await dbQuery(
                `SELECT COUNT(*) AS total FROM \`links\` WHERE \`entry_id\` IN (${placeholders(entryIdList)})`,
                entryIdList
            );
            assert.equal(Number(remainingLinks.total), 0, 'Los links del dataset deberían haber sido eliminados.');
        }

        const [remainingSections] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `sections` WHERE `dataset_id` = ?',
            [datasetId]
        );
        assert.equal(Number(remainingSections.total), 0, 'Las sections del dataset deberían haber sido eliminadas.');

        const [remainingAssignments] = await dbQuery(
            'SELECT COUNT(*) AS total FROM `section_assignments` WHERE `dataset_id` = ?',
            [datasetId]
        );
        assert.equal(Number(remainingAssignments.total), 0, 'Los SectionAssignments del dataset deberían haber sido eliminados.');
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates the ? placeholders for a list of values in SQL.
 * @param {Array<*>} list - List of values.
 * @returns {string} Comma-separated placeholders.
 */
function placeholders(list) {
    return list.map(() => '?').join(',');
}

/**
 * Extracts the session cookie from the Set-Cookie header.
 * @param {Response} response - HTTP response.
 * @returns {string|null} Cookie value.
 */
function extractSessionCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        const session = cookies.find(c => c.startsWith('connect.sid='));
        return session ? session.split(';')[0] : null;
    }

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie)
        return null;

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
                if (error)
                    return reject(error);
                if (!address || typeof address !== 'object')
                    return reject(new Error('No se pudo resolver un puerto libre.'));
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}
