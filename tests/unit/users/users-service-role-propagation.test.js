'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersService } = require('../../../services/users-service');
const { createPasswordHasher } = require('../../../services/password-hasher');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users-service isModerator propagation', () => {
    it('propaga isModerator=true desde DB hasta el payload de sesion', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return {
                        id: 1,
                        email: 'mod@example.com',
                        password: storedHash,
                        isModerator: true
                    };
                },
                async updatePassword() {
                    throw new Error('not expected');
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'mod@example.com',
            password: 'supersecret99'
        });

        assert.deepEqual(sessionUser, {
            id: 1,
            email: 'mod@example.com',
            isModerator: true
        });
    });

    it('propaga isModerator=false desde DB hasta el payload de sesion', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return {
                        id: 9,
                        email: 'normal@example.com',
                        password: storedHash,
                        isModerator: false
                    };
                },
                async updatePassword() {
                    throw new Error('not expected');
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'normal@example.com',
            password: 'supersecret99'
        });

        assert.equal(sessionUser.isModerator, false);
    });
});
