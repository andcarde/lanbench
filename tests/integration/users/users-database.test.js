'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');

const app = createApp();
const { warnIfDatabaseInactive } = require('../../../utils/database-health');

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

        const loginResponse = await fetch(`${baseUrl}/create-session`, {
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

        const logoutResponse = await fetch(`${baseUrl}/api/administrator/logout`, {
            method: 'POST',
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
 * Obtiene session cookie desde la fuente correspondiente.
 * @param {*} response - Respuesta HTTP usada para devolver el resultado.
 * @returns {*} Resultado producido por la funcion.
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
 * Ejecuta una query SQL contra Prisma y devuelve el resultado.
 * Para SELECT devuelve las filas; para INSERT/UPDATE/DELETE devuelve {affectedRows}.
 * @param {string} sql - Sentencia SQL.
 * @param {Array<*>} [params] - Parametros posicionales.
 * @returns {Promise<*>} Filas resultado o resumen de filas afectadas.
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
 * Convierte recursivamente los BigInt devueltos por Prisma a Number.
 * @param {*} value - Valor a normalizar.
 * @returns {*} Valor sin BigInt.
 */
function normalizeBigInts(value) {
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return value.map(normalizeBigInts);
    if (value && typeof value === 'object') {
        /** @type {Record<string, *>} */
        const result = {};
        for (const key of Object.keys(value))
            result[key] = normalizeBigInts(value[key]);
        return result;
    }
    return value;
}

/**
 * Obtiene free port desde la fuente correspondiente.
 * @returns {*} Resultado producido por la funcion.
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
