'use strict';

/**
 * @file Construction and combination of validation alerts.
 *
 * A `ValidationAlert` describes a problem detected on a sentence: code
 * (`spelling_error`, `semantic_mismatch`, ...), type
 * (`semantic`/`grammar`/...), severity and human-readable message. These
 * functions act as a factory + merger (`mergeAlerts`).
 */

/** Default code when the source does not provide one. */
const DEFAULT_CODE = 'sentence_review';
/** Default issue type. */
const DEFAULT_TYPE = 'semantic';
/** Default severity when not specified. */
const DEFAULT_SEVERITY = 'warning';
/** Source that originated the alert (LLM + rules combined). */
const DEFAULT_SOURCE = 'hybrid';
/** Default human-readable message. */
const DEFAULT_MESSAGE = 'La oración requiere revisión.';

const { trimmedOr } = require('./validators');

/**
 * Builds a normalized alert with coherent defaults.
 *
 * @param {Record<string, any>} [input]
 * @returns {Record<string, any>}
 */
function buildValidationAlert({
    code = DEFAULT_CODE,
    type = DEFAULT_TYPE,
    severity = DEFAULT_SEVERITY,
    source = DEFAULT_SOURCE,
    message = DEFAULT_MESSAGE,
    suggestion = null,
    referenceAvailable = null,
    lowConfidence = null,
    metadata = null
} = {}) {
    /** @type {Record<string, any>} */
    const alert = {
        code: trimmedOr(code, DEFAULT_CODE),
        type: normalizeType(type),
        severity: normalizeSeverity(severity),
        source: normalizeSource(source),
        message: trimmedOr(message, DEFAULT_MESSAGE)
    };

    const normalizedSuggestion = trimmedOr(suggestion);
    if (normalizedSuggestion)
        alert.suggestion = normalizedSuggestion;

    if (typeof referenceAvailable === 'boolean')
        alert.referenceAvailable = referenceAvailable;

    if (typeof lowConfidence === 'boolean')
        alert.lowConfidence = lowConfidence;

    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
        alert.metadata = metadata;

    return alert;
}

/**
 * Combines several alert lists into one, filtering out invalid entries.
 * @param {...Array<*>} groups - Sets of alerts (any plain object).
 * @returns {Array<*>} Combined, normalized list.
 */
function mergeAlerts(/** @type {Array<Array<*>>} */ ...groups) {
    return groups.flat().filter(isValidationAlertLike).map(buildValidationAlert);
}

/**
 * Checks whether a value looks like an alert (non-null plain object).
 * @param {*} value - Candidate value.
 * @returns {boolean} True if it is a plain object.
 */
function isValidationAlertLike(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Returns the type if allowed, otherwise the default.
 * @param {*} value - Received type.
 * @returns {string} Normalized type.
 */
function normalizeType(value) {
    const allowed = ['orthography', 'grammar', 'semantic', 'coverage', 'diversity'];
    return allowed.includes(value) ? value : DEFAULT_TYPE;
}

/**
 * Returns the severity if allowed, otherwise the default.
 * @param {*} value - Received severity.
 * @returns {string} Normalized severity.
 */
function normalizeSeverity(value) {
    const allowed = ['info', 'warning', 'error', 'duplicate'];
    return allowed.includes(value) ? value : DEFAULT_SEVERITY;
}

/**
 * Returns the source if allowed, otherwise the default.
 * @param {*} value - Received source.
 * @returns {string} Normalized source.
 */
function normalizeSource(value) {
    const allowed = ['rules', 'llm', 'hybrid'];
    return allowed.includes(value) ? value : DEFAULT_SOURCE;
}

module.exports = {
    buildValidationAlert,
    mergeAlerts
};
