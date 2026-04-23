'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { generateJson } = require('../utils/ollama-client');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const afterEach = global.afterEach || testApi.afterEach;

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

describe('ollama-client', () => {
    it('normaliza host y parsea el JSON contenido en response', async () => {
        let capturedUrl = '';
        let capturedBody = null;

        global.fetch = async (url, options) => {
            capturedUrl = url;
            capturedBody = JSON.parse(options.body);

            return {
                ok: true,
                async json() {
                    return {
                        response: 'Texto previo {"valid":false,"reason":"Motivo","suggestion":"Corrección"} texto final'
                    };
                }
            };
        };

        const result = await generateJson({
            system: 'system prompt',
            prompt: 'user prompt',
            model: 'mock-model',
            host: 'http://127.0.0.1:11434///',
            timeoutMs: 50
        });

        assert.equal(capturedUrl, 'http://127.0.0.1:11434/api/generate');
        assert.deepEqual(capturedBody, {
            model: 'mock-model',
            system: 'system prompt',
            prompt: 'user prompt',
            stream: false,
            format: 'json',
            options: { temperature: 0.1 }
        });
        assert.deepEqual(result, {
            valid: false,
            reason: 'Motivo',
            suggestion: 'Corrección'
        });
    });

    it('lanza error detallado cuando Ollama responde con status no satisfactorio', async () => {
        global.fetch = async () => ({
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            async text() {
                return 'upstream down';
            }
        });

        await assert.rejects(
            () => generateJson({ system: 's', prompt: 'p', timeoutMs: 50 }),
            error => {
                assert.match(error.message, /503/);
                assert.match(error.message, /upstream down/);
                return true;
            }
        );
    });

    it('lanza error cuando el payload no contiene response textual', async () => {
        global.fetch = async () => ({
            ok: true,
            async json() {
                return { done: true };
            }
        });

        await assert.rejects(
            () => generateJson({ system: 's', prompt: 'p', timeoutMs: 50 }),
            error => {
                assert.match(error.message, /campo response válido/i);
                return true;
            }
        );
    });

    it('transforma AbortError en mensaje de timeout de Ollama', async () => {
        global.fetch = (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const abortError = new Error('aborted');
                abortError.name = 'AbortError';
                reject(abortError);
            });
        });

        await assert.rejects(
            () => generateJson({ system: 's', prompt: 'p', timeoutMs: 10 }),
            error => {
                assert.equal(
                    error.message,
                    'La petición a Ollama ha excedido el tiempo máximo de espera.'
                );
                return true;
            }
        );
    });
});
