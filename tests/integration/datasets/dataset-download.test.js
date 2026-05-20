'use strict';

/**
 * Integration tests for the dataset download endpoints (US-29 and US-30).
 *
 *   - `GET /api/datasets/:id/download`           → original XML (Feature A)
 *   - `GET /api/datasets/:id/download/annotated` → extended XML with Spanish
 *                                                  annotations (Feature B)
 *
 * Each test boots the full Express app against the real database, uploads
 * `ru_dev.xml`, then exercises the download endpoint.
 */

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

describe('dataset download integration', function () {
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

        const app = createApp();
        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => error ? reject(error) : resolve(undefined));
        });

        testEmail = `download_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        testUserId = 1100000 + crypto.randomInt(800000);
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
        createdDatasetId = createPayload.datasetId;
        assert.ok(Number.isInteger(createdDatasetId) && createdDatasetId > 0);
    });

    after(async () => {
        if (createdDatasetId && sessionCookie) {
            try {
                await fetch(`${baseUrl}/api/datasets/${createdDatasetId}`, {
                    method: 'DELETE',
                    headers: { cookie: sessionCookie }
                });
            } catch (cleanupError) {
                console.warn(`Cleanup: dataset ${createdDatasetId}: ${/** @type {any} */ (cleanupError).message}`);
            }
            createdDatasetId = null;
        }

        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));

        if (testUserId)
            await dbQuery('DELETE FROM `permits` WHERE `user_id` = ?', [testUserId]);

        if (testEmail)
            await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);
    });

    it('GET /api/datasets/:id/download devuelve el XML reconstruido como adjunto con nombre <name>.xml', async () => {
        const downloadResponse = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/download`, {
            headers: { cookie: sessionCookie }
        });

        assert.equal(downloadResponse.status, 200, 'La descarga del XML original debería devolver 200.');
        assert.match(downloadResponse.headers.get('content-type') || '', /application\/xml/);

        const disposition = downloadResponse.headers.get('content-disposition') || '';
        assert.match(disposition, /^attachment;\s+filename=/i);
        // The persisted name comes from `nameFromFilename('ru_dev.xml')` → 'ru_dev'.
        assert.match(disposition, /filename="ru_dev\.xml"/);

        const downloadBody = await downloadResponse.text();
        assert.ok(downloadBody.startsWith('<?xml'), 'El cuerpo debería comenzar con la declaración XML.');
        assert.match(downloadBody, /<benchmark>/);
        assert.match(downloadBody, /<\/benchmark>/);

        // The body must match the /text endpoint (same graph reconstruction).
        const textResponse = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/text`, {
            headers: { cookie: sessionCookie }
        });
        assert.equal(textResponse.status, 200);
        const textBody = await textResponse.text();
        assert.equal(downloadBody, textBody, 'El XML descargado debe igualar al reconstruido por /text.');
    });

    it('GET /api/datasets/:id/download/annotated devuelve 409 dataset_not_completed cuando el dataset no está al 100%', async () => {
        // The newly created dataset has sectionsPending > 0 and sectionsCompleted = 0.
        const response = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/download/annotated`, {
            headers: { cookie: sessionCookie }
        });

        assert.equal(response.status, 409, 'Sin completar al 100% debe devolverse 409.');
        const payload = await response.json();
        assert.equal(payload.code, 'dataset_not_completed');
    });

    it('GET /api/datasets/:id/download/annotated genera el XML extendido con Spanish lex emparejados al 100%', async () => {
        // 1. Load the persisted entries and their english lexes to build the
        //    test annotations.
        const entries = await dbQuery(
            'SELECT `id` AS entryId, `position` FROM `entries` WHERE `dataset_id` = ? ORDER BY `position` ASC',
            [createdDatasetId]
        );
        assert.ok(entries.length > 0, 'Debe haber entries persistidas.');

        // Insert one annotation per entry: paired (sentenceIndex=0) with the first english lex.
        const pairedSentence = 'Anotación en español para el primer english lex.';
        for (const entry of entries) {
            await dbQuery(
                'INSERT INTO `annotations` (`entry_id`, `dataset_id`, `user_id`, `sentence_index`, `sentence`, `origin`, `is_accepted_first_try`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                [entry.entryId, createdDatasetId, testUserId, 0, pairedSentence, 'manual', 1]
            );
        }

        // Add a "free" annotation on the first entry (very high sentenceIndex).
        const freeSentence = 'Anotación libre sin english lex emparejable.';
        const freeSentenceIndex = 99;
        await dbQuery(
            'INSERT INTO `annotations` (`entry_id`, `dataset_id`, `user_id`, `sentence_index`, `sentence`, `origin`, `is_accepted_first_try`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [entries[0].entryId, createdDatasetId, testUserId, freeSentenceIndex, freeSentence, 'manual', 1]
        );

        // 2. Mark the dataset as 100% complete.
        const totalSections = Math.ceil(entries.length / 10);
        await dbQuery(
            'UPDATE `datasets` SET `sections_completed` = ?, `sections_in_review` = 0, `sections_pending` = 0 WHERE `id` = ?',
            [totalSections, createdDatasetId]
        );

        // 3. Hit the endpoint.
        const response = await fetch(`${baseUrl}/api/datasets/${createdDatasetId}/download/annotated`, {
            headers: { cookie: sessionCookie }
        });

        assert.equal(response.status, 200, 'Al 100% completado la descarga extendida debe devolver 200.');
        assert.match(response.headers.get('content-type') || '', /application\/xml/);
        assert.equal(
            response.headers.get('content-disposition'),
            'attachment; filename="ru_dev-extended.xml"'
        );

        const body = await response.text();
        assert.ok(body.startsWith('<?xml'), 'El cuerpo debería comenzar con la declaración XML.');

        // Paired Spanish lex (lid="Id1" because sentenceIndex=0 pairs with the first english lex).
        assert.match(
            body,
            /<lex lid="Id1" lang="es"[^>]*>Anotación en español para el primer english lex\.<\/lex>/,
            'Debe aparecer al menos un Spanish lex emparejado con lid Id1.'
        );

        // Free Spanish lex (lid="id100" because sentenceIndex+1=100).
        assert.match(
            body,
            /<lex lid="id100" lang="es"[^>]*>Anotación libre sin english lex emparejable\.<\/lex>/,
            'Debe aparecer el Spanish lex libre con lid id100.'
        );

        // Count: one paired annotation per entry + one free → entries.length + 1 Spanish lex.
        const spanishMatches = [...body.matchAll(/<lex [^>]*lang="es"/g)];
        assert.equal(spanishMatches.length, entries.length + 1, 'Total de Spanish lex emitidos debe igualar el total de annotations.');
    });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
