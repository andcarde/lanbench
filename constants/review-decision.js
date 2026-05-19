'use strict';

/**
 * @file Decisiones validas sobre una review (resolucion del revisor).
 *
 * @typedef {import('../types/typedefs').ReviewDecision} ReviewDecision
 */

/** @type {'accepted'} El revisor acepta la anotacion sin cambios. */
const REVIEW_DECISION_ACCEPTED = 'accepted';
/** @type {'rejected'} El revisor rechaza la anotacion. Requiere comentario. */
const REVIEW_DECISION_REJECTED = 'rejected';
/** @type {'needs_fix'} El revisor pide correcciones. Requiere comentario. */
const REVIEW_DECISION_NEEDS_FIX = 'needs_fix';

/**
 * Lista canonica con todas las decisiones.
 * @type {ReviewDecision[]}
 */
const ALL_REVIEW_DECISIONS = [
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED,
    REVIEW_DECISION_NEEDS_FIX
];

/**
 * Type-guard: devuelve true si el valor es una decision de revision valida.
 *
 * @param {unknown} value
 * @returns {value is ReviewDecision}
 */
function isValidReviewDecision(value) {
    return typeof value === 'string'
        && /** @type {string[]} */ (ALL_REVIEW_DECISIONS).includes(value);
}

/**
 * Indica si una decision requiere comentario obligatorio.
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
