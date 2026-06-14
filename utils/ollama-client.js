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
 * Calls Ollama (`/api/generate`) and returns the raw `response` text.
 *
 * @param {{ system?: string, prompt?: string, model?: string, host?: string, timeoutMs?: number, jsonMode?: boolean }} input
 * @returns {Promise<string>} Raw `response` field from Ollama.
 */
async function callGenerate({ system, prompt, model, host, timeoutMs, jsonMode }) {
    const normalizedHost = removeTrailingSlashes(String(host || config.ollama.host));
    const normalizedModel = model || config.ollama.model;
    const normalizedTimeout = timeoutMs || config.ollama.requestTimeoutMs;

    /** @type {Record<string, any>} */
    const body = {
        model: normalizedModel,
        system,
        prompt,
        stream: false,
        options: { temperature: 0.1 }
    };

    if (jsonMode)
        body.format = 'json';

    const response = await fetchWithTimeout({
        url: `${normalizedHost}/api/generate`,
        init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        },
        timeoutMs: normalizedTimeout,
        providerName: PROVIDER_NAME
    });

    const payload = await response.json();
    if (!payload || typeof payload.response !== 'string')
        throw new Error('La respuesta de Ollama no contiene un campo response válido.');

    return payload.response;
}

/**
 * Calls Ollama (`/api/generate`) and returns already-parsed JSON.
 *
 * @param {{ system?: string, prompt?: string, model?: string, host?: string, timeoutMs?: number }} input
 * @returns {Promise<any>}
 */
async function generateJson(input) {
    const response = await callGenerate({ ...input, jsonMode: true });
    return extractJsonPayload(response, PROVIDER_NAME);
}

/**
 * Calls Ollama (`/api/generate`) in free-text mode and returns the raw text.
 *
 * @param {{ system?: string, prompt?: string, model?: string, host?: string, timeoutMs?: number }} input
 * @returns {Promise<string>}
 */
async function generateText(input) {
    return callGenerate({ ...input, jsonMode: false });
}

module.exports = {
    generateJson,
    generateText
};
