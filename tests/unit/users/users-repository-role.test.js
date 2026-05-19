'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersRepository } = require('../../../repositories/users-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users-repository isModerator projection', () => {
    it('findByEmail incluye isModerator en el select de Prisma', async () => {
        /** @type {any[]} */
        const capturedArgs = [];
        const fakePrisma = {
            user: {
                async findFirst(/** @type {*} */ args) {
                    capturedArgs.push(args);
                    return {
                        id: 1,
                        email: 'mod@example.com',
                        password: 'hashed',
                        isModerator: true
                    };
                },
                async create() { throw new Error('not used'); },
                async update() { throw new Error('not used'); }
            }
        };

        const repository = createUsersRepository({ prisma: fakePrisma });

        const user = await repository.findByEmail('mod@example.com');

        assert.equal(capturedArgs.length, 1);
        assert.deepEqual(capturedArgs[0], {
            where: { email: 'mod@example.com' },
            select: {
                id: true,
                email: true,
                password: true,
                isModerator: true
            }
        });
        assert.equal(/** @type {any} */ (user).isModerator, true);
    });

    it('setIsModerator actualiza el flag en Prisma', async () => {
        /** @type {any[]} */
        const capturedArgs = [];
        const fakePrisma = {
            user: {
                async findFirst() { throw new Error('not used'); },
                async create() { throw new Error('not used'); },
                async update(/** @type {*} */ args) {
                    capturedArgs.push(args);
                    return { id: args.where.id, ...args.data };
                }
            }
        };

        const repository = createUsersRepository({ prisma: fakePrisma });

        await repository.setIsModerator(42, true);

        assert.equal(capturedArgs.length, 1);
        assert.deepEqual(capturedArgs[0], {
            where: { id: 42 },
            data: { isModerator: true }
        });
    });
});
