'use strict';

/**
 * @file Provider model catalogs (US-35).
 *
 * Queries the public — but key-gated — model-listing APIs of the supported
 * providers and normalizes the result to `[{ id, label }]` for the model
 * picker of the credentials form:
 *
 *   - Groq: `GET {apiBase}/models` (OpenAI list shape, Bearer auth).
 *   - Google AI Studio: `GET /v1beta/models` (native shape, `x-goog-api-key`,
 *     paginated), filtered to chat-capable models (`generateContent`).
 *   - OpenAI-compatible: `GET {apiBase}/models` (OpenAI list shape, Bearer auth).
 *   - Anthropic: `GET {apiBase}/v1/models` (native shape, `x-api-key`).
 *
 * Failures are classified into a small taxonomy (`CatalogError.code`) so the
 * UI can distinguish an invalid key from a provider outage:
 *
 *   - `invalid_key`          → HTTP 401/403 from the provider.
 *   - `rate_limited`         → HTTP 429.
 *   - `provider_unavailable` → any other HTTP error, network failure or timeout.
 *
 * All requests go through `fetchWithTimeout`, so they are recorded in the
 * daily LLM log and aborted on timeout like every other provider call.
 */

const { removeTrailingSlashes, fetchWithTimeout } = require('./llm-http');

/** Default Groq API base (same default as `config.groq.apiBase`). */
const GROQ_DEFAULT_API_BASE = 'https://api.groq.com/openai/v1';
/** Native Google AI Studio base (the catalog is not exposed on the OpenAI-compat path). */
const GOOGLE_AI_STUDIO_NATIVE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Default OpenAI API base for the OpenAI-compatible provider when no proxy URL is supplied. */
const OPENAI_DEFAULT_API_BASE = 'https://api.openai.com/v1';
/** Default Anthropic API base. */
const ANTHROPIC_DEFAULT_API_BASE = 'https://api.anthropic.com';
/** Anthropic API version header value, shared with `utils/anthropic-client.js`. */
const ANTHROPIC_VERSION = '2023-06-01';
/** Catalog calls back a UI control: keep the timeout short. */
const DEFAULT_TIMEOUT_MS = 15000;
/** Upper bound on Google pagination loops (1000 models/page is already generous). */
const GOOGLE_MAX_PAGES = 4;
/** Upper bound on Anthropic pagination loops. */
const ANTHROPIC_MAX_PAGES = 8;
/** Groq ids that are not chat models (audio, TTS, moderation, embeddings). */
const GROQ_NON_CHAT_PATTERN = /whisper|tts|guard|embed/i;
/** OpenAI-compatible ids that are not useful in this text-generation picker. */
const OPENAI_COMPATIBLE_NON_CHAT_PATTERN = /audio|babbage|dall|embedding|image|moderation|realtime|search|speech|transcribe|tts|whisper/i;

/** Built-in providers whose catalog can be queried. */
const CATALOG_PROVIDERS = ['groq', 'google-ai-studio', 'openai-compatible', 'anthropic'];

const { isBuiltinProviderName } = require('../constants/llm-providers');

/**
 * Provider catalog failure with a UI-facing classification code.
 */
class CatalogError extends Error {
    /**
     * @param {string} message - Human (Spanish) message, key-free.
     * @param {{ code: 'invalid_key'|'rate_limited'|'provider_unavailable', cause?: unknown }} options
     */
    constructor(message, { code, cause } = /** @type {any} */ ({})) {
        super(message, cause ? { cause } : undefined);
        this.name = 'CatalogError';
        this.code = code || 'provider_unavailable';
    }
}

/**
 * Indicates whether a provider exposes a queryable model catalog. Built-in
 * providers each have a dedicated handler; any non-built-in provider (US-36
 * user-defined) is queried best-effort through the OpenAI-compatible handler,
 * which is the most common shape for self-hosted gateways.
 *
 * @param {*} provider - Canonical provider id.
 * @returns {boolean}
 */
