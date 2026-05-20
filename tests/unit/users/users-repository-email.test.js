'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersRepository } = require('../../../repositories/users-repository');
const { normalizeEmail } = require('../../../utils/validators');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users-repository exact email lookup', () => {
    it('normaliza espacios y mayusculas para buscar por email', async () => {
        /** @type {any[]} */
        const calls = [];
        const repository = createUsersRepository({
            prisma: {
                user: {
                    findFirst(/** @type {*} */ query) {
                        calls.push(query);
                        return Promise.resolve({ userId: 1, email: 'tom@gmail.com', isModerator: false });
                    }
                }
            }
        });

        const result = await repository.findByExactEmail(' Tom@Gmail.COM ');

        assert.equal(/** @type {any} */ (result).email, 'tom@gmail.com');
        assert.deepEqual(calls[0].where, { email: 'tom@gmail.com' });
    });

    it('devuelve null si el email queda vacio', async () => {
        const repository = createUsersRepository({
            prisma: {
                user: {
                    findFirst() {
                        throw new Error('findFirst should not be called');
                    }
                }
            }
        });

        assert.equal(await repository.findByExactEmail('   '), null);
        assert.equal(normalizeEmail(' A@B.COM '), 'a@b.com');
    });
});
