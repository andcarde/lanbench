'use strict';

/**
 * @file Validadores y coerciones numericas de uso general.
 *
 * Estas funciones son las primitivas que se invocan en cascada en
 * mappers/dto-mappers, controllers y servicios. Mantenerlas aqui evita
 * versiones divergentes en cada modulo.
 */

/**
 * Convierte a entero positivo o devuelve `null`.
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
 * Convierte a entero >= 0. Acepta cualquier numero finito; trunca decimales
 * y aplica `max(0, ...)`. Devuelve `0` si el valor no es numerico.
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
 * Normaliza un porcentaje al rango `[0, 100]`. Valores no numericos -> `0`.
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
 * Comprueba que `value` es un array donde cada elemento es una cadena no
 * vacia tras `trim()`.
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
 * Extrae el mensaje de un error de forma defensiva. Si `error` no parece
 * un Error, devuelve `'Error desconocido'`.
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
    normalizePercent,
    isStringArray,
    getErrorMessage
};