function supportsModelCatalog(provider) {
    const canonical = String(provider || '').trim().toLowerCase();
    if (!canonical)
        return false;
    if (CATALOG_PROVIDERS.includes(canonical))
        return true;
    // Custom providers: assume an OpenAI-shaped catalog. Failures degrade to
    // manual model entry in the UI.
    return !isBuiltinProviderName(canonical);
}

/**
 * Lists the available models of a provider, normalized and sorted.
 *
 * @param {{ provider:string, apiKey:string, apiBase?:string|null, timeoutMs?:number }} options
 * @returns {Promise<Array<{ id:string, label:string }>>}
 * @throws {CatalogError} On any provider/network failure.
 * @throws {Error} When the provider has no catalog support (caller bug: gate
 *   with `supportsModelCatalog` first).
 */
async function listModels({ provider, apiKey, apiBase, timeoutMs } = /** @type {any} */ ({})) {
    const canonical = String(provider || '').trim().toLowerCase();
    const effectiveTimeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;

    if (canonical === 'groq')
        return listGroqModels({ apiKey, apiBase, timeoutMs: effectiveTimeoutMs });
    if (canonical === 'google-ai-studio')
        return listGoogleAiStudioModels({ apiKey, timeoutMs: effectiveTimeoutMs });
    if (canonical === 'openai-compatible')
        return listOpenAiCompatibleModels({ apiKey, apiBase, timeoutMs: effectiveTimeoutMs });
    if (canonical === 'anthropic')
        return listAnthropicModels({ apiKey, apiBase, timeoutMs: effectiveTimeoutMs });

    // User-defined provider (US-36): best-effort OpenAI-compatible catalog.
    if (!isBuiltinProviderName(canonical))
        return listOpenAiCompatibleModels({ apiKey, apiBase, timeoutMs: effectiveTimeoutMs });

    throw new Error(`El proveedor "${canonical}" no ofrece catálogo de modelos.`);
}

/**
 * Fetches Groq's OpenAI-style model list and keeps the chat-capable entries.
 * @param {{ apiKey:string, apiBase?:string|null, timeoutMs:number }} options
 * @returns {Promise<Array<{ id:string, label:string }>>}
 */
async function listGroqModels({ apiKey, apiBase, timeoutMs }) {
    const base = removeTrailingSlashes(String(apiBase || GROQ_DEFAULT_API_BASE));
    const payload = await fetchCatalogJson({
        url: `${base}/models`,
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeoutMs,
        providerName: 'Groq'
    });

    /** @type {Array<Record<string, any>>} */
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return normalizeAndSort(rows
        .filter(row => row && typeof row.id === 'string' && row.active !== false)
        .filter(row => !GROQ_NON_CHAT_PATTERN.test(row.id))
        .map(row => ({ id: String(row.id), label: String(row.id) })));
}

/**
 * Fetches Google AI Studio's model list (all pages) and keeps the models that
 * support `generateContent`, with the `models/` prefix stripped from ids.
 * @param {{ apiKey:string, timeoutMs:number }} options
 * @returns {Promise<Array<{ id:string, label:string }>>}
 */
async function listGoogleAiStudioModels({ apiKey, timeoutMs }) {
    /** @type {Array<{ id:string, label:string }>} */
    const models = [];
    let pageToken = '';

    for (let page = 0; page < GOOGLE_MAX_PAGES; page += 1) {
        const payload = await fetchCatalogJson({
            url: `${GOOGLE_AI_STUDIO_NATIVE_API_BASE}/models${googleModelsQuery(pageToken)}`,
            headers: { 'x-goog-api-key': apiKey },
            timeoutMs,
            providerName: 'Google AI Studio'
        });

        models.push(...extractGoogleModels(payload));

        pageToken = nextGooglePageToken(payload);
        if (!pageToken)
            break;
    }

    return normalizeAndSort(models);
}

/**
 * Builds the Google models query string for a page.
 * @param {string} pageToken - Previous page token.
 * @returns {string} Query string.
 */
