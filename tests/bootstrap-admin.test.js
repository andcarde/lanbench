'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { bootstrapAdmin, runFromEnv } = require('../scripts/bootstrap-admin');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

function makeHasher(expectedPassword) {
    const calls = [];
    return {
        calls,
        async hashPassword(plain) {
            calls.push(plain);
            return `hashed(${plain})`;
        },
        async verifyPassword(plain, hash) {
            return { matches: hash === `hashed(${plain})`, needsRehash: false };
        }
    };
}

describe('bootstrap-admin (T1.7)', () => {
    it('crea un usuario nuevo con rol admin cuando el email no existe', async () => {
        const createdCalls = [];
        const usersRepository = {
            async findByEmail() { return null; },
            async createUser(payload) {
                createdCalls.push(payload);
                return { idUser: 42, ...payload };
            },
            async setRole() { throw new Error('setRole no deberia llamarse'); }
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
            idUser: 42,
            email: 'admin@example.com',
            role: 'admin'
        });
        assert.equal(createdCalls.length, 1);
        assert.equal(createdCalls[0].email, 'admin@example.com');
        assert.equal(createdCalls[0].role, 'admin');
        assert.equal(createdCalls[0].password, 'hashed(supersecret99)');
        assert.deepEqual(passwordHasher.calls, ['supersecret99']);
    });

    it('promueve a admin un usuario existente sin tocar contrasena', async () => {
        const setRoleCalls = [];
        const usersRepository = {
            async findByEmail() {
                return { idUser: 7, email: 'existing@example.com', role: 'annotator' };
            },
            async createUser() { throw new Error('no deberia crear'); },
            async setRole(idUser, role) {
                setRoleCalls.push({ idUser, role });
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
        assert.equal(result.idUser, 7);
        assert.equal(result.role, 'admin');
        assert.deepEqual(setRoleCalls, [{ idUser: 7, role: 'admin' }]);
        assert.equal(passwordHasher.calls.length, 0);
    });

    it('rechaza emails vacios o contrasenas cortas', async () => {
        const deps = {
            usersRepository: {
                async findByEmail() { throw new Error('no should reach'); },
                async createUser() { throw new Error('no should reach'); },
                async setRole() { throw new Error('no should reach'); }
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
        const createdCalls = [];
        const usersRepository = {
            async findByEmail() { return null; },
            async createUser(payload) {
                createdCalls.push(payload);
                return { idUser: 100, ...payload };
            },
            async setRole() { throw new Error('no should reach'); }
        };
        const passwordHasher = makeHasher('supersecret99');
        const logged = [];

        const result = await runFromEnv({
            env: {
                BOOTSTRAP_ADMIN_EMAIL: 'root@example.com',
                BOOTSTRAP_ADMIN_PASSWORD: 'supersecret99'
            },
            logger: { info: msg => logged.push(msg) },
            deps: { usersRepository, passwordHasher }
        });

        assert.equal(result.email, 'root@example.com');
        assert.equal(result.role, 'admin');
        assert.equal(result.created, true);
        assert.ok(logged.some(msg => msg.includes('root@example.com')));
    });
});
