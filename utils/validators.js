'use strict';

/**
 * @file General-purpose validators and numeric coercions.
 *
 * These functions are the primitives invoked in cascade across
 * mappers/dto-mappers, controllers and services. Keeping them here avoids
 * divergent versions in each module.
 */

/**
 * Converts to a positive integer, or returns `null`.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

/**
 * Converts to an integer >= 0. Accepts any finite number; truncates decimals
 * and applies `max(0, ...)`. Returns `0` if the value is not numeric.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toIntegerNormalized(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;

    const integer = Math.trunc(parsed);
    return Math.max(integer, 0);
}

/**
 * Returns the text `value.trim()` when `value` is a non-empty string after
 * trimming; otherwise returns `fallback` (default `null`). It is the
 * primitive that controllers, services and mappers rely on to clean
 * optional/required strings.
 *
 * @param {unknown} value
 * @param {*} [fallback=null]
 * @returns {*}
 */
function trimmedOr(value, fallback = null) {
    if (typeof value !== 'string')
        return fallback;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

/** Tokens accepted as truthy booleans in strings. */
const TRUE_TOKENS = new Set(['true', '1']);
/** Tokens accepted as falsy booleans in strings. */
const FALSE_TOKENS = new Set(['false', '0']);

/**
 * Converts a value into a canonical boolean. Accepts native `boolean`s, the
 * numbers `0`/`1`, and the strings `'true'`/`'1'`/`'false'`/`'0'` (with
 * `trim().toLowerCase()`). Any other value (including `null`/`undefined`)
 * returns `fallback` (default `null`).
 *
 * @param {unknown} value
 * @param {*} [fallback=null]
 * @returns {*}
 */
function toBoolean(value, fallback = null) {
    if (typeof value === 'boolean')
        return value;
    if (value === 1)
        return true;
    if (value === 0)
        return false;
    if (typeof value === 'string') {
        const token = value.trim().toLowerCase();
        if (TRUE_TOKENS.has(token))
            return true;
        if (FALSE_TOKENS.has(token))
            return false;
    }
    return fallback;
}

/**
 * Normalizes an email by applying `trim().toLowerCase()` when it receives a
 * string with useful content; otherwise returns `fallback` (default `null`).
 * It is the single canonical source of email normalization for
 * entity/service/repository.
 *
 * @param {unknown} value
 * @param {*} [fallback=null]
 * @returns {*}
 */
function normalizeEmail(value, fallback = null) {
    const trimmed = trimmedOr(value, null);
    return trimmed === null ? fallback : trimmed.toLowerCase();
}

/**
 * Normalizes a percentage to the range `[0, 100]`. Non-numeric values -> `0`.
 *
 * @param {unknown} value
 * @returns {number}
 */
function normalizePercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    if (parsed < 0)
        return 0;
    if (parsed > 100)
        return 100;
    return parsed;
}

/**
 * Checks that `value` is an array where every element is a non-empty string
 * after `trim()`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringArray(value) {
    if (!Array.isArray(value))
        return false;
    return value.every((/** @type {unknown} */ item) => typeof item === 'string' && /** @type {string} */ (item).trim().length > 0);
}

/**
 * Defensively extracts the message from an error. If `error` does not look
 * like an Error, returns `'Error desconocido'`.
 *
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
    if (error && typeof error === 'object' && typeof /** @type {*} */ (error).message === 'string')
        return /** @type {*} */ (error).message;
    return 'Error desconocido';
}

module.exports = {
    toPositiveInteger,
    toIntegerNormalized,
    trimmedOr,
    normalizeEmail,
    toBoolean,
    normalizePercent,
    isStringArray,
    getErrorMessage
};
