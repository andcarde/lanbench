'use strict';

/**
 * Unit coverage for the provider model catalogs (US-35): provider
 * listing/normalization plus the error taxonomy (`invalid_key` /
 * `rate_limited` / `provider_unavailable`) with a stubbed `fetch`.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { listModels, supportsModelCatalog, CatalogError } = require('../../../utils/llm-model-catalog');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const afterEach = /** @type {Mocha.HookFunction} */ (globalThis.afterEach || testApi.afterEach);

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

/**
 * Installs a fetch stub that replays `responses` in order (the last one
 * repeats) and records every call.
 * @param {Array<{ status?:number, payload?:*, networkError?:boolean }>} responses
 * @returns {{ calls: any[] }}
 */
function stubFetchSequence(responses) {
    /** @type {any[]} */
    const calls = [];
    let index = 0;
    globalThis.fetch = /** @type {any} */ (async (/** @type {*} */ url, /** @type {*} */ init) => {
        calls.push({ url, init });
        const current = responses[Math.min(index, responses.length - 1)];
        index += 1;
        if (current.networkError)
            throw new TypeError('fetch failed');
        const status = current.status || 200;
        const bodyText = JSON.stringify(current.payload ?? {});
        return {
            ok: status < 400,
            status,
            statusText: String(status),
            headers: { get: () => 'application/json' },
            async json() { return current.payload; },
            async text() { return bodyText; }
        };
    });
    return { calls };
}

