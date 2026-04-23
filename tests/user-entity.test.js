'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { User } = require('../entities/user');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('user entity', () => {
    it('normalizes persistence data into the canonical session shape including role', () => {
        const user = User.fromPersistence({
            idUser: '9',
            email: ' Test@Example.com ',
            role: 'annotator'
        });

        assert.deepEqual(user.toSession(), {
            idUser: 9,
            email: 'test@example.com',
            role: 'annotator'
        });
    });

    it('defaults role to annotator when persistence row has no role field', () => {
        const user = User.fromPersistence({
            idUser: 3,
            email: 'user@example.com'
        });

        assert.equal(user.toSession().role, 'annotator');
    });

    it('preserves non-default roles from persistence', () => {
        const user = User.fromPersistence({
            idUser: 5,
            email: 'admin@example.com',
            role: 'admin'
        });

        assert.equal(user.toSession().role, 'admin');
    });

    it('defaults role to annotator when session payload has no role field', () => {
        const user = User.fromSession({
            idUser: 12,
            email: 'legacy@example.com'
        });

        assert.ok(user !== null);
        assert.equal(user.role, 'annotator');
        assert.equal(user.toSession().role, 'annotator');
    });

    it('preserves role from session payload', () => {
        const user = User.fromSession({
            idUser: 7,
            email: 'reviewer@example.com',
            role: 'reviewer'
        });

        assert.ok(user !== null);
        assert.equal(user.role, 'reviewer');
    });

    it('rejects legacy session payloads that use id instead of idUser', () => {
        assert.equal(
            User.fromSession({
                id: 9,
                email: 'test@example.com'
            }),
            null
        );
    });

    it('rejects session payloads without email', () => {
        assert.equal(
            User.fromSession({
                idUser: 9
            }),
            null
        );
    });

    it('toSession throws for invalid users', () => {
        const user = User.fromPersistence({ idUser: 0, email: '' });
        assert.throws(() => user.toSession(), /Cannot serialize an invalid user/);
    });
});
