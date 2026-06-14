'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const testApi = require('node:test');

const llmLogger = require('../../../utils/llm-logger');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const beforeEach = /** @type {Mocha.HookFunction} */ (globalThis.beforeEach || testApi.beforeEach);
const afterEach = /** @type {Mocha.HookFunction} */ (globalThis.afterEach || testApi.afterEach);

describe('llm-logger', () => {
    /** @type {string} */
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanbench-llm-log-'));
        llmLogger.setLogsDirectory(tmpDir);
        llmLogger.setEnabled(true);
    });

    afterEach(async () => {
        await llmLogger.flush();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes one REQUEST and one matching RESPONSE block to YYYY-MM-DD-llm.txt', async () => {
        const correlationId = llmLogger.generateCorrelationId();
        const requestBody = JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'sys' },
                { role: 'user', content: 'hola' }
            ]
        });

        llmLogger.logLlmRequest({
            correlationId,
            url: 'https://api.groq.com/openai/v1/chat/completions',
            providerName: 'Groq',
            requestBody
        });

        llmLogger.logLlmResponse({
            correlationId,
            url: 'https://api.groq.com/openai/v1/chat/completions',
            providerName: 'Groq',
            requestBody,
            status: 200,
            durationMs: 123,
            bodyText: JSON.stringify({ choices: [{ message: { content: '¡Hola!' } }] })
        });

        await llmLogger.flush();

        const entries = fs.readdirSync(tmpDir).filter(name => name.endsWith('-llm.txt'));
        assert.equal(entries.length, 1, 'expected exactly one daily log file');
        const today = new Date();
        const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
        const expectedName = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}-llm.txt`;
        assert.equal(entries[0], expectedName);

        const content = fs.readFileSync(path.join(tmpDir, expectedName), 'utf8');
        assert.match(content, new RegExp(`REQUEST  ${correlationId}`));
        assert.match(content, new RegExp(`RESPONSE ${correlationId}`));
        assert.match(content, /URL: https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
        assert.match(content, /Model: llama-3\.3-70b-versatile/);
        assert.match(content, /\[user\] hola/);
        assert.match(content, /\[system\] sys/);
        assert.match(content, /Status: 200/);
        assert.match(content, /Duration: 123 ms/);
        assert.match(content, /¡Hola!/);

        // Both blocks share the correlation id (one REQUEST, one RESPONSE).
        const occurrences = content.match(new RegExp(correlationId, 'g')) || [];
        assert.equal(occurrences.length, 2);
    });

    it('supports Anthropic and Ollama request/response shapes', () => {
        const { parseRequestBody, extractResponseText } = llmLogger._internal;

        const anthropicReq = parseRequestBody(JSON.stringify({
            model: 'claude-4', system: 'sys',
            messages: [{ role: 'user', content: 'p' }]
        }));
        assert.equal(anthropicReq.model, 'claude-4');
        assert.match(anthropicReq.prompt, /\[system\] sys/);
        assert.match(anthropicReq.prompt, /\[user\] p/);

        const anthropicResp = extractResponseText(JSON.stringify({
            content: [{ type: 'text', text: 'soy claude' }]
        }));
        assert.equal(anthropicResp, 'soy claude');

        const ollamaReq = parseRequestBody(JSON.stringify({
            model: 'llama3.2', system: 's', prompt: 'p'
        }));
        assert.equal(ollamaReq.model, 'llama3.2');
        assert.match(ollamaReq.prompt, /\[system\] s/);
        assert.match(ollamaReq.prompt, /\[user\] p/);

        const ollamaResp = extractResponseText(JSON.stringify({ response: 'hola desde ollama' }));
        assert.equal(ollamaResp, 'hola desde ollama');
    });

    it('logs an (error) line in the RESPONSE block when the request times out or fails before reaching the server', async () => {
        const correlationId = llmLogger.generateCorrelationId();
        llmLogger.logLlmResponse({
            correlationId,
            url: 'https://api.groq.com/openai/v1/chat/completions',
            providerName: 'Groq',
            durationMs: 60000,
            error: 'timeout'
        });

        await llmLogger.flush();

        const today = new Date();
        const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
        const filePath = path.join(tmpDir, `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}-llm.txt`);
        const content = fs.readFileSync(filePath, 'utf8');
        assert.match(content, /RESPONSE/);
        assert.match(content, /\(error\) timeout/);
    });

    it('is a no-op when disabled', async () => {
        llmLogger.setEnabled(false);
        llmLogger.logLlmRequest({
            correlationId: 'x',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            providerName: 'Groq',
            requestBody: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })
        });
        await llmLogger.flush();
        assert.equal(fs.readdirSync(tmpDir).length, 0);
    });
});
