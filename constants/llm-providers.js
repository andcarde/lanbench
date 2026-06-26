'use strict';

/**
 * @file Canonical catalog of built-in LLM providers (US-31, US-35, US-36).
 *
 * Source of truth for the four wired providers (Groq, Google AI Studio,
 * OpenAI-compatible, Anthropic) and their default API base URLs. The list is
 * consumed by:
 *   - `services/dataset-llm-credentials-service.js` (validation and apiBase
 *     resolution at save time),
 *   - `services/dataset-custom-providers-service.js` (duplicate-name guard:
 *     a user-added provider may not collide with a built-in name),
 *   - `utils/llm-client.js` (dispatch by `dispatchProvider`),
 *   - `utils/llm-model-catalog.js` (catalog support),
 *   - `public/js/dataset-admin.js` (frontend selector + placeholders).
 *
 * `dispatchProvider` is the value passed to the dispatcher in `utils/llm-client.js`.
 * User-added custom providers reuse `'openai-compatible'` because their wire
 * protocol is unknown — that is the most common contract.
 */

/** Allowed shape for any provider identifier (built-in or custom). */
const PROVIDER_NAME_PATTERN = /^[a-z0-9._-]{1,40}$/;

/** Built-in providers, ordered as they appear in the frontend selector. */
const BUILTIN_PROVIDERS = Object.freeze([
    Object.freeze({
        name: 'groq',
        label: 'Groq',
        urlBase: 'https://api.groq.com/openai/v1',
        dispatchProvider: 'groq'
    }),
    Object.freeze({
        name: 'google-ai-studio',
        label: 'Google AI Studio',
        urlBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
        dispatchProvider: 'google-ai-studio'
    }),
    Object.freeze({
        name: 'openai-compatible',
        label: 'OpenAI-compatible',
        urlBase: 'https://api.openai.com/v1',
        dispatchProvider: 'openai-compatible'
    }),
    Object.freeze({
        name: 'anthropic',
        label: 'Anthropic',
        urlBase: 'https://api.anthropic.com',
        dispatchProvider: 'anthropic'
    })
]);

/** Set of built-in provider names for O(1) membership checks. */
const BUILTIN_PROVIDER_NAMES = new Set(BUILTIN_PROVIDERS.map(provider => provider.name));

/**
 * Returns `true` when `name` is one of the built-in provider ids.
 * @param {*} name - Candidate provider name.
 * @returns {boolean}
 */
function isBuiltinProviderName(name) {
    if (typeof name !== 'string')
        return false;
    return BUILTIN_PROVIDER_NAMES.has(name.trim().toLowerCase());
}

/**
 * Returns the canonical built-in provider record, or `null` when the name is
 * not built-in.
 * @param {*} name - Candidate provider name.
 * @returns {{name:string,label:string,urlBase:string,dispatchProvider:string}|null}
 */
function getBuiltinProvider(name) {
    if (typeof name !== 'string')
        return null;
    const canonical = name.trim().toLowerCase();
    return BUILTIN_PROVIDERS.find(provider => provider.name === canonical) || null;
}

module.exports = {
    PROVIDER_NAME_PATTERN,
    BUILTIN_PROVIDERS,
    BUILTIN_PROVIDER_NAMES,
    isBuiltinProviderName,
    getBuiltinProvider
};
