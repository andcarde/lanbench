'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersService } = require('../services/users-service');
const { createPasswordHasher } = require('../services/password-hasher');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('users-service role propagation (T1.1)', () => {
    it('propaga el rol admin desde DB hasta el payload de sesion', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return {
                        idUser: 1,
                        email: 'admin@example.com',
                        password: storedHash,
                        role: 'admin'
                    };
                },
                async updatePassword() {
                    throw new Error('not expected');
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'admin@example.com',
            password: 'supersecret99'
        });

        assert.deepEqual(sessionUser, {
            idUser: 1,
            email: 'admin@example.com',
            role: 'admin'
        });
    });

    it('propaga el rol reviewer desde DB hasta el payload de sesion', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return {
                        idUser: 9,
                        email: 'rev@example.com',
                        password: storedHash,
                        role: 'reviewer'
                    };
                },
                async updatePassword() {
                    throw new Error('not expected');
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'rev@example.com',
            password: 'supersecret99'
        });

        assert.equal(sessionUser.role, 'reviewer');
    });
});
