'use strict';

/**
 * @file Ollama client (`local` mode).
 *
 * Implements `generateJson` against the `/api/generate` endpoint of a local
 * Ollama server. Shares primitives with `groq-client` via `llm-http`.
 */

const config = require('../config');
const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Provider name (for error messages and logs). */
const PROVIDER_NAME = 'Ollama';

/**
 * Calls Ollama (`/api/generate`) and returns already-parsed JSON.
 *
 * @param {{ system?: string, prompt?: string, model?: string, host?: string, timeoutMs?: number }} input
 * @returns {Promise<any>}
 */
async function generateJson({ system, prompt, model, host, timeoutMs }) {
    const normalizedHost = removeTrailingSlashes(String(host || config.ollama.host));
    const normalizedModel = model || config.ollama.model;
    const normalizedTimeout = timeoutMs || config.ollama.requestTimeoutMs;

    const response = await fetchWithTimeout({
        url: `${normalizedHost}/api/generate`,
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: normalizedModel,
                system,
                prompt,
                stream: false,
                format: 'json',
                options: { temperature: 0.1 }
            })
        },
        timeoutMs: normalizedTimeout,
        providerName: PROVIDER_NAME
    });

    const payload = await response.json();
    if (!payload || typeof payload.response !== 'string')
        throw new Error('La respuesta de Ollama no contiene un campo response válido.');

    return extractJsonPayload(payload.response, PROVIDER_NAME);
}

module.exports = {
    generateJson
};
