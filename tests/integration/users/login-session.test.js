'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');

const app = createApp();
const { createPasswordHasher } = require('../../../services/password-hasher');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');

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

        const loginResponse = await fetch(`${baseUrl}/create-session`, {
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
 * Construye test user id a partir de los datos recibidos.
 * @returns {*} Resultado producido por la funcion.
 */
function buildTestUserId() {
    return 1000000 + Math.floor(Math.random() * 1000000);
}

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
 * Obtiene session set cookie desde la fuente correspondiente.
 * @param {*} response - Respuesta HTTP usada para devolver el resultado.
 * @returns {*} Resultado producido por la funcion.
 */
function getSessionSetCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const cookies = response.headers.getSetCookie();
        return cookies.find((/** @type {*} */ cookie) => cookie.startsWith('connect.sid=')) || null;
    }

    return response.headers.get('set-cookie');
}

/**
 * Ejecuta la logica de extract session id.
 * @param {*} sessionCookie - Valor de sessionCookie usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
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
