'use strict';

/**
 * @file Cliente Ollama (modo `local`).
 *
 * Implementa `generateJson` contra el endpoint `/api/generate` de un
 * servidor Ollama local. Comparte primitivas con `groq-client` via
 * `llm-http`.
 */

const config = require('../config');
const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Nombre del proveedor (para mensajes de error y logs). */
const PROVIDER_NAME = 'Ollama';

/**
 * Llama a Ollama (`/api/generate`) y devuelve un JSON ya parseado.
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
