'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { bootstrapAdmin, runFromEnv } = require('../../../scripts/bootstrap-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Crea un hasher falso que registra las llamadas para verificar interacciones.
 * @param {*} _expectedPlain - Texto plano esperado (no usado, documentativo).
 * @returns {*} Hasher fake con calls registradas.
 */
function makeHasher(_expectedPlain) {
    /** @type {any[]} */
    const calls = [];
    return {
        calls,
        async hashPassword(/** @type {*} */ plain) {
            calls.push(plain);
            return `hashed(${plain})`;
        },
        async verifyPassword(/** @type {*} */ plain, /** @type {*} */ hash) {
            return { matches: hash === `hashed(${plain})`, needsRehash: false };
        }
    };
}

describe('bootstrap-admin', () => {
    it('crea un usuario nuevo con isModerator=true cuando el email no existe', async () => {
        /** @type {any[]} */
        const createdCalls = [];
        const usersRepository = {
            async findByEmail() { return null; },
            async createUser(/** @type {*} */ payload) {
                createdCalls.push(payload);
                return { id: 42, ...payload };
            },
            async setIsModerator() { throw new Error('setIsModerator no deberia llamarse'); }
        };
        const passwordHasher = makeHasher('supersecret99');

        const result = await bootstrapAdmin({
            email: 'Admin@Example.COM',
            password: 'supersecret99',
            deps: { usersRepository, passwordHasher }
        });

        assert.deepEqual(result, {
            created: true,
            promoted: false,
            userId: 42,
            email: 'admin@example.com',
            isModerator: true
        });
        assert.equal(createdCalls.length, 1);
        assert.equal(createdCalls[0].email, 'admin@example.com');
        assert.equal(createdCalls[0].isModerator, true);
        assert.equal(createdCalls[0].password, 'hashed(supersecret99)');
        assert.deepEqual(passwordHasher.calls, ['supersecret99']);
    });

    it('promueve a moderador un usuario existente sin tocar contrasena', async () => {
        /** @type {any[]} */
        const setIsModeratorCalls = [];
        const usersRepository = {
            async findByEmail() {
                return { id: 7, email: 'existing@example.com', isModerator: false };
            },
            async createUser() { throw new Error('no deberia crear'); },
            async setIsModerator(/** @type {*} */ userId, /** @type {*} */ isModerator) {
                setIsModeratorCalls.push({ userId, isModerator });
            }
        };
        const passwordHasher = makeHasher('supersecret99');

        const result = await bootstrapAdmin({
            email: 'existing@example.com',
            password: 'supersecret99',
            deps: { usersRepository, passwordHasher }
        });

        assert.equal(result.created, false);
        assert.equal(result.promoted, true);
        assert.equal(result.userId, 7);
        assert.equal(result.isModerator, true);
        assert.deepEqual(setIsModeratorCalls, [{ userId: 7, isModerator: true }]);
        assert.equal(passwordHasher.calls.length, 0);
    });

    it('rechaza emails vacios o contrasenas cortas', async () => {
        const deps = {
            usersRepository: {
                async findByEmail() { throw new Error('no should reach'); },
                async createUser() { throw new Error('no should reach'); },
                async setIsModerator() { throw new Error('no should reach'); }
            },
            passwordHasher: makeHasher('')
        };

        await assert.rejects(
            () => bootstrapAdmin({ email: '', password: 'supersecret99', deps }),
            /email is required/
        );
        await assert.rejects(
            () => bootstrapAdmin({ email: 'a@b.com', password: 'short', deps }),
            /at least 8/
        );
    });

    it('runFromEnv usa BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD', async () => {
        /** @type {any[]} */
        const createdCalls = [];
        const usersRepository = {
            async findByEmail() { return null; },
            async createUser(/** @type {*} */ payload) {
                createdCalls.push(payload);
                return { id: 100, ...payload };
            },
            async setIsModerator() { throw new Error('no should reach'); }
        };
        const passwordHasher = makeHasher('supersecret99');
        /** @type {any[]} */
        const logged = [];

        const result = await runFromEnv({
            env: {
                BOOTSTRAP_ADMIN_EMAIL: 'root@example.com',
                BOOTSTRAP_ADMIN_PASSWORD: 'supersecret99'
            },
            logger: { info: (/** @type {*} */ msg) => logged.push(msg) },
            deps: { usersRepository, passwordHasher }
        });

        assert.equal(result.email, 'root@example.com');
        assert.equal(result.isModerator, true);
        assert.equal(result.created, true);
        assert.ok(logged.some(msg => msg.includes('root@example.com')));
    });
});
