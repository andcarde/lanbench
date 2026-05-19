'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersService } = require('../../../services/users-service');
const { createPasswordHasher } = require('../../../services/password-hasher');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const VALID_CODE = 'AbCdEfGhIjKlMnOp';

/**
 * Construye un repositorio de codigos falso que registra las llamadas.
 * @param {*} options - Opciones de comportamiento.
 * @returns {*} Stub con `consumeCalls`, `insertCalls` y los metodos del repositorio.
 */
function makeRegisterCodesRepository({ consumeResult = true } = {}) {
    /** @type {string[]} */
    const consumeCalls = [];
    /** @type {string[][]} */
    const insertCalls = [];
    return {
        consumeCalls,
        insertCalls,
        async consumeCode(/** @type {*} */ code) {
            consumeCalls.push(code);
            return consumeResult;
        },
        async insertCodes(/** @type {*} */ codes) {
            insertCalls.push(codes.slice());
            return codes.slice();
        }
    };
}

describe('users-service registerModeratorUser', () => {
    it('happy path: consume el codigo y crea el usuario con isModerator=true', async () => {
        const passwordHasher = createPasswordHasher();
        /** @type {any} */
        let persistedUser = null;
        const registerCodesRepository = makeRegisterCodesRepository({ consumeResult: true });

        const usersService = createUsersService({
            passwordHasher,
            registerCodesRepository,
            usersRepository: {
                async findByEmail() {
                    return null;
                },
                async createUser(/** @type {*} */ user) {
                    persistedUser = user;
                    return { id: 42, ...user };
                }
            }
        });

        const result = await usersService.registerModeratorUser({
            email: 'mod@example.com',
            password: 'supersecret99',
            code: VALID_CODE
        });

        assert.equal(persistedUser.email, 'mod@example.com');
        assert.equal(persistedUser.isModerator, true);
        assert.notEqual(persistedUser.password, 'supersecret99');
        const verification = await passwordHasher.verifyPassword('supersecret99', persistedUser.password);
        assert.equal(verification.matches, true);
        assert.equal(result.id, 42);
        assert.deepEqual(registerCodesRepository.consumeCalls, [VALID_CODE]);
    });

    it('rechaza si el codigo tiene forma invalida sin tocar ningun repositorio', async () => {
        const registerCodesRepository = makeRegisterCodesRepository();
        let findByEmailCalled = false;
        const usersService = createUsersService({
            passwordHasher: createPasswordHasher(),
            registerCodesRepository,
            usersRepository: {
                async findByEmail() { findByEmailCalled = true; return null; },
                async createUser() { throw new Error('no deberia crear'); }
            }
        });

        const invalidCodes = [
            '',
            'short',
            'AbCdEfGhIjKlMnO',
            'AbCdEfGhIjKlMnOpQ',
            'AbCdEfGhIjKlMnO!',
            null,
            undefined,
            12345
        ];

        for (const bad of invalidCodes) {
            await assert.rejects(
                () => usersService.registerModeratorUser({
                    email: 'mod@example.com',
                    password: 'supersecret99',
                    code: /** @type {*} */ (bad)
                }),
                (/** @type {any} */ error) =>
                    error?.status === 400 && error?.code === 'invalid_register_code',
                `should reject code=${String(bad)}`
            );
        }

        assert.equal(findByEmailCalled, false);
        assert.equal(registerCodesRepository.consumeCalls.length, 0);
    });

    it('email ya registrado: 409 SIN consumir el codigo (garantia no-burn)', async () => {
        const registerCodesRepository = makeRegisterCodesRepository({ consumeResult: true });
        const usersService = createUsersService({
            passwordHasher: createPasswordHasher(),
            registerCodesRepository,
            usersRepository: {
                async findByEmail() {
                    return { id: 99, email: 'taken@example.com', isModerator: false };
                },
                async createUser() { throw new Error('no deberia crear'); }
            }
        });

        await assert.rejects(
            () => usersService.registerModeratorUser({
                email: 'taken@example.com',
                password: 'supersecret99',
                code: VALID_CODE
            }),
            (/** @type {any} */ error) =>
                error?.status === 409 && error?.code === 'email_taken'
        );

        assert.equal(registerCodesRepository.consumeCalls.length, 0);
    });

    it('codigo no encontrado: 400 invalid_register_code y no crea usuario', async () => {
        const registerCodesRepository = makeRegisterCodesRepository({ consumeResult: false });
        const usersService = createUsersService({
            passwordHasher: createPasswordHasher(),
            registerCodesRepository,
            usersRepository: {
                async findByEmail() { return null; },
                async createUser() { throw new Error('no deberia crear'); }
            }
        });

        await assert.rejects(
            () => usersService.registerModeratorUser({
                email: 'new@example.com',
                password: 'supersecret99',
                code: VALID_CODE
            }),
            (/** @type {any} */ error) =>
                error?.status === 400 && error?.code === 'invalid_register_code'
        );

        assert.deepEqual(registerCodesRepository.consumeCalls, [VALID_CODE]);
    });
});
