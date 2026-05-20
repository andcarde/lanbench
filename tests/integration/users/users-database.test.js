'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');

const app = createApp();
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { normalizeBigInts } = require('../_helpers/bigint');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

let baseUrl = '';
/** @type {any} */
let httpServer = null;

describe('users database integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    /** @type {any} */
    /** @type {any} */
    let testEmail;

    before(async function () {
        if (!await warnIfDatabaseInactive({ logger: console }))
            this.skip();

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
        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve(undefined));
        });
    });

    it('registers, logs in, logs out and deletes a user', async () => {
        testEmail = `integration_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        const password = 'integrationPass99';

        await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);

        const registerResponse = await fetch(`${baseUrl}/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                surname: 'Andres',
                lastName: 'Garcia',
                email: testEmail,
                password,
                repeatPassword: password
            })
        });

        assert.equal(registerResponse.status, 201);

        const registerPayload = await registerResponse.json();
        assert.equal(registerPayload.message, 'User validated correctly.');

        const loginResponse = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: testEmail,
                password
            })
        });

        assert.equal(loginResponse.status, 200);
        const loginPayload = await loginResponse.json();
        assert.equal(loginPayload.redirectUrl, '/tasks');

        const sessionCookie = getSessionCookie(loginResponse);
        assert.ok(sessionCookie, 'No se recibio cookie de sesion en el login.');

        const logoutResponse = await fetch(`${baseUrl}/api/session`, {
            method: 'DELETE',
            headers: {
                cookie: sessionCookie
            },
            redirect: 'manual'
        });

        assert.equal(logoutResponse.status, 200);
        const logoutPayload = await logoutResponse.json();
        assert.deepEqual(logoutPayload, {
            ok: true,
            redirectTo: '/login'
        });

        const protectedResponseAfterLogout = await fetch(`${baseUrl}/tasks`, {
            method: 'GET',
            headers: {
                cookie: sessionCookie
            },
            redirect: 'manual'
        });

        assert.ok(
            [302, 303].includes(protectedResponseAfterLogout.status),
            `Estado inesperado accediendo a /tasks tras logout: ${protectedResponseAfterLogout.status}`
        );
        assert.equal(protectedResponseAfterLogout.headers.get('location'), '/login');

        const deleteResult = await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);
        assert.ok(
            deleteResult.affectedRows > 0,
            'No se pudo borrar el usuario de prueba en la base de datos.'
        );
    });
});

/**
 * Gets the session cookie from the response.
 * @param {*} response - HTTP response.
 * @returns {*} Session cookie, or null.
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
