'use strict';

/**
 * @file Catalogue of criteria used in the annotation review process.
 *
 * Each criterion includes a stable code (for DB and APIs), a visible `label`
 * and a `description` shown to the reviewer.
 *
 * @typedef {import('../types/typedefs').ReviewCriterionCode} ReviewCriterionCode
 *
 * @typedef {Object} ReviewCriterion
 * @property {ReviewCriterionCode} code
 * @property {string} label
 * @property {string} description
 */

/** @type {'criterion_grammar'} */
const CRITERION_GRAMMAR = 'criterion_grammar';
/** @type {'criterion_coverage'} */
const CRITERION_COVERAGE = 'criterion_coverage';
/** @type {'criterion_diversity'} */
const CRITERION_DIVERSITY = 'criterion_diversity';
/** @type {'criterion_semantic_fidelity'} */
const CRITERION_SEMANTIC_FIDELITY = 'criterion_semantic_fidelity';

/**
 * Ordered, immutable list of criteria.
 * @type {ReadonlyArray<ReviewCriterion>}
 */
const ORDERED_CRITERIA = Object.freeze([
    {
        code: CRITERION_GRAMMAR,
        label: 'Gramática y ortografía',
        description: 'La frase es gramaticalmente correcta y no contiene errores ortográficos.'
    },
    {
        code: CRITERION_COVERAGE,
        label: 'Cobertura de triples',
        description: 'La frase cubre todos los triples relevantes de la entry.'
    },
    {
        code: CRITERION_DIVERSITY,
        label: 'Diversidad lingüística',
        description: 'Las frases del envío presentan suficiente variedad léxica y estructural.'
    },
    {
        code: CRITERION_SEMANTIC_FIDELITY,
        label: 'Fidelidad semántica',
        description: 'El contenido refleja fielmente la información del RDF y la referencia inglesa.'
    }
]);

/**
 * List of codes in the same order as {@link ORDERED_CRITERIA}.
 * @type {ReadonlyArray<ReviewCriterionCode>}
 */
const ALL_CRITERION_CODES = Object.freeze(ORDERED_CRITERIA.map(c => c.code));

/**
 * Returns a mutable copy of the ordered list of criteria.
 * Each criterion is itself a copy (not shared with the catalogue).
 *
 * @returns {ReviewCriterion[]}
 */
function getOrderedCriteria() {
    return ORDERED_CRITERIA.map(c => ({ ...c }));
}

/**
 * Returns a mutable copy of the list of codes.
 *
 * @returns {ReviewCriterionCode[]}
 */
function getOrderedCriterionCodes() {
    return ALL_CRITERION_CODES.slice();
}

/**
 * Type-guard: checks whether a value matches a known criterion code.
 *
 * @param {unknown} code
 * @returns {code is ReviewCriterionCode}
 */
function isValidCriterionCode(code) {
    return typeof code === 'string'
        && /** @type {ReadonlyArray<string>} */ (ALL_CRITERION_CODES).includes(code);
}

/**
 * Position of the criterion in the ordered list (or -1 if it does not exist).
 *
 * @param {string} code
 * @returns {number}
 */
function getCriterionIndex(code) {
    return /** @type {ReadonlyArray<string>} */ (ALL_CRITERION_CODES).indexOf(code);
}

module.exports = {
    CRITERION_GRAMMAR,
    CRITERION_COVERAGE,
    CRITERION_DIVERSITY,
    CRITERION_SEMANTIC_FIDELITY,
    ALL_CRITERION_CODES,
    getOrderedCriteria,
    getOrderedCriterionCodes,
    isValidCriterionCode,
    getCriterionIndex
};
