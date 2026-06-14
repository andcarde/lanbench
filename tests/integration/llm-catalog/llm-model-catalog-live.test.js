'use strict';

/**
 * @file Live smoke tests for the provider model catalogs (US-35).
 *
 * Performs real HTTP calls against Groq's `/openai/v1/models` and Google AI
 * Studio's `/v1beta/models` to validate that the normalization (filters, id
 * prefix stripping, sorting) holds against the real payload shapes.
 *
 * Keys are read from `process.env.GROQ_API_KEY` / `process.env.GEMINI_API_KEY`
 * (loaded from `.env` via the `config` module). Each suite skips cleanly when
 * its key is absent, so contributors without credentials are not blocked.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

// Side-effect import: loads `.env` into `process.env`.
require('../../../config');

const { listModels } = require('../../../utils/llm-model-catalog');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

describe('llm-model-catalog live (US-35)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('groq devuelve un catálogo no vacío de modelos de chat', async function () {
        if (!GROQ_API_KEY) {
            // GROQ_API_KEY ausente en el entorno (.env): caso omitido.
            this.skip();
            return;
        }

        const models = await listModels({ provider: 'groq', apiKey: GROQ_API_KEY });

        assert.equal(models.length > 0, true, 'el catálogo de Groq no debería estar vacío');
        for (const model of models) {
            assert.equal(typeof model.id, 'string');
            assert.equal(model.id.trim().length > 0, true);
            assert.doesNotMatch(model.id, /whisper|tts|guard/i, `modelo no-chat filtrado: ${model.id}`);
        }
    });

    it('google-ai-studio devuelve modelos gemini sin el prefijo models/', async function () {
        if (!GEMINI_API_KEY) {
            // GEMINI_API_KEY ausente en el entorno (.env): caso omitido.
            this.skip();
            return;
        }

        const models = await listModels({ provider: 'google-ai-studio', apiKey: GEMINI_API_KEY });

        assert.equal(models.length > 0, true, 'el catálogo de Google AI Studio no debería estar vacío');
        assert.equal(models.some(model => model.id.startsWith('gemini')), true, 'debería contener algún modelo gemini-*');
        for (const model of models)
            assert.equal(model.id.startsWith('models/'), false, `el prefijo models/ debería estar eliminado: ${model.id}`);
    });
});
