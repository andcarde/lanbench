'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const openaiCompatible = require('../../../utils/openai-compatible-client');
const anthropic = require('../../../utils/anthropic-client');
const config = require('../../../config');
const llmLogger = require('../../../utils/llm-logger');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const afterEach = /** @type {Mocha.HookFunction} */ (globalThis.afterEach || testApi.afterEach);

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

/**
 * Installs a fetch stub that records the request and returns `payload`.
 * @param {*} payload - JSON body the fake response resolves to.
 * @returns {{ calls: any[] }}
 */
function stubFetch(payload) {
    /** @type {any[]} */
    const calls = [];
    globalThis.fetch = /** @type {any} */ (async (/** @type {*} */ url, /** @type {*} */ init) => {
        calls.push({ url, init });
        const bodyText = JSON.stringify(payload);
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: () => null },
            async json() { return payload; },
            async text() { return bodyText; }
        };
    });
    return { calls };
}

describe('openai-compatible-client (T5)', () => {
    it('generateJson posts to /chat/completions with the bearer key and json mode, returning parsed JSON', async () => {
        const { calls } = stubFetch({ choices: [{ message: { content: '{"valid":true}' } }] });

        const result = await openaiCompatible.generateJson({
            system: 's', prompt: 'p', model: 'llama', apiBase: 'https://api.x.com/v1///', apiKey: 'secret'
        });

        assert.deepEqual(result, { valid: true });
        assert.equal(calls[0].url, 'https://api.x.com/v1/chat/completions');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
        const body = JSON.parse(calls[0].init.body);
        assert.deepEqual(body.response_format, { type: 'json_object' });
        assert.equal(body.model, 'llama');
    });

    it('generateText omits response_format and returns the raw content', async () => {
        const { calls } = stubFetch({ choices: [{ message: { content: "I'm llama and I am ready to work" } }] });

        const text = await openaiCompatible.generateText({ prompt: 'p', model: 'llama', apiBase: 'https://api.x.com/v1', apiKey: 'secret' });

        assert.equal(text, "I'm llama and I am ready to work");
        const body = JSON.parse(calls[0].init.body);
        assert.equal('response_format' in body, false);
    });

    it('omits the system message when no system prompt is given (credential "check" path)', async () => {
        // Regression: the credential "Comprobar" action calls generateText with
        // only a prompt. Sending { role:'system', content:undefined } makes Groq
        // reject the request with 400 "property 'content' is missing". The client
        // must send a single user message instead.
        const { calls } = stubFetch({ choices: [{ message: { content: 'ready' } }] });

        await openaiCompatible.generateText({ prompt: 'p', model: 'llama', apiBase: 'https://api.x.com/v1', apiKey: 'secret' });

        const body = JSON.parse(calls[0].init.body);
        assert.deepEqual(body.messages, [{ role: 'user', content: 'p' }]);
    });

    it('replaces an HTML error body with a hint about the wrong URL (console.groq.com / groq.com)', async () => {
        const htmlBody = '<!DOCTYPE html><html lang="en" class="__variable_f367f3"><head><title>404</title></head><body>not found</body></html>';
        globalThis.fetch = /** @type {any} */ (async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: { get: (/** @type {string} */ name) => name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null },
            async text() { return htmlBody; }
        }));

        try {
            await openaiCompatible.generateText({ prompt: 'p', model: 'm', apiBase: 'https://console.groq.com/openai/v1', apiKey: 'k', providerName: 'Groq' });
            assert.fail('expected a fetch error');
        } catch (/** @type {*} */ error) {
            assert.match(error.message, /respondió con 404/);
            assert.match(error.message, /HTML/);
            assert.match(error.message, /api\.groq\.com\/openai\/v1/);
            assert.equal(error.message.includes('<!DOCTYPE html>'), false);
        }
    });

    it('includes the system message when a system prompt is given', async () => {
        const { calls } = stubFetch({ choices: [{ message: { content: '{"valid":true}' } }] });

        await openaiCompatible.generateJson({ system: 's', prompt: 'p', model: 'llama', apiBase: 'https://api.x.com/v1', apiKey: 'secret' });

        const body = JSON.parse(calls[0].init.body);
        assert.deepEqual(body.messages, [
            { role: 'system', content: 's' },
            { role: 'user', content: 'p' }
        ]);
    });

    it('writes a paired REQUEST/RESPONSE entry to the daily LLM log on every call', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanbench-llm-log-'));
        llmLogger.setLogsDirectory(tmpDir);
        llmLogger.setEnabled(true);

        try {
            stubFetch({ choices: [{ message: { content: 'pong' } }] });

            await openaiCompatible.generateText({
                prompt: 'ping',
                model: 'llama-3.3-70b',
                apiBase: 'https://api.x.com/v1',
                apiKey: 'k',
                providerName: 'Groq'
            });

            await llmLogger.flush();

            const today = new Date();
            const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
            const fileName = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}-llm.txt`;
            const content = fs.readFileSync(path.join(tmpDir, fileName), 'utf8');

            assert.match(content, /REQUEST {2}[a-f0-9]{12}/);
            assert.match(content, /RESPONSE [a-f0-9]{12}/);
            // The id pairs the two blocks.
            const ids = [...content.matchAll(/REQUEST {2}([a-f0-9]{12})|RESPONSE ([a-f0-9]{12})/g)]
                .map(match => match[1] || match[2]);
            assert.equal(ids.length, 2);
            assert.equal(ids[0], ids[1]);

            assert.match(content, /URL: https:\/\/api\.x\.com\/v1\/chat\/completions/);
            assert.match(content, /Model: llama-3\.3-70b/);
            assert.match(content, /\[user\] ping/);
            assert.match(content, /Status: 200/);
            assert.match(content, /pong/);
            assert.match(content, /Duration: \d+ ms/);
        } finally {
            llmLogger.setLogsDirectory(path.join(__dirname, '..', '..', '..', 'logs'));
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('throws a clear error when the API key is missing', async () => {
        // `apiKey: ''` falls back to the global config.groq.apiKey, so clear it to
        // exercise the genuine "no key anywhere" path regardless of the env's .env.
        const savedKey = config.groq.apiKey;
        config.groq.apiKey = '';
        try {
            stubFetch({});
            await assert.rejects(
                () => openaiCompatible.generateText({ prompt: 'p', model: 'm', apiBase: 'https://api.x.com/v1', apiKey: '' }),
                /API key/
            );
        } finally {
            config.groq.apiKey = savedKey;
        }
    });
});

describe('anthropic-client (T5)', () => {
    it('generateJson posts to /v1/messages with x-api-key and normalises text blocks to JSON', async () => {
        const { calls } = stubFetch({ content: [{ type: 'text', text: 'prefix {"valid":false} suffix' }] });

        const result = await anthropic.generateJson({ system: 's', prompt: 'p', model: 'claude-3', apiKey: 'ant-key' });

        assert.deepEqual(result, { valid: false });
        assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
        assert.equal(calls[0].init.headers['x-api-key'], 'ant-key');
        assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
        const body = JSON.parse(calls[0].init.body);
        assert.equal(body.model, 'claude-3');
        assert.equal(body.system, 's');
    });

    it('generateText concatenates the text blocks', async () => {
        stubFetch({ content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] });
        const text = await anthropic.generateText({ prompt: 'p', model: 'claude-3', apiKey: 'k' });
        assert.equal(text, 'Hello world');
    });

    it('honours a custom apiBase override', async () => {
        const { calls } = stubFetch({ content: [{ type: 'text', text: 'ok' }] });
        await anthropic.generateText({ prompt: 'p', model: 'claude-3', apiKey: 'k', apiBase: 'https://proxy.internal' });
        assert.equal(calls[0].url, 'https://proxy.internal/v1/messages');
    });
});
