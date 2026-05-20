'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');

const app = createApp();
const { createPasswordHasher } = require('../../../services/password-hasher');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { normalizeBigInts } = require('../_helpers/bigint');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

let baseUrl = '';
/** @type {any} */
let httpServer = null;
let databaseAvailable = false;
const passwordHasher = createPasswordHasher();

describe('login session integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    let testEmail = '';
    let testUserId = 0;
    let sessionId = '';

    before(async function () {
        if (!await warnIfDatabaseInactive({ logger: console }))
            this.skip();

        databaseAvailable = true;

        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;

        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => {
                if (error)
                    return reject(error);
                return resolve(undefined);
            });
        });
    });

    after(async () => {
        if (databaseAvailable && sessionId)
            await dbQuery('DELETE FROM `sessions` WHERE `sid` = ?', [sessionId]);

        if (databaseAvailable && testEmail)
            await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);

        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve(undefined));
        });
    });

    it('stores request.session.user after successful login', async () => {
        testEmail = `login_session_${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;
        testUserId = buildTestUserId();
        const password = 'integrationPass99';
        const passwordHash = await passwordHasher.hashPassword(password);

        await dbQuery('DELETE FROM `users` WHERE `email` = ? OR `id` = ?', [testEmail, testUserId]);
        await dbQuery(
            'INSERT INTO `users` (`id`, `email`, `password`) VALUES (?, ?, ?)',
            [testUserId, testEmail, passwordHash]
        );

        const loginResponse = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password
            })
        });
        assert.equal(loginResponse.status, 200);

        const sessionSetCookie = getSessionSetCookie(loginResponse);
        assert.ok(sessionSetCookie, 'No se recibio cabecera Set-Cookie en el login.');
        assert.match(sessionSetCookie, /HttpOnly/i);
        assert.match(sessionSetCookie, /SameSite=Lax/i);
        assert.doesNotMatch(sessionSetCookie, /;\s*Secure/i);

        const sessionCookie = getSessionCookie(loginResponse);
        assert.ok(sessionCookie, 'No se recibio cookie de sesion en el login.');

        sessionId = extractSessionId(sessionCookie);
        assert.ok(sessionId, 'No se pudo extraer session_id de la cookie.');

        const rows = await dbQuery(
            'SELECT `data` FROM `sessions` WHERE `sid` = ? LIMIT 1',
            [sessionId]
        );
        assert.equal(rows.length, 1, 'No se encontro la sesion en la tabla sessions.');

        const sessionData = JSON.parse(rows[0].data);
        assert.ok(sessionData.user, 'No existe user en request.session.');
        assert.equal(sessionData.user.email, testEmail);
        assert.equal(sessionData.user.id, testUserId);
        assert.equal(typeof sessionData.user.id, 'number');
    });
});

/**
 * Builds a unique test user id.
 * @returns {*} Result produced by the function.
 */
function buildTestUserId() {
    return 1000000 + Math.floor(Math.random() * 1000000);
}

/**
 * Gets the session cookiefrom the corresponding source.
 * @param {*} response - HTTP response.
 * @returns {*} Result produced by the function.
 */
function getSessionCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        const session = cookies.find((/** @type {*} */ cookie) => cookie.startsWith('connect.sid='));
        return session ? session.split(';')[0] : null;
    }

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie)
        return null;

    const sessionMatch = setCookie.match(/connect\.sid=[^;]+/);
    return sessionMatch ? sessionMatch[0] : null;
}

/**
 * Gets the session set-cookiefrom the corresponding source.
 * @param {*} response - HTTP response.
 * @returns {*} Result produced by the function.
 */
function getSessionSetCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        return cookies.find((/** @type {*} */ cookie) => cookie.startsWith('connect.sid=')) || null;
    }

    return response.headers.get('set-cookie');
}

/**
 * Extracts the session id from the session cookie.
 * @param {*} sessionCookie - Session cookie value.
 * @returns {string} Session id, or empty string.
 */
function extractSessionId(sessionCookie) {
    const rawValue = sessionCookie.replace(/^connect\.sid=/, '');
    const decoded = decodeURIComponent(rawValue);
    const unsigned = decoded.startsWith('s:') ? decoded.slice(2) : decoded;
    const separator = unsigned.indexOf('.');
    if (separator <= 0)
        return '';
    return unsigned.slice(0, separator);
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
 * @returns {*} Result produced by the function.
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
