'use strict';

/**
 * @file LLM dispatcher.
 *
 * Keeps a homogeneous API (`generateJson` / `generateText`) over several
 * backends and two routing modes:
 *
 *   - **Per-credential** (US-31): when a call carries an explicit
 *     `providerConfig = { provider, apiBase?, model, apiKey, timeoutMs? }`, the
 *     dispatcher routes by `providerConfig.provider` and uses that key/model.
 *   - **Global** (legacy): with no `providerConfig`, it routes by `config.model`
 *     (`cloud` → Groq/OpenAI-compatible, `local` → Ollama), preserving the
 *     previous behaviour with no regression.
 */

const config = require('../config');
const ollamaClient = require('./ollama-client');
const groqClient = require('./groq-client');
const openaiCompatibleClient = require('./openai-compatible-client');
const anthropicClient = require('./anthropic-client');
const { getBuiltinProvider } = require('../constants/llm-providers');

/**
 * Google AI Studio's OpenAI-compatibility endpoint (US-35). It accepts the
 * AI Studio key as a Bearer token, so the generic OpenAI-compatible client
 * can talk to Gemini models without a dedicated adapter.
 */
const GOOGLE_AI_STUDIO_OPENAI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
/** Official OpenAI API base for OpenAI-compatible credentials with no custom proxy URL. */
const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Resolves the client and per-call options for an explicit `providerConfig`.
 *
 * Any provider name that is not built-in (US-36 user-defined providers) is
 * routed through the OpenAI-compatible client with the explicit `apiBase`
 * resolved upstream by the credentials service.
 *
 * @param {Record<string, any>} providerConfig - `{ provider, apiBase?, model, apiKey, timeoutMs? }`.
 * @returns {{ client: { generateJson: Function, generateText: Function }, options: Record<string, any> }}
 */
function resolveProviderRouting(providerConfig) {
    const provider = String(providerConfig.provider || '').trim().toLowerCase();
    const baseOptions = {
        model: providerConfig.model,
        apiKey: providerConfig.apiKey,
        timeoutMs: providerConfig.timeoutMs
    };

    if (provider === 'anthropic')
        return { client: anthropicClient, options: { ...baseOptions, apiBase: providerConfig.apiBase } };

    if (provider === 'local' || provider === 'ollama')
        return { client: ollamaClient, options: { model: providerConfig.model, host: providerConfig.apiBase, timeoutMs: providerConfig.timeoutMs } };

    // Google AI Studio (US-35): OpenAI-shaped, but its default apiBase is the
    // Google compatibility endpoint, not the Groq one from config.
    if (provider === 'google-ai-studio') {
        return {
            client: openaiCompatibleClient,
            options: { ...baseOptions, apiBase: providerConfig.apiBase || GOOGLE_AI_STUDIO_OPENAI_API_BASE, providerName: 'Google AI Studio' }
        };
    }

    if (provider === 'openai-compatible') {
        return {
            client: openaiCompatibleClient,
            options: { ...baseOptions, apiBase: providerConfig.apiBase || OPENAI_API_BASE, providerName: 'OpenAI-compatible' }
        };
    }

    // 'groq' (built-in, default apiBase from config) plus any user-defined
    // provider (US-36): both reach the OpenAI-compatible client. For
    // user-defined providers `providerConfig.apiBase` is mandatory and was
    // resolved by the credentials service from the dataset's `DatasetCustomProvider`.
    const builtin = getBuiltinProvider(provider);
    const providerName = builtin ? builtin.label : (providerConfig.provider || 'custom-provider');
    return { client: openaiCompatibleClient, options: { ...baseOptions, apiBase: providerConfig.apiBase, providerName } };
}

/**
 * Resolves the client for the global configuration (no `providerConfig`).
 *
 * @returns {{ generateJson: Function, generateText: Function }}
 */
function resolveGlobalClient() {
    return config.model === 'cloud' ? groqClient : ollamaClient;
}

/**
 * Dispatches a JSON generation request.
 *
 * @param {{ system?: string, prompt?: string, providerConfig?: Record<string, any>, [k: string]: any }} options
 * @returns {Promise<any>} Parsed JSON of the response.
 */
async function generateJson(options = {}) {
    const { providerConfig, ...rest } = options;

    if (providerConfig && typeof providerConfig === 'object') {
        const { client, options: providerOptions } = resolveProviderRouting(providerConfig);
        return client.generateJson({ system: rest.system, prompt: rest.prompt, ...providerOptions });
    }

    return resolveGlobalClient().generateJson(rest);
}

/**
 * Dispatches a free-text generation request (used by the credential "check").
 *
 * @param {{ system?: string, prompt?: string, providerConfig?: Record<string, any> }} options
 * @returns {Promise<string>} Raw text returned by the model.
 */
async function generateText(options = {}) {
    const { providerConfig, ...rest } = options;

    if (providerConfig && typeof providerConfig === 'object') {
        const { client, options: providerOptions } = resolveProviderRouting(providerConfig);
        return client.generateText({ system: rest.system, prompt: rest.prompt, ...providerOptions });
    }

    return resolveGlobalClient().generateText(rest);
}

module.exports = {
    generateJson,
    generateText
};
