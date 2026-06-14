'use strict';

/**
 * Unit coverage for the "Cargar desde JSON" importer of the AI-credentials
 * panel: provider mapping (`mapJsonProviderToKey`) and full-file validation
 * (`parseCredentialsJson`). Both are pure helpers, so the format rules can be
 * exercised without a browser.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    mapJsonProviderToKey,
    parseCredentialsJson
} = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('credentials JSON import — mapJsonProviderToKey', () => {
    it('mapea las etiquetas conocidas a sus identificadores canónicos', () => {
        assert.equal(mapJsonProviderToKey('Groq'), 'groq');
        assert.equal(mapJsonProviderToKey('groq'), 'groq');
        assert.equal(mapJsonProviderToKey('OpenAI-compatible'), 'openai-compatible');
        assert.equal(mapJsonProviderToKey('  openai-compatible  '), 'openai-compatible');
        assert.equal(mapJsonProviderToKey('Anthropic'), 'anthropic');
    });

    it('devuelve null para proveedores desconocidos o no string', () => {
        assert.equal(mapJsonProviderToKey('openai'), null);
        assert.equal(mapJsonProviderToKey(''), null);
        assert.equal(mapJsonProviderToKey(null), null);
        assert.equal(mapJsonProviderToKey(undefined), null);
        assert.equal(mapJsonProviderToKey(42), null);
    });
});

describe('credentials JSON import — parseCredentialsJson', () => {
    it('acepta el formato de api-keys.json y normaliza los proveedores', () => {
        const raw = JSON.stringify([
            {
                proveedor: 'OpenAI-compatible',
                modelo: 'gemini-flash-latest',
                url_base: 'https://generativelanguage.googleapis.com/v1beta/openai',
                api_key: 'AQ.Ab8RN6'
            },
            {
                proveedor: 'Groq',
                modelo: 'llama-3.3-70b-versatile',
                url_base: 'https://api.groq.com/openai/v1',
                api_key: 'gsk_CM8q'
            }
        ]);

        const { entries, errors } = parseCredentialsJson(raw);

        assert.deepEqual(errors, []);
        assert.deepEqual(entries, [
            {
                provider: 'openai-compatible',
                model: 'gemini-flash-latest',
                apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
                apiKey: 'AQ.Ab8RN6'
            },
            {
                provider: 'groq',
                model: 'llama-3.3-70b-versatile',
                apiBase: 'https://api.groq.com/openai/v1',
                apiKey: 'gsk_CM8q'
            }
        ]);
    });

    it('trata url_base ausente o vacía como null (campo opcional)', () => {
        const raw = JSON.stringify([
            { proveedor: 'Groq', modelo: 'llama-3.3-70b-versatile', api_key: 'gsk_xxxx' }
        ]);

        const { entries, errors } = parseCredentialsJson(raw);

        assert.deepEqual(errors, []);
        assert.equal(entries.length, 1);
        assert.equal(entries[0].apiBase, null);
    });

    it('reporta un error por cada proveedor inválido y no incluye la entrada', () => {
        const raw = JSON.stringify([
            { proveedor: 'OpenAI', modelo: 'gpt-4', api_key: 'sk-xxx' },
            { proveedor: 'Groq', modelo: 'llama-3.3', api_key: 'gsk_yyy' }
        ]);

        const { entries, errors } = parseCredentialsJson(raw);

        assert.equal(entries.length, 1);
        assert.equal(entries[0].provider, 'groq');
        assert.equal(errors.length, 1);
        assert.match(errors[0], /Elemento 1/);
        assert.match(errors[0], /proveedor inválido/);
        assert.match(errors[0], /OpenAI/);
    });

    it('reporta los campos obligatorios faltantes', () => {
        const raw = JSON.stringify([
            { proveedor: 'Groq', modelo: '', api_key: 'gsk_xxx' },
            { proveedor: 'Groq', modelo: 'llama', api_key: '' }
        ]);

        const { entries, errors } = parseCredentialsJson(raw);

        assert.deepEqual(entries, []);
        assert.equal(errors.length, 2);
        assert.match(errors[0], /modelo/);
        assert.match(errors[1], /api_key/);
    });

    it('rechaza JSON inválido o que no sea un array', () => {
        assert.deepEqual(
            parseCredentialsJson('no soy json'),
            { entries: [], errors: ['El archivo no contiene JSON válido.'] }
        );
        assert.deepEqual(
            parseCredentialsJson(JSON.stringify({ proveedor: 'Groq' })),
            { entries: [], errors: ['El JSON debe ser un array de credenciales.'] }
        );
    });

    it('tolera elementos no objeto sin romper y los reporta', () => {
        const raw = JSON.stringify([null, 'string suelta', 42]);
        const { entries, errors } = parseCredentialsJson(raw);

        assert.deepEqual(entries, []);
        assert.equal(errors.length, 3);
        errors.forEach((message, index) => {
            assert.match(message, new RegExp(`Elemento ${index + 1}`));
        });
    });
});
