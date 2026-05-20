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
const { normalizeBigInts } = require('../_helpers/bigint');

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
 * Returns a free OS port.
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
