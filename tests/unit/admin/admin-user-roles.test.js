'use strict';

/**
 * US-22 server-role management — unit coverage for the admin-service write side
 * (`listUsers` / `setUserModerator`). The repository's `setIsModerator` already
 * existed but was never reachable; these tests pin the new business rules:
 * input validation, the self-demotion guard, and the unknown-user mapping.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAdminService } = require('../../../services/admin-service');
const { ServiceError } = require('../../../services/service-error');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds an admin service with a stub users repository and records its calls.
 * @param {Record<string, any>} [overrides]
 */
function buildService(overrides = {}) {
    const calls = { setIsModerator: /** @type {any[]} */ ([]) };
    const usersRepository = {
        async listUsers() {
            return [
                { id: 1, email: 'a@test', isModerator: true, password: 'SHOULD-NOT-LEAK' },
                { id: 2, email: 'b@test', isModerator: false }
            ];
        },
        async setIsModerator(/** @type {number} */ userId, /** @type {boolean} */ isModerator) {
            calls.setIsModerator.push({ userId, isModerator });
            if (overrides.notFound)
                throw Object.assign(new Error('not found'), { code: 'P2025' });
            return { id: userId, email: `u${userId}@test`, isModerator };
        }
    };
    return { service: createAdminService({ usersRepository }), calls };
}

describe('admin-service — US-22 server-role management', () => {
    it('listUsers expone id/email/isModerator y nunca el password', async () => {
        const { service } = buildService();
        const users = await service.listUsers();
        assert.deepEqual(users, [
            { id: 1, email: 'a@test', isModerator: true },
            { id: 2, email: 'b@test', isModerator: false }
        ]);
    });

    it('setUserModerator promueve a un usuario', async () => {
        const { service, calls } = buildService();
        const updated = await service.setUserModerator({ actorId: 1, userId: 2, isModerator: true });
        assert.deepEqual(updated, { id: 2, email: 'u2@test', isModerator: true });
        assert.deepEqual(calls.setIsModerator, [{ userId: 2, isModerator: true }]);
    });

    it('rechaza un userId inválido con 400', async () => {
        const { service } = buildService();
        await assert.rejects(
            () => service.setUserModerator({ actorId: 1, userId: 0, isModerator: true }),
            (/** @type {*} */ err) => err instanceof ServiceError && err.status === 400 && err.code === 'invalid_user_id'
        );
    });

    it('rechaza isModerator no booleano con 400 (semántica estricta)', async () => {
        const { service } = buildService();
        await assert.rejects(
            () => service.setUserModerator({ actorId: 1, userId: 2, isModerator: /** @type {*} */ ('true') }),
            (/** @type {*} */ err) => err instanceof ServiceError && err.status === 400 && err.code === 'invalid_is_moderator'
        );
    });

    it('impide que un moderador se auto-degrade (409 cannot_self_demote)', async () => {
        const { service, calls } = buildService();
        await assert.rejects(
            () => service.setUserModerator({ actorId: 5, userId: 5, isModerator: false }),
            (/** @type {*} */ err) => err instanceof ServiceError && err.status === 409 && err.code === 'cannot_self_demote'
        );
        assert.equal(calls.setIsModerator.length, 0, 'no debería tocar el repositorio');
    });

    it('permite que un moderador se promueva a sí mismo (idempotente)', async () => {
        const { service } = buildService();
        const updated = await service.setUserModerator({ actorId: 5, userId: 5, isModerator: true });
        assert.equal(updated.isModerator, true);
    });

    it('traduce P2025 a 404 user_not_found', async () => {
        const { service } = buildService({ notFound: true });
        await assert.rejects(
            () => service.setUserModerator({ actorId: 1, userId: 99, isModerator: true }),
            (/** @type {*} */ err) => err instanceof ServiceError && err.status === 404 && err.code === 'user_not_found'
        );
    });
});
