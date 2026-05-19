'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED,
    REVIEW_DECISION_NEEDS_FIX,
    ALL_REVIEW_DECISIONS,
    isValidReviewDecision,
    decisionRequiresComment
} = require('../../../constants/review-decision');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('review-decision constants (T4.1)', () => {
    it('exporta cada decision con el string esperado', () => {
        assert.equal(REVIEW_DECISION_ACCEPTED, 'accepted');
        assert.equal(REVIEW_DECISION_REJECTED, 'rejected');
        assert.equal(REVIEW_DECISION_NEEDS_FIX, 'needs_fix');
    });

    it('ALL_REVIEW_DECISIONS enumera las tres decisiones', () => {
        assert.deepEqual(ALL_REVIEW_DECISIONS.slice().sort(), ['accepted', 'needs_fix', 'rejected']);
    });

    it('isValidReviewDecision filtra valores no listados', () => {
        assert.equal(isValidReviewDecision('accepted'), true);
        assert.equal(isValidReviewDecision('Accepted'), false);
        assert.equal(isValidReviewDecision(undefined), false);
    });

    it('decisionRequiresComment es true para rejected y needs_fix', () => {
        assert.equal(decisionRequiresComment(REVIEW_DECISION_ACCEPTED), false);
        assert.equal(decisionRequiresComment(REVIEW_DECISION_REJECTED), true);
        assert.equal(decisionRequiresComment(REVIEW_DECISION_NEEDS_FIX), true);
        assert.equal(decisionRequiresComment('foo'), false);
    });
});
