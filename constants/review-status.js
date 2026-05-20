'use strict';

/**
 * @file Valid states of a review's lifecycle.
 *
 * Useful partitions:
 *   - {@link ACTIVE_REVIEW_STATUSES}: reviews still open.
 *   - {@link TERMINAL_REVIEW_STATUSES}: reviews closed with a resolution.
 *
 * @typedef {import('../types/typedefs').ReviewStatus} ReviewStatus
 */

/** @type {'pending'} */
const REVIEW_PENDING = 'pending';
/** @type {'in_progress'} */
const REVIEW_IN_PROGRESS = 'in_progress';
/** @type {'completed'} */
const REVIEW_COMPLETED = 'completed';
/** @type {'disputed'} */
const REVIEW_DISPUTED = 'disputed';
/** @type {'released'} */
const REVIEW_RELEASED = 'released';
/** @type {'expired'} */
const REVIEW_EXPIRED = 'expired';

/**
 * Canonical list with all review states.
 * @type {ReviewStatus[]}
 */
const ALL_REVIEW_STATUSES = [
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_RELEASED,
    REVIEW_EXPIRED
];

/**
 * States representing a review still in progress.
 * @type {ReviewStatus[]}
 */
const ACTIVE_REVIEW_STATUSES = [REVIEW_PENDING, REVIEW_IN_PROGRESS];

/**
 * States representing a review closed with a resolution.
 * @type {ReviewStatus[]}
 */
const TERMINAL_REVIEW_STATUSES = [REVIEW_COMPLETED, REVIEW_DISPUTED];

/**
 * Type-guard: checks whether the value is a known review state.
 *
 * @param {unknown} value
 * @returns {value is ReviewStatus}
 */
function isValidReviewStatus(value) {
    return typeof value === 'string'
        && /** @type {string[]} */ (ALL_REVIEW_STATUSES).includes(value);
}

module.exports = {
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
};
