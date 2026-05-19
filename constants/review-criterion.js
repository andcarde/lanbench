'use strict';

/**
 * @file Catalogo de criterios usados en el proceso de revision de anotaciones.
 *
 * Cada criterio incluye un codigo estable (para BD y APIs), un `label`
 * visible y una `description` mostrada al revisor.
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
 * Lista ordenada e inmutable de criterios.
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
 * Lista de codigos en el mismo orden que {@link ORDERED_CRITERIA}.
 * @type {ReadonlyArray<ReviewCriterionCode>}
 */
const ALL_CRITERION_CODES = Object.freeze(ORDERED_CRITERIA.map(c => c.code));

/**
 * Devuelve una copia mutable de la lista ordenada de criterios.
 * Cada criterio es a su vez una copia (no compartida con el catalogo).
 *
 * @returns {ReviewCriterion[]}
 */
function getOrderedCriteria() {
    return ORDERED_CRITERIA.map(c => ({ ...c }));
}

/**
 * Devuelve una copia mutable de la lista de codigos.
 *
 * @returns {ReviewCriterionCode[]}
 */
function getOrderedCriterionCodes() {
    return ALL_CRITERION_CODES.slice();
}

/**
 * Type-guard: comprueba si un valor coincide con un codigo de criterio
 * conocido.
 *
 * @param {unknown} code
 * @returns {code is ReviewCriterionCode}
 */
function isValidCriterionCode(code) {
    return typeof code === 'string'
        && /** @type {ReadonlyArray<string>} */ (ALL_CRITERION_CODES).includes(code);
}

/**
 * Posicion del criterio en la lista ordenada (o -1 si no existe).
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
