'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersService } = require('../../../services/users-service');
const { createPasswordHasher } = require('../../../services/password-hasher');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users-service', () => {
    it('registerUser hashea la contraseña antes de persistirla', async () => {
        const passwordHasher = createPasswordHasher();
        /** @type {any} */
        /** @type {any} */
        let persistedUser = null;

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                /**
                 * Mock of the findByEmail repository method.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findByEmail() {
                    return null;
                },
                /**
                 * Mock of the createUser repository method.
                 * @param {*} user - User to persist.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async createUser(user) {
                    persistedUser = user;
                    return {
                        id: 5,
                        ...user
                    };
                }
            }
        });

        await usersService.registerUser({
            email: 'test@example.com',
            password: 'supersecret99'
        });

        assert.equal(persistedUser.email, 'test@example.com');
        assert.notEqual(persistedUser.password, 'supersecret99');

        const verification = await passwordHasher.verifyPassword('supersecret99', persistedUser.password);
        assert.equal(verification.matches, true);
        assert.equal(verification.needsRehash, false);
    });

    it('authenticateUser valida contraseñas hasheadas y devuelve el usuario de sesión', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                /**
                 * Mock of the findByEmail repository method.
                 * @param {*} email - Email to look up.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findByEmail(email) {
                    assert.equal(email, 'test@example.com');
                    return {
                        id: 7,
                        email: 'test@example.com',
                        password: storedHash,
                        isModerator: false
                    };
                },
                /**
                 * Mock of the updatePassword repository method.
                 */
                async updatePassword() {
                    throw new Error('updatePassword should not be called for already hashed passwords');
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'test@example.com',
            password: 'supersecret99'
        });

        assert.deepEqual(sessionUser, {
            id: 7,
            email: 'test@example.com',
            isModerator: false
        });
    });

    it('authenticateUser migra contraseñas legacy en claro a hash al iniciar sesión', async () => {
        const passwordHasher = createPasswordHasher();
        /** @type {any} */
        /** @type {any} */
        let upgradedPassword = null;

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                /**
                 * Mock of the findByEmail repository method.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findByEmail() {
                    return {
                        id: 11,
                        email: 'legacy@example.com',
                        password: 'legacyPass99',
                        isModerator: false
                    };
                },
                /**
                 * Mock of the updatePassword repository method.
                 * @param {*} userId - User id.
                 * @param {*} nextPassword - New password hash.
                 */
                async updatePassword(userId, nextPassword) {
                    assert.equal(userId, 11);
                    upgradedPassword = nextPassword;
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'legacy@example.com',
            password: 'legacyPass99'
        });

        assert.deepEqual(sessionUser, {
            id: 11,
            email: 'legacy@example.com',
            isModerator: false
        });
        assert.ok(typeof upgradedPassword === 'string' && upgradedPassword.length > 0);
        assert.notEqual(upgradedPassword, 'legacyPass99');

        const verification = await passwordHasher.verifyPassword('legacyPass99', upgradedPassword);
        assert.equal(verification.matches, true);
        assert.equal(verification.needsRehash, false);
    });

    it('authenticateUser rechaza credenciales inválidas', async () => {
        const passwordHasher = createPasswordHasher();
        const storedHash = await passwordHasher.hashPassword('supersecret99');

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                /**
                 * Mock of the findByEmail repository method.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findByEmail() {
                    return {
                        id: 7,
                        email: 'test@example.com',
                        password: storedHash
                    };
                }
            }
        });

        await assert.rejects(
            () => usersService.authenticateUser({
                email: 'test@example.com',
                password: 'incorrecta'
            }),
            (/** @type {any} */ error) => error?.status === 401
        );
    });
});
