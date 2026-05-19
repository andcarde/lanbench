'use strict';

/**
 * @file Construccion y combinacion de alertas de validacion.
 *
 * Una `ValidationAlert` describe un problema detectado sobre una oracion:
 * codigo (`spelling_error`, `semantic_mismatch`, ...), tipo
 * (`semantic`/`grammar`/...), severidad y mensaje legible. Estas funciones
 * actuan como factoria + fusion (`mergeAlerts`).
 */

/** Codigo por defecto cuando el origen no aporta uno. */
const DEFAULT_CODE = 'sentence_review';
/** Tipo de incidencia por defecto. */
const DEFAULT_TYPE = 'semantic';
/** Severidad por defecto cuando no se especifica. */
const DEFAULT_SEVERITY = 'warning';
/** Fuente que origino la alerta (LLM + reglas combinadas). */
const DEFAULT_SOURCE = 'hybrid';
/** Mensaje legible por defecto. */
const DEFAULT_MESSAGE = 'La oración requiere revisión.';

/**
 * Construye una alerta normalizada con defaults coherentes.
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
        code: normalizeString(code, DEFAULT_CODE),
        type: normalizeType(type),
        severity: normalizeSeverity(severity),
        source: normalizeSource(source),
        message: normalizeString(message, DEFAULT_MESSAGE)
    };

    const normalizedSuggestion = normalizeOptionalString(suggestion);
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
 * Combina varias listas de alertas en una sola, filtrando entradas no validas.
 * @param {...Array<*>} groups - Conjuntos de alertas (cualquier objeto plano).
 * @returns {Array<*>} Lista combinada y normalizada.
 */
function mergeAlerts(/** @type {Array<Array<*>>} */ ...groups) {
    return groups.flat().filter(isValidationAlertLike).map(buildValidationAlert);
}

/**
 * Comprueba si un valor parece una alerta (objeto plano no nulo).
 * @param {*} value - Valor candidato.
 * @returns {boolean} True si es un objeto plano.
 */
function isValidationAlertLike(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Devuelve el tipo si es permitido o el default.
 * @param {*} value - Tipo recibido.
 * @returns {string} Tipo normalizado.
 */
function normalizeType(value) {
    const allowed = ['orthography', 'grammar', 'semantic', 'coverage', 'diversity'];
    return allowed.includes(value) ? value : DEFAULT_TYPE;
}

/**
 * Devuelve la severidad si es permitida o el default.
 * @param {*} value - Severidad recibida.
 * @returns {string} Severidad normalizada.
 */
function normalizeSeverity(value) {
    const allowed = ['info', 'warning', 'error', 'duplicate'];
    return allowed.includes(value) ? value : DEFAULT_SEVERITY;
}

/**
 * Devuelve la fuente si es permitida o el default.
 * @param {*} value - Fuente recibida.
 * @returns {string} Fuente normalizada.
 */
function normalizeSource(value) {
    const allowed = ['rules', 'llm', 'hybrid'];
    return allowed.includes(value) ? value : DEFAULT_SOURCE;
}

/**
 * Devuelve `value` recortado o `fallback` si no es una cadena util.
 * @param {*} value - Valor candidato.
 * @param {*} fallback - Valor de respaldo.
 * @returns {*} Cadena recortada o fallback.
 */
function normalizeString(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Devuelve `value` recortado o null si no es una cadena no vacia.
 * @param {*} value - Valor candidato.
 * @returns {?string} Cadena recortada o null.
 */
function normalizeOptionalString(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

module.exports = {
    buildValidationAlert,
    mergeAlerts
};
