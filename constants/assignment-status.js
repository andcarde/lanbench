'use strict';

/**
 * @file Valid states of a section assignment to an annotator/reviewer.
 *
 * The lifecycle is:
 *   `active` -> `completed` | `released` | `expired`
 *
 * @typedef {import('../types/typedefs').AssignmentStatus} AssignmentStatus
 */

/** @type {'active'} The assignment is still open. */
const ASSIGNMENT_ACTIVE = 'active';
/** @type {'completed'} The annotator finished the section. */
const ASSIGNMENT_COMPLETED = 'completed';
/** @type {'expired'} The assignment expired due to inactivity. */
const ASSIGNMENT_EXPIRED = 'expired';
/** @type {'released'} The annotator returned the assignment without completing it. */
const ASSIGNMENT_RELEASED = 'released';

/**
 * Canonical list with all assignment states.
 * @type {AssignmentStatus[]}
 */
const ALL_ASSIGNMENT_STATUSES = [
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED,
    ASSIGNMENT_RELEASED
];

module.exports = {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED,
    ASSIGNMENT_RELEASED,
    ALL_ASSIGNMENT_STATUSES
};