function googleModelsQuery(pageToken) {
    if (!pageToken)
        return '?pageSize=1000';
    return `?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`;
}

/**
 * Extracts chat-capable Google model rows from a catalog payload.
 * @param {*} payload - Google model list payload.
 * @returns {Array<{ id:string, label:string }>} Normalized models.
 */
function extractGoogleModels(payload) {
    const rows = Array.isArray(payload?.models) ? payload.models : [];
    return rows.map(mapGoogleModel).filter(Boolean);
}

/**
 * Normalizes one Google model row, dropping non-generateContent models.
 * @param {*} row - Raw Google model.
 * @returns {{ id:string, label:string }|null} Normalized model or null.
 */
function mapGoogleModel(row) {
    if (!row || typeof row.name !== 'string')
        return null;

    const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
    if (!methods.includes('generateContent'))
        return null;

    const id = row.name.replace(/^models\//, '');
    const displayName = typeof row.displayName === 'string' ? row.displayName.trim() : '';
    return { id, label: modelLabel(id, displayName) };
}

/**
 * Reads the next Google page token.
 * @param {*} payload - Google model list payload.
 * @returns {string} Next page token or empty.
 */
function nextGooglePageToken(payload) {
    return typeof payload?.nextPageToken === 'string' ? payload.nextPageToken : '';
}

/**
 * Fetches an OpenAI-shaped model list. With no custom base this talks to the
 * official OpenAI API; with a custom base it supports compatible providers.
 * @param {{ apiKey:string, apiBase?:string|null, timeoutMs:number }} options
 * @returns {Promise<Array<{ id:string, label:string }>>}
 */
async function listOpenAiCompatibleModels({ apiKey, apiBase, timeoutMs }) {
    const base = removeTrailingSlashes(String(apiBase || OPENAI_DEFAULT_API_BASE));
    const payload = await fetchCatalogJson({
        url: `${base}/models`,
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeoutMs,
        providerName: 'OpenAI-compatible'
    });

    /** @type {Array<Record<string, any>>} */
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return normalizeAndSort(rows
        .filter(row => row && typeof row.id === 'string')
        .filter(row => !OPENAI_COMPATIBLE_NON_CHAT_PATTERN.test(row.id))
        .map(row => ({ id: String(row.id), label: String(row.id) })));
}

/**
 * Fetches Anthropic's native model list. More recent models are returned first
 * by the provider, but the picker sorts consistently with the other catalogs.
 * @param {{ apiKey:string, apiBase?:string|null, timeoutMs:number }} options
 * @returns {Promise<Array<{ id:string, label:string }>>}
 */
async function listAnthropicModels({ apiKey, apiBase, timeoutMs }) {
    /** @type {Array<{ id:string, label:string }>} */
    const models = [];
    let afterId = '';

    for (let page = 0; page < ANTHROPIC_MAX_PAGES; page += 1) {
        const payload = await fetchCatalogJson({
            url: `${anthropicModelsBase(apiBase)}${anthropicModelsQuery(afterId)}`,
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION
            },
            timeoutMs,
            providerName: 'Anthropic'
        });

        models.push(...extractAnthropicModels(payload));

        afterId = nextAnthropicAfterId(payload);
        if (!afterId)
            break;
    }

    return normalizeAndSort(models);
}

/**
 * Builds the Anthropic models query string for a page.
 * @param {string} afterId - Previous page cursor.
 * @returns {string} Query string.
 */
function anthropicModelsQuery(afterId) {
    if (!afterId)
        return '?limit=100';
    return `?limit=100&after_id=${encodeURIComponent(afterId)}`;
}

/**
 * Extracts Anthropic model rows from a catalog payload.
 * @param {*} payload - Anthropic model list payload.
 * @returns {Array<{ id:string, label:string }>} Normalized models.
 */
function extractAnthropicModels(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map(mapAnthropicModel).filter(Boolean);
}

