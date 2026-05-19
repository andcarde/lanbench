'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { createRegisterCodesRepository } = require('../../../repositories/register-codes-repository');
const { generateRegisterCodes } = require('../../../scripts/generate-register-codes');

const app = createApp();

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

let baseUrl = '';
/** @type {any} */
let httpServer = null;

describe('register-moderator integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    /** @type {string} */
    let testEmail = '';
    /** @type {string} */
    let generatedCode = '';

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
        if (testEmail)
            await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]).catch(() => {});

        if (generatedCode)
            await dbQuery('DELETE FROM `register_codes` WHERE `code` = ?', [generatedCode]).catch(() => {});

        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve(undefined));
        });
    });

    it('registers a moderator using a code produced by the generator script', async () => {
        testEmail = `mod_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        const password = 'integrationPass99';

        await dbQuery('DELETE FROM `users` WHERE `email` = ?', [testEmail]);

        const registerCodesRepository = createRegisterCodesRepository();
        const codes = await generateRegisterCodes({
            count: 1,
            deps: { registerCodesRepository }
        });
        assert.equal(codes.length, 1);
        generatedCode = codes[0];

        const registerResponse = await fetch(`${baseUrl}/register/moderator`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                surname: 'Andres',
                lastName: 'Garcia',
                email: testEmail,
                password,
                repeatPassword: password,
                code: generatedCode
            })
        });

        assert.equal(registerResponse.status, 201);
        const registerPayload = await registerResponse.json();
        assert.equal(registerPayload.message, 'User validated correctly.');

        const userRows = await dbQuery(
            'SELECT `id`, `email`, `is_moderator` FROM `users` WHERE `email` = ?',
            [testEmail]
        );
        assert.equal(userRows.length, 1, 'expected exactly one user row');
        assert.equal(userRows[0].is_moderator, 1, 'user should have is_moderator = 1');

        const codeRows = await dbQuery(
            'SELECT `code` FROM `register_codes` WHERE `code` = ?',
            [generatedCode]
        );
        assert.equal(codeRows.length, 0, 'register code row should be deleted after use');

        const secondEmail = `mod2_${Date.now()}_${crypto.randomInt(10000)}@example.com`;
        const replayResponse = await fetch(`${baseUrl}/register/moderator`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                surname: 'Andres',
                lastName: 'Garcia',
                email: secondEmail,
                password,
                repeatPassword: password,
                code: generatedCode
            })
        });

        assert.equal(replayResponse.status, 400, 'reusing a consumed code must be rejected');
        const replayPayload = await replayResponse.json();
        assert.equal(replayPayload.message, 'Invalid moderator register code.');
    });
});

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
 * Obtiene un puerto libre del SO.
 * @returns {Promise<number>} Puerto disponible.
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
