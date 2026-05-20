'use strict';

/**
 * @file Valid decisions on a review (the reviewer's resolution).
 *
 * @typedef {import('../types/typedefs').ReviewDecision} ReviewDecision
 */

/** @type {'accepted'} The reviewer accepts the annotation without changes. */
const REVIEW_DECISION_ACCEPTED = 'accepted';
/** @type {'rejected'} The reviewer rejects the annotation. Requires a comment. */
const REVIEW_DECISION_REJECTED = 'rejected';
/** @type {'needs_fix'} The reviewer requests corrections. Requires a comment. */
const REVIEW_DECISION_NEEDS_FIX = 'needs_fix';

/**
 * Canonical list with all decisions.
 * @type {ReviewDecision[]}
 */
const ALL_REVIEW_DECISIONS = [
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED,
    REVIEW_DECISION_NEEDS_FIX
];

/**
 * Type-guard: returns true if the value is a valid review decision.
 *
 * @param {unknown} value
 * @returns {value is ReviewDecision}
 */
function isValidReviewDecision(value) {
    return typeof value === 'string'
        && /** @type {string[]} */ (ALL_REVIEW_DECISIONS).includes(value);
}

/**
 * Indicates whether a decision requires a mandatory comment.
 *
 * @param {ReviewDecision|string} value
 * @returns {boolean}
 */
function decisionRequiresComment(value) {
    return value === REVIEW_DECISION_REJECTED || value === REVIEW_DECISION_NEEDS_FIX;
}

module.exports = {
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED,
    REVIEW_DECISION_NEEDS_FIX,
    ALL_REVIEW_DECISIONS,
    isValidReviewDecision,
    decisionRequiresComment
};
