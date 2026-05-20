'use strict';

/**
 * @file Unit tests for the canonical `entities/User` class.
 *
 * Covers the `fromPersistence`/`fromSession` factories, email/isModerator
 * normalization, and `isValid()`/`toSession()`.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { User } = require('../../../entities/user');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('user entity', () => {
    it('normalizes persistence data into the canonical session shape including isModerator', () => {
        const user = User.fromPersistence(/** @type {any} */ ({
            id: '9',
            email: ' Test@Example.com ',
            isModerator: false
        }));

        assert.deepEqual(user.toSession(), {
            id: 9,
            email: 'test@example.com',
            isModerator: false
        });
    });

    it('defaults isModerator to false when persistence row has no flag', () => {
        const user = User.fromPersistence({
            id: 3,
            email: 'user@example.com'
        });

        assert.equal(user.toSession().isModerator, false);
    });

    it('preserves isModerator=true from persistence', () => {
        const user = User.fromPersistence({
            id: 5,
            email: 'mod@example.com',
            isModerator: true
        });

        assert.equal(user.toSession().isModerator, true);
    });

    it('defaults isModerator to false when session payload has no flag', () => {
        const user = User.fromSession({
            id: 12,
            email: 'legacy@example.com'
        });

        assert.ok(user !== null);
        assert.equal(user.isModerator, false);
        assert.equal(user.toSession().isModerator, false);
    });

    it('preserves isModerator from session payload', () => {
        const user = User.fromSession({
            id: 7,
            email: 'mod@example.com',
            isModerator: true
        });

        assert.ok(user !== null);
        assert.equal(user.isModerator, true);
    });

    it('rejects session payloads that use legacy userId key', () => {
        assert.equal(
            User.fromSession(/** @type {any} */ ({
                userId: 9,
                email: 'test@example.com'
            })),
            null
        );
    });

    it('rejects session payloads without email', () => {
        assert.equal(
            User.fromSession({
                id: 9
            }),
            null
        );
    });

    it('toSession throws for invalid users', () => {
        const user = User.fromPersistence({ id: 0, email: '' });
        assert.throws(() => user.toSession(), /Cannot serialize an invalid user/);
    });
});
