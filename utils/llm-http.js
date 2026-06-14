'use strict';

/**
 * @file HTTP helpers shared by the LLM clients.
 *
 * Provides `fetchWithTimeout`, `extractJsonPayload` (a parser tolerant of
 * markdown code) and `removeTrailingSlashes`, all without external
 * dependencies to avoid redundant libraries.
 *
 * Every call routed through `fetchWithTimeout` is also recorded in the
 * daily LLM log (`logs/YYYY-MM-DD-llm.txt`) with a correlation id that
 * pairs each REQUEST with its RESPONSE.
 */

const llmLogger = require('./llm-logger');

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
 * Defensively reads the textual body of a response. When the response only
 * exposes `.json()` (test stubs), the parsed value is re-serialised so the
 * caller still receives a string.
 *
 * @param {*} response - Fetch response.
 * @returns {Promise<string>} Text, or empty string.
 */
async function safeReadText(response) {
    try {
        if (typeof response?.text === 'function')
            return await response.text();
        if (typeof response?.json === 'function')
            return JSON.stringify(await response.json());
        return '';
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
 * Performs a fetch request with an abortable timeout. Returns a response-like
 * object whose body has already been read once, so callers can call `.json()`
 * or `.text()` exactly like with a native `Response`.
 *
 * Side effect: emits one REQUEST entry before the fetch and one matching
 * RESPONSE entry after it (success, HTTP error, or timeout) into the daily
 * LLM log, both sharing a correlation id.
 *
 * @param {*} options - URL, fetch init, timeout and provider.
 * @returns {Promise<*>} Response ready to parse.
 */
async function fetchWithTimeout({ url, init, timeoutMs, providerName }) {
    const correlationId = llmLogger.generateCorrelationId();
    const requestBody = typeof init?.body === 'string' ? init.body : undefined;

    llmLogger.logLlmRequest({ correlationId, url, providerName, requestBody });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const bodyText = await safeReadText(response);
        const durationMs = Date.now() - startedAt;

        if (!response.ok) {
            llmLogger.logLlmResponse({
                correlationId, url, providerName, requestBody,
                status: response.status, bodyText, durationMs
            });
            const detail = summarizeProviderErrorBody(bodyText, response);
            throw new Error(`${providerName} respondió con ${response.status}: ${detail || response.statusText}`);
        }

        llmLogger.logLlmResponse({
            correlationId, url, providerName, requestBody,
            status: response.status, bodyText, durationMs
        });

        return buildResponseFromText(response, bodyText);
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        const durationMs = Date.now() - startedAt;

        if (error?.name === 'AbortError') {
            llmLogger.logLlmResponse({
                correlationId, url, providerName, requestBody,
                durationMs, error: 'timeout'
            });
            throw new Error(`La petición a ${providerName} ha excedido el tiempo máximo de espera.`, { cause: caughtError });
        }

        // The HTTP-error branch above already logged before re-throwing the
        // matching Error, so we only log here when the error originated outside
        // of the response read (network failure, DNS, etc.).
        if (!/respondió con \d+/.test(String(error?.message))) {
            llmLogger.logLlmResponse({
                correlationId, url, providerName, requestBody,
                durationMs, error: error?.message || String(error)
            });
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Builds a response-like object whose body has already been consumed once
 * and is therefore replayable via `.json()` / `.text()` without re-reading
 * the underlying stream.
 *
 * @param {*} response - Original fetch response (for status/headers).
 * @param {string} bodyText - Body text already read from `response`.
 * @returns {*}
 */
function buildResponseFromText(response, bodyText) {
    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        async text() { return bodyText; },
        async json() { return JSON.parse(bodyText); }
    };
}

/**
 * Builds a short, user-facing detail string for an HTTP error body. When the
 * body looks like an HTML page (typical of a website instead of an API
 * endpoint, e.g. `console.groq.com` instead of `api.groq.com/openai/v1`), we
 * replace the raw markup with a hint pointing at the misconfigured URL.
 *
 * @param {string} body - Raw response body.
 * @param {Response} response - Fetch response (for the Content-Type header).
 * @returns {string} Short detail.
 */
function summarizeProviderErrorBody(body, response) {
    const contentType = response.headers?.get?.('content-type') || '';
    const isHtml = contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(body);
    if (isHtml)
        return 'la URL no parece un endpoint de chat completions (la respuesta es HTML). Revisa la URL base de la credencial: para Groq es https://api.groq.com/openai/v1';

    return body;
}

module.exports = {
    removeTrailingSlashes,
    extractJsonPayload,
    fetchWithTimeout
};
