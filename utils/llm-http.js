'use strict';

/**
 * @file HTTP helpers shared by the LLM clients.
 *
 * Provides `fetchWithTimeout`, `extractJsonPayload` (a parser tolerant of
 * markdown code) and `removeTrailingSlashes`, all without external
 * dependencies to avoid redundant libraries.
 */

/**
 * Removes trailing slashes without regular expressions.
 * @param {string} value - Input text.
 * @returns {string} Text without trailing slashes.
 */
function removeTrailingSlashes(value) {
    let endIndex = value.length;
    while (endIndex > 0 && value[endIndex - 1] === '/')
        endIndex -= 1;
    return value.slice(0, endIndex);
}

/**
 * Defensively reads the textual body of a response.
 * @param {*} response - Fetch response.
 * @returns {Promise<string>} Text, or empty string.
 */
async function safeReadText(response) {
    try {
        return await response.text();
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        return `No se pudo leer el cuerpo de error: ${error.message}`;
    }
}

/**
 * Extracts and parses the first JSON found in a string.
 * @param {string} rawResponse - Raw text.
 * @param {string} providerName - Provider name for error messages.
 * @returns {*} JSON object.
 */
function extractJsonPayload(rawResponse, providerName) {
    const startIndex = rawResponse.indexOf('{');
    const endIndex = rawResponse.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
        throw new Error(`${providerName} no devolvió un JSON válido.`);

    try {
        return JSON.parse(rawResponse.substring(startIndex, endIndex + 1));
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        throw new Error(`No se pudo parsear el JSON de ${providerName}: ${error.message}`, { cause: caughtError });
    }
}

/**
 * Performs a fetch request with an abortable timeout. Returns the raw body text.
 * @param {*} options - URL, fetch init, timeout and provider.
 * @returns {Promise<*>} Response ready to parse.
 */
async function fetchWithTimeout({ url, init, timeoutMs, providerName }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (!response.ok) {
            const errorText = await safeReadText(response);
            throw new Error(`${providerName} respondió con ${response.status}: ${errorText || response.statusText}`);
        }

        return response;
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        if (error?.name === 'AbortError')
            throw new Error(`La petición a ${providerName} ha excedido el tiempo máximo de espera.`, { cause: caughtError });
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = {
    removeTrailingSlashes,
    extractJsonPayload,
    fetchWithTimeout
};
