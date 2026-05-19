'use strict';

/**
 * @file Cliente Groq (modo `cloud`).
 *
 * Implementa `generateJson` contra el endpoint OpenAI-compatible de Groq,
 * compartiendo las primitivas HTTP/timeout/JSON-extract con
 * `ollama-client` (via `llm-http`).
 */

const config = require('../config');
const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Nombre del proveedor (para mensajes de error y logs). */
const PROVIDER_NAME = 'Groq';

/**
 * Llama al endpoint OpenAI-compatible de Groq y devuelve un JSON parseado.
 * @param {*} options - system, prompt y overrides opcionales.
 * @returns {Promise<*>} JSON parseado de la respuesta.
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
