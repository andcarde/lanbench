'use strict';

/**
 * @file Valid states of an entry's lifecycle (`entries` table).
 *
 * Typical transitions:
 *   `pending` -> `in_progress` -> `annotated` -> `under_review`
 *                                                      |
 *                                            +--> `reviewed`
 *                                            +--> `disputed`
 *
 * @typedef {import('../types/typedefs').EntryStatus} EntryStatus
 */

/** @type {'pending'} Entry with no annotation in progress. */
const ENTRY_PENDING = 'pending';
/** @type {'in_progress'} Entry assigned and being annotated. */
const ENTRY_IN_PROGRESS = 'in_progress';
/** @type {'annotated'} Entry annotated, pending review. */
const ENTRY_ANNOTATED = 'annotated';
/** @type {'under_review'} Entry under review by a reviewer. */
const ENTRY_UNDER_REVIEW = 'under_review';
/** @type {'reviewed'} Entry reviewed and accepted. */
const ENTRY_REVIEWED = 'reviewed';
/** @type {'disputed'} Entry with a disputed review. */
const ENTRY_DISPUTED = 'disputed';

/**
 * Canonical list with all entry states.
 * @type {EntryStatus[]}
 */
const ALL_ENTRY_STATUSES = [
    ENTRY_PENDING,
    ENTRY_IN_PROGRESS,
    ENTRY_ANNOTATED,
    ENTRY_UNDER_REVIEW,
    ENTRY_REVIEWED,
    ENTRY_DISPUTED
];

module.exports = {
    ENTRY_PENDING,
    ENTRY_IN_PROGRESS,
    ENTRY_ANNOTATED,
    ENTRY_UNDER_REVIEW,
    ENTRY_REVIEWED,
    ENTRY_DISPUTED,
    ALL_ENTRY_STATUSES
};
