'use strict';

/**
 * @file Live smoke test against the Google Gemini API.
 *
 * Performs a real HTTP call to validate that the supplied API key works
 * and that the endpoint returns a well-formed `generateContent` payload.
 * Run via `npm run test:integration`.
 *
 * The API key is read from `process.env.GEMINI_API_KEY` (loaded from `.env`
 * via the `config` module). When the key is absent, the suite skips cleanly
 * so contributors without Gemini credentials are not blocked.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

// Side-effect import: loads `.env` into `process.env`.
require('../../../config');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

describe('gemini-api live key validation', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('responde 200 y devuelve texto generado con la clave proporcionada', async function () {
        if (!GEMINI_API_KEY) {
            this.skip('GEMINI_API_KEY ausente en el entorno (.env). Suite omitida.');
            return;
        }

        const maxAttempts = 4;
        const retryableStatus = new Set([429, 500, 502, 503, 504]);
        let response;
        let rawBody = '';

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const abortTimer = setTimeout(() => controller.abort(), 6000);
            try {
                response = await fetch(GEMINI_URL, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-goog-api-key': GEMINI_API_KEY
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    { text: 'Responde únicamente con la palabra: OK' }
                                ]
                            }
                        ]
                    })
                });
            } catch (networkError) {
                const error = /** @type {any} */ (networkError);
                this.skip(`Sin conectividad con la API de Gemini: ${error?.message || error?.name || error}`);
                return;
            } finally {
                clearTimeout(abortTimer);
            }

            rawBody = await response.text();

            if (response.status === 401 || response.status === 403)
                assert.fail(`La clave de API ha sido rechazada (${response.status}). Cuerpo: ${rawBody}`);

            if (response.status === 200)
                break;

            if (!retryableStatus.has(response.status) || attempt === maxAttempts)
                break;

            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        if (response.status === 503 || response.status === 429) {
            this.skip(`Gemini saturado (${response.status}). La clave no fue rechazada. Cuerpo: ${rawBody}`);
            return;
        }

        assert.equal(
            response.status,
            200,
            `Esperado 200, recibido ${response.status}. Cuerpo: ${rawBody}`
        );

        /** @type {any} */
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch (parseError) {
            const error = /** @type {any} */ (parseError);
            assert.fail(`Respuesta no es JSON válido: ${error.message}. Cuerpo: ${rawBody}`);
        }

        assert.ok(
            Array.isArray(payload.candidates) && payload.candidates.length > 0,
            `Respuesta sin candidates: ${rawBody}`
        );

        const firstCandidate = payload.candidates[0];
        const parts = firstCandidate?.content?.parts;

        assert.ok(
            Array.isArray(parts) && parts.length > 0 && typeof parts[0].text === 'string',
            `Respuesta sin texto generado: ${rawBody}`
        );

        assert.ok(
            parts[0].text.trim().length > 0,
            'El texto generado está vacío.'
        );
    });
});
