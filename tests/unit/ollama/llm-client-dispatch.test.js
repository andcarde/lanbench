'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const proxyquire = require('proxyquire');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds a recording fake LLM client.
 * @param {string} name - Client label captured in calls.
 * @param {any[]} sink - Shared array that records calls.
 * @returns {Record<string, any>}
 */
function fakeClient(name, sink) {
    return {
        async generateJson(/** @type {*} */ options) { sink.push({ name, method: 'generateJson', options }); return { from: name }; },
        async generateText(/** @type {*} */ options) { sink.push({ name, method: 'generateText', options }); return `text-from-${name}`; }
    };
}

/**
 * Loads the dispatcher with stubbed clients and a stubbed config.
 * @param {{ model:string }} config - Stub config.
 * @param {any[]} sink - Call recorder.
 * @returns {Record<string, any>}
 */
function loadDispatcher(config, sink) {
    return proxyquire('../../../utils/llm-client', {
        '../config': config,
        './ollama-client': fakeClient('ollama', sink),
        './groq-client': fakeClient('groq-global', sink),
        './openai-compatible-client': fakeClient('openai-compatible', sink),
        './anthropic-client': fakeClient('anthropic', sink)
    });
}

describe('llm-client dispatch (T5)', () => {
    it('routes generateJson by providerConfig.provider (anthropic)', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'cloud' }, sink);

        await dispatcher.generateJson({
            system: 's',
            prompt: 'p',
            providerConfig: { provider: 'anthropic', apiBase: 'https://api.anthropic.com', model: 'claude', apiKey: 'k' }
        });

        assert.equal(sink[0].name, 'anthropic');
        assert.equal(sink[0].options.apiKey, 'k');
        assert.equal(sink[0].options.model, 'claude');
    });

    it('routes openai-compatible / groq providers to the generic client', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'local' }, sink);

        await dispatcher.generateJson({ prompt: 'p', providerConfig: { provider: 'groq', model: 'llama', apiKey: 'k', apiBase: 'https://b' } });
        assert.equal(sink[0].name, 'openai-compatible');
        assert.equal(sink[0].options.providerName, 'groq');
        assert.equal(sink[0].options.apiBase, 'https://b');
    });

    it('routes google-ai-studio to the generic client with Google\'s OpenAI-compat apiBase by default (US-35)', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'cloud' }, sink);

        await dispatcher.generateJson({ prompt: 'p', providerConfig: { provider: 'google-ai-studio', model: 'gemini-2.0-flash', apiKey: 'k' } });
        assert.equal(sink[0].name, 'openai-compatible');
        assert.equal(sink[0].options.providerName, 'Google AI Studio');
        assert.equal(sink[0].options.apiBase, 'https://generativelanguage.googleapis.com/v1beta/openai');

        // An explicit apiBase still wins over the default.
        await dispatcher.generateText({ prompt: 'p', providerConfig: { provider: 'google-ai-studio', model: 'gemini-2.0-flash', apiKey: 'k', apiBase: 'https://proxy.example.com' } });
        assert.equal(sink[1].options.apiBase, 'https://proxy.example.com');
    });

    it('routes local/ollama providerConfig to the ollama client, mapping apiBase to host', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'cloud' }, sink);

        await dispatcher.generateJson({ prompt: 'p', providerConfig: { provider: 'ollama', model: 'llama3', apiBase: 'http://127.0.0.1:11434' } });
        assert.equal(sink[0].name, 'ollama');
        assert.equal(sink[0].options.host, 'http://127.0.0.1:11434');
    });

    it('falls back to the global client when there is no providerConfig (cloud → groq)', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'cloud' }, sink);

        await dispatcher.generateJson({ system: 's', prompt: 'p' });
        assert.equal(sink[0].name, 'groq-global');
        assert.equal('providerConfig' in sink[0].options, false);
    });

    it('falls back to ollama when global model is local', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'local' }, sink);

        await dispatcher.generateJson({ system: 's', prompt: 'p' });
        assert.equal(sink[0].name, 'ollama');
    });

    it('generateText routes by providerConfig and returns the raw text', async () => {
        /** @type {any[]} */
        const sink = [];
        const dispatcher = loadDispatcher({ model: 'cloud' }, sink);

        const text = await dispatcher.generateText({ prompt: 'hi', providerConfig: { provider: 'anthropic', model: 'claude', apiKey: 'k' } });
        assert.equal(text, 'text-from-anthropic');
        assert.equal(sink[0].method, 'generateText');
    });
});
