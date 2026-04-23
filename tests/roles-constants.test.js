'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    ROLE_ANNOTATOR,
    ROLE_REVIEWER,
    ROLE_ADMIN,
    ALL_ROLES,
    isValidRole
} = require('../constants/roles');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('constants/roles', () => {
    it('expone los tres roles canonicos', () => {
        assert.equal(ROLE_ANNOTATOR, 'annotator');
        assert.equal(ROLE_REVIEWER, 'reviewer');
        assert.equal(ROLE_ADMIN, 'admin');
    });

    it('ALL_ROLES contiene los tres roles y es inmutable', () => {
        assert.deepEqual([...ALL_ROLES], ['annotator', 'reviewer', 'admin']);
        assert.throws(() => {
            ALL_ROLES.push('hacker');
        });
    });

    it('isValidRole devuelve true solo para roles del catalogo', () => {
        assert.equal(isValidRole('annotator'), true);
        assert.equal(isValidRole('reviewer'), true);
        assert.equal(isValidRole('admin'), true);
    });

    it('isValidRole rechaza valores fuera del catalogo o de tipo incorrecto', () => {
        assert.equal(isValidRole(''), false);
        assert.equal(isValidRole('superuser'), false);
        assert.equal(isValidRole(null), false);
        assert.equal(isValidRole(undefined), false);
        assert.equal(isValidRole(123), false);
        assert.equal(isValidRole({ name: 'admin' }), false);
    });
});
