'use strict';

/**
 * @file Groq client (`cloud` mode).
 *
 * Implements `generateJson` against Groq's OpenAI-compatible endpoint, sharing
 * the HTTP/timeout/JSON-extract primitives with `ollama-client` (via
 * `llm-http`).
 */

const config = require('../config');
const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Provider name (for error messages and logs). */
const PROVIDER_NAME = 'Groq';

/**
 * Calls Groq's OpenAI-compatible endpoint and returns parsed JSON.
 * @param {*} options - system, prompt and optional overrides.
 * @returns {Promise<*>} Parsed JSON of the response.
 */
async function generateJson({ system, prompt, model, apiBase, apiKey, timeoutMs }) {
    const normalizedApiBase = removeTrailingSlashes(String(apiBase || config.groq.apiBase));
    const normalizedModel = model || config.groq.model;
    const normalizedApiKey = apiKey || config.groq.apiKey;
    const normalizedTimeout = timeoutMs || config.groq.requestTimeoutMs;

    if (!normalizedApiKey)
        throw new Error('Falta GROQ_API_KEY: configura la API key de Groq en .env o variable de entorno.');

    const response = await fetchWithTimeout({
        url: `${normalizedApiBase}/chat/completions`,
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${normalizedApiKey}`
            },
            body: JSON.stringify({
                model: normalizedModel,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1
            })
        },
        timeoutMs: normalizedTimeout,
        providerName: PROVIDER_NAME
    });

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== 'string')
        throw new Error('La respuesta de Groq no contiene un campo choices[0].message.content válido.');

    return extractJsonPayload(content, PROVIDER_NAME);
}

module.exports = {
    generateJson
};
