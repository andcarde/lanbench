// @ts-nocheck — proxyquire + testdouble without published types; same seam as ollama-spanish-checker.test.js.

/**
 * @file Contract tests for the validation-alert catalog as consumed via
 * `ollama-spanish-checker.checkBatch`. Each test feeds a synthetic LLM
 * response (mocked at the `ollamaClient` boundary) and asserts on the
 * normalised alert that reaches the caller. Replaces the previous tests
 * that called `normalizeBatchOllamaResult` and `getBatchSystemPrompt`
 * directly (AUDIT-5 §4.5).
 */

'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const td = require('testdouble');
const proxyquire = require('proxyquire').noCallThru();

const { VALIDATION_CODES } = require('../../../constants/validation-codes');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const beforeEach = /** @type {Mocha.HookFunction} */ (globalThis.beforeEach || testApi.beforeEach);
const afterEach = /** @type {Mocha.HookFunction} */ (globalThis.afterEach || testApi.afterEach);

describe('validation-alert-catalog (vía checkBatch)', () => {
    /** @type {any} */
    let checker;
    /** @type {any} */
    let ollamaClientMock;

    beforeEach(() => {
        ollamaClientMock = { generateJson: td.function() };
        checker = proxyquire('../../../domain/spanish/ollama-spanish-checker', {
            '../../utils/llm-client': ollamaClientMock,
            '../../../utils/llm-client': ollamaClientMock
        });
    });

    afterEach(() => {
        td.reset();
    });

    /**
     * Helper that returns an LLM response with a single alert about the
     * first sentence of the batch.
     * @param {object} alert
     * @returns {object}
     */
    function singleAlertResponse(alert) {
        return {
            validations: [{
                sentenceIndex: 0,
                valid: false,
                alerts: [alert]
            }]
        };
    }

    it('usa el mensaje fijo del catálogo para spelling_error sin explanation', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({ code: 'spelling_error', severity: 'error' }));

        const [result] = await checker.checkBatch(['Uevo frito.'], {});

        assert.equal(result.valid, false);
        assert.equal(result.alerts[0].code, 'spelling_error');
        assert.equal(result.alerts[0].message, 'Falta ortográfica');
    });

    it('concatena explanation al mensaje fijo del catálogo', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({
                code: 'spelling_error',
                severity: 'error',
                explanation: 'uevo en lugar de huevo'
            }));

        const [result] = await checker.checkBatch(['Uevo frito.'], {});

        assert.equal(result.alerts[0].message, 'Falta ortográfica: uevo en lugar de huevo');
    });

    it('usa el mensaje fijo para grammar_error', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({
                code: 'grammar_error',
                severity: 'error',
                explanation: 'los ratón comen'
            }));

        const [result] = await checker.checkBatch(['Los ratón comen.'], {});

        assert.equal(result.alerts[0].message, 'Error sintáctico: los ratón comen');
    });

    it('usa el severity del catálogo aunque el LLM devuelva uno diferente', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({ code: 'accent_error', severity: 'error' }));

        const [result] = await checker.checkBatch(['El arbol crece.'], {});

        assert.equal(result.alerts[0].severity, 'warning');
    });

    it('usa el tipo del catálogo', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({
                code: 'accent_error',
                severity: 'warning',
                type: 'semantic'
            }));

        const [result] = await checker.checkBatch(['El arbol crece.'], {});

        assert.equal(result.alerts[0].type, VALIDATION_CODES.accent_error.type);
    });

    it('maneja código desconocido usando explanation como mensaje', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({
                code: 'codigo_desconocido',
                severity: 'warning',
                explanation: 'Descripcion libre del problema'
            }));

        const [result] = await checker.checkBatch(['Una frase.'], {});

        assert.equal(result.alerts[0].message, 'Descripcion libre del problema');
    });

    it('usa el campo message del LLM como fallback si no hay explanation ni catálogo', async () => {
        td.when(ollamaClientMock.generateJson(td.matchers.anything()))
            .thenResolve(singleAlertResponse({
                code: 'codigo_desconocido',
                severity: 'warning',
                message: 'Mensaje directo del LLM'
            }));

        const [result] = await checker.checkBatch(['Una frase.'], {});

        assert.equal(result.alerts[0].message, 'Mensaje directo del LLM');
    });
});
