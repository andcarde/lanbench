'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED,
    ASSIGNMENT_RELEASED,
    ALL_ASSIGNMENT_STATUSES
} = require('../../../constants/assignment-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('assignment-status constants', () => {
    it('exporta los cuatro valores de estado de asignación', () => {
        assert.equal(ASSIGNMENT_ACTIVE, 'active');
        assert.equal(ASSIGNMENT_COMPLETED, 'completed');
        assert.equal(ASSIGNMENT_EXPIRED, 'expired');
        assert.equal(ASSIGNMENT_RELEASED, 'released');
    });

    it('ALL_ASSIGNMENT_STATUSES contiene exactamente los cuatro estados', () => {
        assert.equal(ALL_ASSIGNMENT_STATUSES.length, 4);
        assert.ok(ALL_ASSIGNMENT_STATUSES.includes(ASSIGNMENT_ACTIVE));
        assert.ok(ALL_ASSIGNMENT_STATUSES.includes(ASSIGNMENT_COMPLETED));
        assert.ok(ALL_ASSIGNMENT_STATUSES.includes(ASSIGNMENT_EXPIRED));
        assert.ok(ALL_ASSIGNMENT_STATUSES.includes(ASSIGNMENT_RELEASED));
    });
});
