'use strict';

/**
 * @file Catalogue of criteria used in the annotation review process.
 *
 * The reviewer flow evaluates two distinct families of criteria (see `US-13`
 * and TECHNICAL-DESIGN.md §2.6 / §4.2):
 *
 *   - **Per-phrase criteria** ({@link PHRASE_CRITERIA}): judged independently
 *     for every annotated sentence of the entry. Each annotated sentence keeps
 *     its own decision for every one of these five criteria.
 *   - **Review-level criteria** ({@link REVIEW_CRITERIA}): decided once for the
 *     whole entry because they are inherently comparative across sentences.
 *     `diversity` (lexical variety across the set of phrases) is the only one.
 *
 * Each criterion exposes a stable `code` (used in the DB and the API), a
 * visible `label` and a `description` shown to the reviewer.
 *
 * @typedef {import('../types/typedefs').ReviewCriterionCode} ReviewCriterionCode
 *
 * @typedef {Object} ReviewCriterion
 * @property {ReviewCriterionCode} code
 * @property {string} label
 * @property {string} description
 */

/**
 * Per-phrase evaluation criteria, in the order the wizard presents them. The
 * next criterion of a phrase stays locked until the current one is decided.
 * @type {ReadonlyArray<ReviewCriterion>}
 */
const PHRASE_CRITERIA = Object.freeze(/** @type {ReviewCriterion[]} */ ([
    {
        code: 'naturalness',
        label: 'Naturalidad',
        description: '¿La frase suena natural para una persona hispanohablante?'
    },
    {
        code: 'fluency',
        label: 'Fluidez',
        description: '¿La redacción de la frase es fluida y gramaticalmente correcta?'
    },
    {
        code: 'adequacy',
        label: 'Adecuación',
        description: '¿El significado de la frase se corresponde con los triples y la referencia?'
    },
    {
        code: 'completeness',
        label: 'Completitud',
        description: '¿La frase expresa toda la información relevante que le corresponde?'
    },
    {
        code: 'coverage',
        label: 'Cobertura',
        description: '¿La frase cubre los triples que le atañen?'
    }
]).map(c => Object.freeze(c)));

/**
 * Review-level criteria, decided once for the whole entry. `diversity` is
 * comparative across all the sentences, so it is not evaluated per phrase.
 * @type {ReadonlyArray<ReviewCriterion>}
 */
const REVIEW_CRITERIA = Object.freeze(/** @type {ReviewCriterion[]} */ ([
    {
        code: 'diversity',
        label: 'Diversidad',
        description: '¿El conjunto de frases aporta variedad léxica? (criterio global de la entry)'
    }
]).map(c => Object.freeze(c)));

/** @type {ReadonlyArray<ReviewCriterionCode>} */
const PHRASE_CRITERION_CODES = Object.freeze(PHRASE_CRITERIA.map(c => c.code));
/** @type {ReadonlyArray<ReviewCriterionCode>} */
const REVIEW_CRITERION_CODES = Object.freeze(REVIEW_CRITERIA.map(c => c.code));
/** @type {ReadonlyArray<ReviewCriterionCode>} */
const ALL_CRITERION_CODES = Object.freeze([...PHRASE_CRITERION_CODES, ...REVIEW_CRITERION_CODES]);

/**
 * Returns a mutable copy of the per-phrase criteria (each criterion copied).
 * @returns {ReviewCriterion[]}
 */
function getPhraseCriteria() {
    return PHRASE_CRITERIA.map(c => ({ ...c }));
}

/**
 * Returns a mutable copy of the review-level criteria (each criterion copied).
 * @returns {ReviewCriterion[]}
 */
function getReviewCriteria() {
    return REVIEW_CRITERIA.map(c => ({ ...c }));
}

/**
 * Returns a mutable copy of the per-phrase criterion codes, in order.
 * @returns {ReviewCriterionCode[]}
 */
function getPhraseCriterionCodes() {
    return PHRASE_CRITERION_CODES.slice();
}

/**
 * Returns a mutable copy of the review-level criterion codes, in order.
 * @returns {ReviewCriterionCode[]}
 */
function getReviewCriterionCodes() {
    return REVIEW_CRITERION_CODES.slice();
}

/**
 * Type-guard: whether the code is a per-phrase criterion.
 * @param {unknown} code
 * @returns {code is ReviewCriterionCode}
 */
function isPhraseCriterion(code) {
    return typeof code === 'string'
        && /** @type {ReadonlyArray<string>} */ (PHRASE_CRITERION_CODES).includes(code);
}

/**
 * Type-guard: whether the code is a review-level criterion.
 * @param {unknown} code
 * @returns {code is ReviewCriterionCode}
 */
function isReviewCriterion(code) {
    return typeof code === 'string'
        && /** @type {ReadonlyArray<string>} */ (REVIEW_CRITERION_CODES).includes(code);
}

/**
 * Type-guard: whether the code is a known criterion (phrase or review-level).
 * @param {unknown} code
 * @returns {code is ReviewCriterionCode}
 */
function isValidCriterionCode(code) {
    return typeof code === 'string'
        && /** @type {ReadonlyArray<string>} */ (ALL_CRITERION_CODES).includes(code);
}

/**
 * Position of a per-phrase criterion in {@link PHRASE_CRITERIA} (or -1). Used by
 * the per-phrase wizard guard to keep later criteria of a phrase locked.
 * @param {string} code
 * @returns {number}
 */
function getPhraseCriterionIndex(code) {
    return /** @type {ReadonlyArray<string>} */ (PHRASE_CRITERION_CODES).indexOf(code);
}

module.exports = {
    PHRASE_CRITERIA,
    REVIEW_CRITERIA,
    PHRASE_CRITERION_CODES,
    REVIEW_CRITERION_CODES,
    ALL_CRITERION_CODES,
    getPhraseCriteria,
    getReviewCriteria,
    getPhraseCriterionCodes,
    getReviewCriterionCodes,
    isPhraseCriterion,
    isReviewCriterion,
    isValidCriterionCode,
    getPhraseCriterionIndex
};
