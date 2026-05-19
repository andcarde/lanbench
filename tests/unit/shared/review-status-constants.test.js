'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_RELEASED,
    REVIEW_EXPIRED,
    ALL_REVIEW_STATUSES,
    ACTIVE_REVIEW_STATUSES,
    TERMINAL_REVIEW_STATUSES,
    isValidReviewStatus
} = require('../../../constants/review-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('review-status constants (T4.1)', () => {
    it('exporta cada estado en minusculas con el string esperado', () => {
        assert.equal(REVIEW_PENDING, 'pending');
        assert.equal(REVIEW_IN_PROGRESS, 'in_progress');
        assert.equal(REVIEW_COMPLETED, 'completed');
        assert.equal(REVIEW_DISPUTED, 'disputed');
        assert.equal(REVIEW_RELEASED, 'released');
        assert.equal(REVIEW_EXPIRED, 'expired');
    });

    it('ALL_REVIEW_STATUSES enumera los seis estados', () => {
        assert.equal(ALL_REVIEW_STATUSES.length, 6);
        for (const value of [REVIEW_PENDING, REVIEW_IN_PROGRESS, REVIEW_COMPLETED, REVIEW_DISPUTED, REVIEW_RELEASED, REVIEW_EXPIRED])
            assert.ok(ALL_REVIEW_STATUSES.includes(value));
    });

    it('ACTIVE_REVIEW_STATUSES solo incluye estados en curso', () => {
        assert.deepEqual(ACTIVE_REVIEW_STATUSES, [REVIEW_PENDING, REVIEW_IN_PROGRESS]);
    });

    it('TERMINAL_REVIEW_STATUSES solo incluye estados terminales con resultado', () => {
        assert.deepEqual(TERMINAL_REVIEW_STATUSES, [REVIEW_COMPLETED, REVIEW_DISPUTED]);
    });

    it('isValidReviewStatus rechaza valores no listados', () => {
        assert.equal(isValidReviewStatus(REVIEW_PENDING), true);
        assert.equal(isValidReviewStatus('PENDING'), false);
        assert.equal(isValidReviewStatus(null), false);
        assert.equal(isValidReviewStatus('foo'), false);
    });
});