describe('llm-model-catalog (US-35)', () => {
    it('supportsModelCatalog acepta proveedores con API pública de modelos y proveedores personalizados (US-36)', () => {
        assert.equal(supportsModelCatalog('groq'), true);
        assert.equal(supportsModelCatalog('  Google-AI-Studio '), true);
        assert.equal(supportsModelCatalog('anthropic'), true);
        assert.equal(supportsModelCatalog('openai-compatible'), true);
        assert.equal(supportsModelCatalog(''), false);
        assert.equal(supportsModelCatalog(null), false);
        // US-36: user-defined provider ids are treated as best-effort OpenAI-compatible.
        assert.equal(supportsModelCatalog('self-hosted'), true);
    });

    it('groq: pide /models con Bearer, filtra no-chat e inactivos y ordena', async () => {
        const { calls } = stubFetchSequence([{
            payload: {
                data: [
                    { id: 'whisper-large-v3', active: true },
                    { id: 'llama-3.3-70b-versatile', active: true },
                    { id: 'playai-tts', active: true },
                    { id: 'meta-llama/llama-guard-4-12b', active: true },
                    { id: 'modelo-retirado', active: false },
                    { id: 'gemma2-9b-it' }
                ]
            }
        }]);

        const models = await listModels({ provider: 'groq', apiKey: 'gsk_k' });

        assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/models');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer gsk_k');
        assert.deepEqual(models, [
            { id: 'gemma2-9b-it', label: 'gemma2-9b-it' },
            { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }
        ]);
    });

    it('groq: respeta un apiBase propio (sin barras finales)', async () => {
        const { calls } = stubFetchSequence([{ payload: { data: [] } }]);

        await listModels({ provider: 'groq', apiKey: 'k', apiBase: 'https://proxy.example.com/v1///' });

        assert.equal(calls[0].url, 'https://proxy.example.com/v1/models');
    });

    it('google-ai-studio: pagina, filtra generateContent y quita el prefijo models/', async () => {
        const { calls } = stubFetchSequence([
            {
                payload: {
                    models: [
                        { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
                        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
                    ],
                    nextPageToken: 'tok-2'
                }
            },
            {
                payload: {
                    models: [
                        { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] }
                    ]
                }
            }
        ]);

        const models = await listModels({ provider: 'google-ai-studio', apiKey: 'AIza_k' });

        assert.equal(calls.length, 2);
        assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?pageSize=1000$/);
        assert.match(calls[1].url, /pageToken=tok-2/);
        assert.equal(calls[0].init.headers['x-goog-api-key'], 'AIza_k');
        assert.deepEqual(models, [
            { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' },
            { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash — Gemini 2.0 Flash' }
        ]);
    });

    it('openai-compatible: usa OpenAI por defecto, respeta apiBase propio y filtra no-chat', async () => {
        const { calls } = stubFetchSequence([{
            payload: {
                data: [
                    { id: 'gpt-5.4-mini' },
                    { id: 'text-embedding-3-small' },
                    { id: 'gpt-4o-mini' }
                ]
            }
        }]);

        const models = await listModels({ provider: 'openai-compatible', apiKey: 'sk_k' });

        assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_k');
        assert.deepEqual(models, [
            { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
            { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' }
        ]);

        const custom = stubFetchSequence([{ payload: { data: [] } }]);
        await listModels({ provider: 'openai-compatible', apiKey: 'k', apiBase: 'https://router.example.com/v1///' });
        assert.equal(custom.calls[0].url, 'https://router.example.com/v1/models');
    });

    it('anthropic: pagina /v1/models, soporta apiBase con /v1 y usa display_name', async () => {
        const { calls } = stubFetchSequence([
            {
                payload: {
                    data: [
                        { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }
                    ],
                    has_more: true,
                    last_id: 'claude-sonnet-4-5'
                }
            },
            {
                payload: {
                    data: [
                        { id: 'claude-3-5-haiku-latest' }
                    ],
                    has_more: false
                }
            }
        ]);

        const models = await listModels({ provider: 'anthropic', apiKey: 'ant_k' });

        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models?limit=100');
        assert.match(calls[1].url, /after_id=claude-sonnet-4-5/);
        assert.equal(calls[0].init.headers['x-api-key'], 'ant_k');
        assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
        assert.deepEqual(models, [
            { id: 'claude-3-5-haiku-latest', label: 'claude-3-5-haiku-latest' },
            { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5 — Claude Sonnet 4.5' }
        ]);

        const custom = stubFetchSequence([{ payload: { data: [] } }]);
        await listModels({ provider: 'anthropic', apiKey: 'k', apiBase: 'https://proxy.example.com/v1///' });
        assert.equal(custom.calls[0].url, 'https://proxy.example.com/v1/models?limit=100');
    });

    it('clasifica 401/403 como invalid_key', async () => {
        stubFetchSequence([{ status: 401, payload: { error: { message: 'Invalid API Key' } } }]);

        await assert.rejects(() => listModels({ provider: 'groq', apiKey: 'bad' }), (/** @type {any} */ error) => {
            assert.equal(error instanceof CatalogError, true);
            assert.equal(error.code, 'invalid_key');
            return true;
        });

        stubFetchSequence([{ status: 403, payload: { error: { status: 'PERMISSION_DENIED' } } }]);
        await assert.rejects(() => listModels({ provider: 'google-ai-studio', apiKey: 'bad' }), (/** @type {any} */ error) => {
            assert.equal(error.code, 'invalid_key');
            return true;
        });
    });

    it('clasifica 429 como rate_limited y 5xx como provider_unavailable', async () => {
        stubFetchSequence([{ status: 429, payload: {} }]);
        await assert.rejects(() => listModels({ provider: 'groq', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.code, 'rate_limited');
            return true;
        });

        stubFetchSequence([{ status: 503, payload: {} }]);
        await assert.rejects(() => listModels({ provider: 'groq', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.code, 'provider_unavailable');
            return true;
        });
    });

    it('clasifica un fallo de red como provider_unavailable', async () => {
        stubFetchSequence([{ networkError: true }]);

        await assert.rejects(() => listModels({ provider: 'google-ai-studio', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.code, 'provider_unavailable');
            assert.match(error.message, /No se pudo contactar/);
            return true;
        });
    });

    it('proveedor personalizado: cae al handler OpenAI-compatible best-effort (US-36)', async () => {
        const { calls } = stubFetchSequence([{
            payload: { data: [{ id: 'mistral-7b' }] }
        }]);
        const models = await listModels({ provider: 'self-hosted', apiKey: 'k', apiBase: 'https://gateway.example.com/v1' });
        assert.deepEqual(models, [{ id: 'mistral-7b', label: 'mistral-7b' }]);
        assert.equal(calls[0].url, 'https://gateway.example.com/v1/models');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
    });
});
