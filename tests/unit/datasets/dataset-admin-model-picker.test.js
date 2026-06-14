'use strict';

/**
 * Unit coverage for the model-picker helpers of the AI-credentials panel
 * (US-35): catalog capability, response normalization, model-value precedence
 * (dropdown vs manual), request payload building, option markup and the
 * provider aliases added to the JSON importer.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    providerSupportsModelCatalog,
    normaliseCatalogModels,
    resolveModelFieldValue,
    buildModelsRequestPayload,
    buildModelOptionsHtml,
    catalogCacheKey,
    mapJsonProviderToKey
} = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('model picker — providerSupportsModelCatalog', () => {
    it('ofrece el desplegable solo para groq y google-ai-studio', () => {
        assert.equal(providerSupportsModelCatalog('groq'), true);
        assert.equal(providerSupportsModelCatalog(' Google-AI-Studio '), true);
        assert.equal(providerSupportsModelCatalog('anthropic'), false);
        assert.equal(providerSupportsModelCatalog('openai-compatible'), false);
        assert.equal(providerSupportsModelCatalog(null), false);
    });
});

describe('model picker — normaliseCatalogModels', () => {
    it('acepta el payload del backend y descarta entradas inválidas', () => {
        const models = normaliseCatalogModels({
            ok: true,
            models: [
                { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash — Gemini 2.0 Flash' },
                { id: '  ', label: 'vacío' },
                { label: 'sin id' },
                { id: 'llama-3.3-70b-versatile' },
                null
            ]
        });

        assert.deepEqual(models, [
            { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash — Gemini 2.0 Flash' },
            { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }
        ]);
    });

    it('devuelve [] para payloads sin modelos', () => {
        assert.deepEqual(normaliseCatalogModels(null), []);
        assert.deepEqual(normaliseCatalogModels({}), []);
        assert.deepEqual(normaliseCatalogModels({ models: 'x' }), []);
    });
});

describe('model picker — resolveModelFieldValue', () => {
    it('usa el desplegable cuando hay catálogo y una opción real seleccionada', () => {
        assert.equal(resolveModelFieldValue({ catalogSupported: true, selectValue: 'gemini-2.0-flash', manualValue: 'otro' }), 'gemini-2.0-flash');
    });

    it('usa la entrada manual con la opción "escribir manualmente" o sin catálogo', () => {
        assert.equal(resolveModelFieldValue({ catalogSupported: true, selectValue: '__manual__', manualValue: ' mi-modelo ' }), 'mi-modelo');
        assert.equal(resolveModelFieldValue({ catalogSupported: false, selectValue: 'ignorado', manualValue: 'claude-3' }), 'claude-3');
        assert.equal(resolveModelFieldValue({ catalogSupported: true, selectValue: '', manualValue: 'fallback' }), 'fallback');
    });
});

describe('model picker — buildModelsRequestPayload', () => {
    it('normaliza el proveedor y omite los campos vacíos (clave guardada en servidor)', () => {
        assert.deepEqual(buildModelsRequestPayload({ provider: ' Groq ', apiKey: '', apiBase: '' }), { provider: 'groq' });
        assert.deepEqual(
            buildModelsRequestPayload({ provider: 'google-ai-studio', apiKey: ' AIza ', apiBase: ' https://b ' }),
            { provider: 'google-ai-studio', apiKey: 'AIza', apiBase: 'https://b' }
        );
    });
});

describe('model picker — buildModelOptionsHtml', () => {
    it('añade siempre la opción manual al final y escapa el contenido', () => {
        const html = buildModelOptionsHtml([{ id: 'a<b', label: 'x&y' }], 'a<b');
        assert.match(html, /value="a&lt;b" selected/);
        assert.match(html, /x&amp;y/);
        assert.match(html, /__manual__.*Otro \(escribir manualmente\)/);
        assert.equal(html.indexOf('__manual__') > html.indexOf('a&lt;b'), true);
    });

    it('con catálogo vacío solo queda la opción manual', () => {
        const html = buildModelOptionsHtml([], '');
        assert.equal(html.includes('__manual__'), true);
        assert.equal((html.match(/<option/g) || []).length, 1);
    });
});

describe('model picker — catalogCacheKey', () => {
    it('usa una huella de la clave (longitud + últimos 4), nunca la clave completa', () => {
        const key = catalogCacheKey('groq', 'gsk_super_secret_KEY9');
        assert.equal(key.includes('gsk_super_secret'), false);
        assert.equal(key, 'groq::21:KEY9');
        assert.equal(catalogCacheKey('groq', ''), 'groq::stored');
    });
});

describe('model picker — alias de proveedor en el importador JSON', () => {
    it('mapea las etiquetas de Google AI Studio al id canónico', () => {
        assert.equal(mapJsonProviderToKey('google-ai-studio'), 'google-ai-studio');
        assert.equal(mapJsonProviderToKey('Google'), 'google-ai-studio');
        assert.equal(mapJsonProviderToKey('  GEMINI '), 'google-ai-studio');
        assert.equal(mapJsonProviderToKey('AI-Studio'), 'google-ai-studio');
    });

    it('sigue rechazando proveedores desconocidos', () => {
        assert.equal(mapJsonProviderToKey('openai'), null);
        assert.equal(mapJsonProviderToKey('bedrock'), null);
    });
});
