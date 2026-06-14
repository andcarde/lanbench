'use strict';

/**
 * @file Native Anthropic client (Messages API).
 *
 * Anthropic does not expose the OpenAI `/chat/completions` shape, so this
 * adapter speaks the native `/v1/messages` schema and normalises the response
 * back to the homogeneous contract used by the rest of the app: `generateJson`
 * returns parsed JSON, `generateText` returns the raw model text.
 *
 * The provider does not have a native JSON mode, so `generateJson` relies on
 * the prompt asking for JSON and extracts the first JSON object from the text
 * (the same tolerant strategy as the OpenAI-compatible/Ollama clients).
 */

const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Provider name (for error messages and logs). */
const PROVIDER_NAME = 'Anthropic';
/** Default Messages API base when the credential does not override it. */
const DEFAULT_API_BASE = 'https://api.anthropic.com';
/** Anthropic API version header value. */
const ANTHROPIC_VERSION = '2023-06-01';
/** Default cap on output tokens. */
const DEFAULT_MAX_TOKENS = 1024;
/** Default timeout when none is provided. */
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Calls the Anthropic Messages API and returns the concatenated text blocks.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number, maxTokens?:number }} options
 * @returns {Promise<string>} The model's text content.
 */
async function callMessages({ system, prompt, model, apiBase, apiKey, timeoutMs, maxTokens }) {
    const normalizedApiBase = removeTrailingSlashes(String(apiBase || DEFAULT_API_BASE));
    const normalizedTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;

    if (!model)
        throw new Error(`Falta el modelo del proveedor ${PROVIDER_NAME}.`);
    if (!apiKey)
        throw new Error(`Falta la API key del proveedor ${PROVIDER_NAME}.`);

    /** @type {Record<string, any>} */
    const body = {
        model,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }]
    };

    if (typeof system === 'string' && system.length > 0)
        body.system = system;

    const response = await fetchWithTimeout({
        url: `${normalizedApiBase}/v1/messages`,
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION
            },
            body: JSON.stringify(body)
        },
        timeoutMs: normalizedTimeout,
        providerName: PROVIDER_NAME
    });

    const payload = await response.json();
    const text = extractTextFromContent(payload?.content);

    if (typeof text !== 'string')
        throw new Error(`La respuesta de ${PROVIDER_NAME} no contiene bloques de texto válidos.`);

    return text;
}

/**
 * Concatenates the `text` blocks of an Anthropic `content` array.
 *
 * @param {*} content - The `content` field of the Messages response.
 * @returns {string|null} Concatenated text, or `null` if none.
 */
function extractTextFromContent(content) {
    if (!Array.isArray(content))
        return null;

    const text = content
        .filter((/** @type {*} */ block) => block && block.type === 'text' && typeof block.text === 'string')
        .map((/** @type {*} */ block) => block.text)
        .join('');

    return text.length > 0 ? text : null;
}

/**
 * Calls Anthropic and returns parsed JSON extracted from the response text.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number }} options
 * @returns {Promise<*>} Parsed JSON of the response.
 */
async function generateJson(options) {
    const text = await callMessages(options);
    return extractJsonPayload(text, PROVIDER_NAME);
}

/**
 * Calls Anthropic in free-text mode and returns the raw model text.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number }} options
 * @returns {Promise<string>} Raw text returned by the model.
 */
async function generateText(options) {
    return callMessages(options);
}

module.exports = {
    generateJson,
    generateText
};
