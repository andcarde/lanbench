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
    mapJsonProviderToKey,
    normaliseCustomProvider,
    validateCustomProviderInput,
    buildProviderMenuHtml,
    composeProviderList
} = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('model picker — providerSupportsModelCatalog', () => {
    it('ofrece el desplegable para proveedores con API pública de modelos y proveedores personalizados (US-36)', () => {
        assert.equal(providerSupportsModelCatalog('groq'), true);
        assert.equal(providerSupportsModelCatalog(' Google-AI-Studio '), true);
        assert.equal(providerSupportsModelCatalog('anthropic'), true);
        assert.equal(providerSupportsModelCatalog('openai-compatible'), true);
        assert.equal(providerSupportsModelCatalog(null), false);
        assert.equal(providerSupportsModelCatalog(''), false);
        // Custom providers: best-effort OpenAI-compatible catalog.
        assert.equal(providerSupportsModelCatalog('self-hosted'), true);
        assert.equal(providerSupportsModelCatalog('a.b_c-1'), true);
        // Names that violate the canonical pattern (uppercase, spaces, special chars) are rejected.
        assert.equal(providerSupportsModelCatalog('Has Space'), false);
        assert.equal(providerSupportsModelCatalog('too-long-name-that-exceeds-the-forty-character-limit-for-providers'), false);
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
    it('devuelve el id seleccionado en el desplegable; el flujo manual ya no existe (US-36 follow-up)', () => {
        assert.equal(resolveModelFieldValue({ selectValue: ' gemini-2.0-flash ' }), 'gemini-2.0-flash');
        assert.equal(resolveModelFieldValue({ selectValue: '' }), '');
        assert.equal(resolveModelFieldValue(null), '');
    });
});

describe('model picker — buildModelsRequestPayload', () => {
    it('normaliza el proveedor y omite la clave vacía; el apiBase nunca viaja (US-36)', () => {
        assert.deepEqual(buildModelsRequestPayload({ provider: ' Groq ', apiKey: '' }), { provider: 'groq' });
        // The apiBase field is silently ignored even if supplied for backwards-compat.
        assert.deepEqual(
            buildModelsRequestPayload({ provider: 'google-ai-studio', apiKey: ' AIza ', apiBase: ' https://b ' }),
            { provider: 'google-ai-studio', apiKey: 'AIza' }
        );
    });
});

describe('model picker — buildModelOptionsHtml', () => {
    it('renderiza solo los modelos del catálogo y escapa el contenido', () => {
        const html = buildModelOptionsHtml([{ id: 'a<b', label: 'x&y' }], 'a<b');
        assert.match(html, /value="a&lt;b" selected/);
        assert.match(html, /x&amp;y/);
        // The "manual entry" sentinel was removed; only catalog entries appear.
        assert.equal(html.includes('__manual__'), false);
        assert.equal(html.includes('escribir manualmente'), false);
    });

    it('con catálogo vacío devuelve una cadena vacía', () => {
        const html = buildModelOptionsHtml([], '');
        assert.equal(html, '');
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
        assert.equal(mapJsonProviderToKey('OpenAI'), 'openai-compatible');
        assert.equal(mapJsonProviderToKey('OpenIA'), 'openai-compatible');
    });

    it('sigue rechazando proveedores desconocidos', () => {
        assert.equal(mapJsonProviderToKey('bedrock'), null);
    });
});

describe('custom providers (US-36) — normaliseCustomProvider', () => {
    it('lleva el nombre a minúsculas, conserva la URL y tolera campos ausentes', () => {
        assert.deepEqual(
            normaliseCustomProvider({ name: ' My-Provider ', urlBase: ' https://x ', createdAt: '2026-06-20T10:00:00Z' }),
            { name: 'my-provider', urlBase: 'https://x', createdAt: '2026-06-20T10:00:00Z' }
        );
        assert.deepEqual(
            normaliseCustomProvider(null),
            { name: '', urlBase: '', createdAt: '' }
        );
    });
});

describe('custom providers (US-36) — validateCustomProviderInput', () => {
    it('acepta nombre + URL válidos sin colisión con built-in ni con custom existentes', () => {
        const result = validateCustomProviderInput({
            name: 'gateway',
            urlBase: 'https://gateway.example.com/v1',
            builtinNames: ['groq', 'anthropic'],
            customNames: ['existing']
        });
        assert.equal(result.hasError, false);
        assert.equal(result.name, null);
        assert.equal(result.urlBase, null);
    });

    it('rechaza nombres vacíos, con espacios o que superan los 40 caracteres', () => {
        assert.equal(validateCustomProviderInput({ name: '', urlBase: 'https://a.b' }).name, 'El nombre del proveedor es obligatorio.');
        assert.match(
            validateCustomProviderInput({ name: 'has space', urlBase: 'https://a.b' }).name,
            /letras minúsculas/
        );
        assert.match(
            validateCustomProviderInput({ name: 'x'.repeat(41), urlBase: 'https://a.b' }).name,
            /letras minúsculas/
        );
    });

    it('marca "Proveedor ya añadido" cuando colisiona con un built-in o un custom existente', () => {
        const builtinClash = validateCustomProviderInput({
            name: 'groq',
            urlBase: 'https://a.b',
            builtinNames: ['groq'],
            customNames: []
        });
        assert.equal(builtinClash.name, 'Proveedor ya añadido');

        const customClash = validateCustomProviderInput({
            name: 'existing',
            urlBase: 'https://a.b',
            builtinNames: [],
            customNames: ['existing']
        });
        assert.equal(customClash.name, 'Proveedor ya añadido');
    });

    it('rechaza URLs que no son http(s) y mayores de 255 caracteres', () => {
        assert.equal(
            validateCustomProviderInput({ name: 'gateway', urlBase: '' }).urlBase,
            'La URL del proveedor es obligatoria.'
        );
        assert.match(
            validateCustomProviderInput({ name: 'gateway', urlBase: 'ftp://x' }).urlBase,
            /http:\/\/ o https:\/\//
        );
        assert.match(
            validateCustomProviderInput({ name: 'gateway', urlBase: 'https://' + 'a'.repeat(260) }).urlBase,
            /http:\/\/ o https:\/\//
        );
    });
});

describe('custom providers (US-36) — composeProviderList', () => {
    it('renderiza built-in primero y luego los custom, marcando isCustom', () => {
        const list = composeProviderList([
            { name: 'self-hosted', urlBase: 'https://a' },
            { name: ' GATEWAY ', urlBase: 'https://b' }
        ]);
        const names = list.map(provider => provider.name);
        // Built-ins are always first, in declaration order.
        assert.deepEqual(names.slice(0, 4), ['groq', 'google-ai-studio', 'openai-compatible', 'anthropic']);
        assert.deepEqual(names.slice(4), ['self-hosted', 'gateway']);
        assert.deepEqual(list.slice(0, 4).map(provider => provider.isCustom), [false, false, false, false]);
        assert.deepEqual(list.slice(4).map(provider => provider.isCustom), [true, true]);
    });

    it('tolera entradas vacías o inválidas', () => {
        const list = composeProviderList(null);
        assert.equal(list.length, 4);
        assert.deepEqual(composeProviderList([{ name: ' ' }]).slice(4), []);
    });
});

describe('custom providers (US-36) — buildProviderMenuHtml', () => {
    it('aplica el patrón Bootstrap dropdown-item al <button> y añade la cruz sólo en custom', () => {
        const html = buildProviderMenuHtml([
            { name: 'groq', label: 'Groq', isCustom: false },
            { name: 'self-hosted', label: 'self-hosted', isCustom: true }
        ]);
        // Built-in: the <li> is plain; the dropdown-item class lives on the inner button.
        assert.match(html, /<li><button[^>]*class="dropdown-item provider-name"[^>]*data-name="groq"/);
        // Custom: the <li> carries data-custom and the cross button is present once.
        assert.match(html, /<li[^>]*data-custom="true"[^>]*data-name="self-hosted"/);
        assert.match(html, /provider-delete[^>]*data-name="self-hosted"/);
        assert.equal((html.match(/provider-delete/g) || []).length, 1);
    });

    it('escapa el contenido para evitar XSS desde el nombre persistido', () => {
        const html = buildProviderMenuHtml([
            { name: 'a"b', label: '<x>', isCustom: true }
        ]);
        assert.equal(html.includes('<x>'), false);
        assert.match(html, /&lt;x&gt;/);
    });

    it('devuelve un placeholder cuando no hay proveedores', () => {
        assert.match(buildProviderMenuHtml([]), /Sin proveedores/);
    });
});
