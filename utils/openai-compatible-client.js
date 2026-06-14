'use strict';

/**
 * @file Generic OpenAI-compatible chat client.
 *
 * Generalises the former `groq-client`: any provider exposing the OpenAI
 * `/chat/completions` shape (Groq, OpenAI, Together, OpenRouter, local
 * OpenAI-compatible servers) is reached with `{ apiBase, model, apiKey }`.
 * Missing overrides fall back to `config.groq.*`, preserving the global
 * `cloud` behaviour.
 *
 * Exposes `generateJson` (forces `response_format: json_object`, returns parsed
 * JSON) and `generateText` (free text, returns the raw model string — used by
 * the credential "check" action, US-31).
 */

const config = require('../config');
const { removeTrailingSlashes, extractJsonPayload, fetchWithTimeout } = require('./llm-http');

/** Default provider name (for error messages and logs). */
const DEFAULT_PROVIDER_NAME = 'OpenAI-compatible';
/** Sampling temperature kept low for deterministic validation output. */
const TEMPERATURE = 0.1;

/**
 * Resolves the effective request settings from per-call overrides, falling back
 * to the global Groq configuration.
 *
 * @param {{ model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number, providerName?:string }} options
 * @returns {{ apiBase:string, model:string, apiKey:string, timeoutMs:number, providerName:string }}
 */
function resolveSettings({ model, apiBase, apiKey, timeoutMs, providerName }) {
    return {
        apiBase: removeTrailingSlashes(String(apiBase || config.groq.apiBase)),
        model: model || config.groq.model,
        apiKey: apiKey || config.groq.apiKey,
        timeoutMs: timeoutMs || config.groq.requestTimeoutMs,
        providerName: providerName || DEFAULT_PROVIDER_NAME
    };
}

/**
 * Calls `/chat/completions` and returns the raw assistant message content.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number, providerName?:string, jsonMode?:boolean }} options
 * @returns {Promise<string>} The assistant message content.
 */
async function callChatCompletions(options) {
    const { apiBase, model, apiKey, timeoutMs, providerName } = resolveSettings(options);

    if (!apiKey)
        throw new Error(`Falta la API key del proveedor ${providerName}: configura una credencial o la clave global.`);

    // Build the messages array defensively: only include the system message when
    // a non-empty system prompt is given. The credential "check" action calls
    // `generateText` with just a prompt, and OpenAI-compatible providers (Groq)
    // reject a system message whose `content` is missing with a 400 error
    // ("property 'content' is missing").
    const messages = [];
    if (typeof options.system === 'string' && options.system.length > 0)
        messages.push({ role: 'system', content: options.system });
    messages.push({ role: 'user', content: typeof options.prompt === 'string' ? options.prompt : String(options.prompt ?? '') });

    /** @type {Record<string, any>} */
    const body = {
        model,
        messages,
        temperature: TEMPERATURE
    };

    if (options.jsonMode)
        body.response_format = { type: 'json_object' };

    const response = await fetchWithTimeout({
        url: `${apiBase}/chat/completions`,
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        },
        timeoutMs,
        providerName
    });

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== 'string')
        throw new Error(`La respuesta de ${providerName} no contiene un campo choices[0].message.content válido.`);

    return content;
}

/**
 * Calls the provider forcing JSON output and returns the parsed JSON.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number, providerName?:string }} options
 * @returns {Promise<*>} Parsed JSON of the response.
 */
async function generateJson(options) {
    const providerName = options.providerName || DEFAULT_PROVIDER_NAME;
    const content = await callChatCompletions({ ...options, jsonMode: true });
    return extractJsonPayload(content, providerName);
}

/**
 * Calls the provider in free-text mode and returns the raw model string.
 *
 * @param {{ system?:string, prompt?:string, model?:string, apiBase?:string, apiKey?:string, timeoutMs?:number, providerName?:string }} options
 * @returns {Promise<string>} Raw text returned by the model.
 */
async function generateText(options) {
    return callChatCompletions({ ...options, jsonMode: false });
}

module.exports = {
    generateJson,
    generateText
};
