'use strict';

/**
 * @file Estados validos del ciclo de vida de una entry (tabla `entries`).
 *
 * Transiciones tipicas:
 *   `pending` -> `in_progress` -> `annotated` -> `under_review`
 *                                                      |
 *                                            +--> `reviewed`
 *                                            +--> `disputed`
 *
 * @typedef {import('../types/typedefs').EntryStatus} EntryStatus
 */

/** @type {'pending'} Entry sin anotacion en curso. */
const ENTRY_PENDING = 'pending';
/** @type {'in_progress'} Entry asignada y en anotacion. */
const ENTRY_IN_PROGRESS = 'in_progress';
/** @type {'annotated'} Entry anotada, pendiente de revision. */
const ENTRY_ANNOTATED = 'annotated';
/** @type {'under_review'} Entry en revision por un reviewer. */
const ENTRY_UNDER_REVIEW = 'under_review';
/** @type {'reviewed'} Entry revisada y aceptada. */
const ENTRY_REVIEWED = 'reviewed';
/** @type {'disputed'} Entry con review en disputa. */
const ENTRY_DISPUTED = 'disputed';

/**
 * Lista canonica con todos los estados de entry.
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
