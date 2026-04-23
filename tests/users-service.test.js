'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersService } = require('../services/users-service');
const { createPasswordHasher } = require('../services/password-hasher');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('users-service', () => {
    it('registerUser hashea la contraseña antes de persistirla', async () => {
        const passwordHasher = createPasswordHasher();
        let persistedUser = null;

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return null;
                },
                async createUser(user) {
                    persistedUser = user;
                    return {
                        idUser: 5,
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
                async findByEmail(email) {
                    assert.equal(email, 'test@example.com');
                    return {
                        idUser: 7,
                        email: 'test@example.com',
                        password: storedHash,
                        role: 'annotator'
                    };
                },
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
            idUser: 7,
            email: 'test@example.com',
            role: 'annotator'
        });
    });

    it('authenticateUser migra contraseñas legacy en claro a hash al iniciar sesión', async () => {
        const passwordHasher = createPasswordHasher();
        let upgradedPassword = null;

        const usersService = createUsersService({
            passwordHasher,
            usersRepository: {
                async findByEmail() {
                    return {
                        idUser: 11,
                        email: 'legacy@example.com',
                        password: 'legacyPass99',
                        role: 'annotator'
                    };
                },
                async updatePassword(idUser, nextPassword) {
                    assert.equal(idUser, 11);
                    upgradedPassword = nextPassword;
                }
            }
        });

        const sessionUser = await usersService.authenticateUser({
            email: 'legacy@example.com',
            password: 'legacyPass99'
        });

        assert.deepEqual(sessionUser, {
            idUser: 11,
            email: 'legacy@example.com',
            role: 'annotator'
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
                async findByEmail() {
                    return {
                        idUser: 7,
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
            error => error && error.status === 401
        );
    });
});