/**
 * Normalizes one Anthropic model row.
 * @param {*} row - Raw Anthropic model.
 * @returns {{ id:string, label:string }|null} Normalized model or null.
 */
function mapAnthropicModel(row) {
    if (!row || typeof row.id !== 'string')
        return null;

    const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : '';
    return { id: row.id, label: modelLabel(row.id, displayName) };
}

/**
 * Reads the next Anthropic cursor.
 * @param {*} payload - Anthropic model list payload.
 * @returns {string} Next cursor or empty.
 */
function nextAnthropicAfterId(payload) {
    if (!payload?.has_more || typeof payload?.last_id !== 'string')
        return '';
    return payload.last_id;
}

/**
 * Builds a picker label from a model id and optional display name.
 * @param {string} id - Model id.
 * @param {string} displayName - Human label.
 * @returns {string} Picker label.
 */
function modelLabel(id, displayName) {
    if (displayName && displayName !== id)
        return `${id} — ${displayName}`;
    return id;
}

/**
 * Builds the Anthropic models endpoint while tolerating apiBase values with or
 * without the `/v1` suffix.
 * @param {string|null|undefined} apiBase - Optional custom API base.
 * @returns {string} Full models endpoint without query string.
 */
function anthropicModelsBase(apiBase) {
    const base = removeTrailingSlashes(String(apiBase || ANTHROPIC_DEFAULT_API_BASE));
    return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
}

/**
 * Performs the catalog GET and converts every failure into a `CatalogError`.
 * @param {{ url:string, headers:Record<string,string>, timeoutMs:number, providerName:string }} options
 * @returns {Promise<*>} Parsed JSON payload.
 */
async function fetchCatalogJson({ url, headers, timeoutMs, providerName }) {
    let response;
    try {
        response = await fetchWithTimeout({
            url,
            init: { method: 'GET', headers },
            timeoutMs,
            providerName
        });
    } catch (caughtError) {
        throw classifyCatalogError(caughtError, providerName);
    }

    try {
        return await response.json();
    } catch (caughtError) {
        throw new CatalogError(`${providerName} no devolvió un catálogo JSON válido.`, {
            code: 'provider_unavailable',
            cause: caughtError
        });
    }
}

/**
 * Maps a `fetchWithTimeout` failure to the catalog taxonomy. The HTTP status
 * is recovered from the standard error message (`"<provider> respondió con
 * <status>: ..."`), the same convention `llm-http` itself relies on.
 *
 * @param {*} error - Caught error.
 * @param {string} providerName - Provider name for messages.
 * @returns {CatalogError}
 */
function classifyCatalogError(error, providerName) {
    const message = String(error?.message || '');
    const statusMatch = message.match(/respondió con (\d{3})/);
    const status = statusMatch ? Number(statusMatch[1]) : null;

    if (status === 401 || status === 403) {
        return new CatalogError(`${providerName} rechazó la API key (clave inválida o sin permisos).`, {
            code: 'invalid_key',
            cause: error
        });
    }
    if (status === 429) {
        return new CatalogError(`${providerName} está limitando las peticiones (rate limit). Inténtalo de nuevo en unos segundos.`, {
            code: 'rate_limited',
            cause: error
        });
    }
    if (status !== null) {
        return new CatalogError(`${providerName} no está disponible en este momento (HTTP ${status}).`, {
            code: 'provider_unavailable',
            cause: error
        });
    }
    return new CatalogError(`No se pudo contactar con ${providerName} (fallo de red o tiempo de espera agotado).`, {
        code: 'provider_unavailable',
        cause: error
    });
}

/**
 * Deduplicates by id and sorts alphabetically.
 * @param {Array<{ id:string, label:string }>} models
 * @returns {Array<{ id:string, label:string }>}
 */
function normalizeAndSort(models) {
    /** @type {Map<string, { id:string, label:string }>} */
    const byId = new Map();
    for (const model of models) {
        if (model.id && !byId.has(model.id))
            byId.set(model.id, model);
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = {
    CatalogError,
    supportsModelCatalog,
    listModels
};
