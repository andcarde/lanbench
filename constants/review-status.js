'use strict';

/**
 * @file Estados validos del ciclo de vida de una review.
 *
 * Particiones utiles:
 *   - {@link ACTIVE_REVIEW_STATUSES}: revisiones aun abiertas.
 *   - {@link TERMINAL_REVIEW_STATUSES}: revisiones cerradas con resolucion.
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
 * Lista canonica con todos los estados de revision.
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
 * Estados que representan una revision aun en curso.
 * @type {ReviewStatus[]}
 */
const ACTIVE_REVIEW_STATUSES = [REVIEW_PENDING, REVIEW_IN_PROGRESS];

/**
 * Estados que representan una revision cerrada con resolucion.
 * @type {ReviewStatus[]}
 */
const TERMINAL_REVIEW_STATUSES = [REVIEW_COMPLETED, REVIEW_DISPUTED];

/**
 * Type-guard: comprueba si el valor es un estado de revision conocido.
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
