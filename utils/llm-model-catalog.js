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
/** Catalog calls back a UI control: keep the timeout short. */
const DEFAULT_TIMEOUT_MS = 15000;
/** Upper bound on Google pagination loops (1000 models/page is already generous). */
const GOOGLE_MAX_PAGES = 4;
/** Groq ids that are not chat models (audio, TTS, moderation, embeddings). */
const GROQ_NON_CHAT_PATTERN = /whisper|tts|guard|embed/i;

/** Providers whose catalog can be queried. */
const CATALOG_PROVIDERS = ['groq', 'google-ai-studio'];

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
 * Indicates whether a provider exposes a queryable model catalog.
 * @param {*} provider - Canonical provider id.
 * @returns {boolean}
 */
function supportsModelCatalog(provider) {
    return CATALOG_PROVIDERS.includes(String(provider || '').trim().toLowerCase());
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
        const query = pageToken ? `?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}` : '?pageSize=1000';
        const payload = await fetchCatalogJson({
            url: `${GOOGLE_AI_STUDIO_NATIVE_API_BASE}/models${query}`,
            headers: { 'x-goog-api-key': apiKey },
            timeoutMs,
            providerName: 'Google AI Studio'
        });

        const rows = Array.isArray(payload?.models) ? payload.models : [];
        for (const row of rows) {
            if (!row || typeof row.name !== 'string')
                continue;
            const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
            if (!methods.includes('generateContent'))
                continue;
            const id = row.name.replace(/^models\//, '');
            const displayName = typeof row.displayName === 'string' ? row.displayName.trim() : '';
            models.push({ id, label: displayName && displayName !== id ? `${id} — ${displayName}` : id });
        }

        pageToken = typeof payload?.nextPageToken === 'string' ? payload.nextPageToken : '';
        if (!pageToken)
            break;
    }

    return normalizeAndSort(models);
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
