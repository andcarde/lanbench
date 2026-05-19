'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { VALIDATION_CODES } = require('../../../constants/validation-codes');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('validation-alert-catalog (normalizeBatchOllamaResult)', () => {
    /** @type {any} */
    /** @type {any} */
    let checker;

    before(() => {
        checker = require('../../../domain/spanish/ollama-spanish-checker');
    });

    describe('normalizeBatchOllamaResult con codigos del catalogo', () => {
        it('usa el mensaje fijo del catalogo para spelling_error sin explanation', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{ code: 'spelling_error', severity: 'error' }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['Uevo frito.']);
            assert.equal(results[0].valid, false);
            assert.equal(results[0].alerts[0].code, 'spelling_error');
            assert.equal(results[0].alerts[0].message, 'Falta ortográfica');
        });

        it('concatena explanation al mensaje fijo del catalogo', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{
                        code: 'spelling_error',
                        severity: 'error',
                        explanation: 'uevo en lugar de huevo'
                    }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['Uevo frito.']);
            assert.equal(results[0].alerts[0].message, 'Falta ortográfica: uevo en lugar de huevo');
        });

        it('usa el mensaje fijo para grammar_error', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{ code: 'grammar_error', severity: 'error', explanation: 'los ratón comen' }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['Los ratón comen.']);
            assert.equal(results[0].alerts[0].message, 'Error sintáctico: los ratón comen');
        });

        it('usa el severity del catalogo aunque el LLM devuelva uno diferente', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{ code: 'accent_error', severity: 'error' }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['El arbol crece.']);
            assert.equal(results[0].alerts[0].severity, 'warning');
        });

        it('usa el tipo del catalogo', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{ code: 'accent_error', severity: 'warning', type: 'semantic' }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['El arbol crece.']);
            assert.equal(results[0].alerts[0].type, VALIDATION_CODES.accent_error.type);
        });

        it('maneja codigo desconocido usando explanation como mensaje', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{
                        code: 'codigo_desconocido',
                        severity: 'warning',
                        explanation: 'Descripcion libre del problema'
                    }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['Una frase.']);
            assert.equal(results[0].alerts[0].message, 'Descripcion libre del problema');
        });

        it('usa el campo message del LLM como fallback si no hay explanation ni catalogo', () => {
            const raw = {
                validations: [{
                    sentenceIndex: 0,
                    valid: false,
                    alerts: [{
                        code: 'codigo_desconocido',
                        severity: 'warning',
                        message: 'Mensaje directo del LLM'
                    }]
                }]
            };
            const results = checker.normalizeBatchOllamaResult(raw, ['Una frase.']);
            assert.equal(results[0].alerts[0].message, 'Mensaje directo del LLM');
        });

        it('getBatchSystemPrompt incluye los nuevos codigos', () => {
            const prompt = checker.getBatchSystemPrompt();
            assert.ok(prompt.includes('spelling_error'));
            assert.ok(prompt.includes('accent_error'));
            assert.ok(prompt.includes('missing_comma'));
            assert.ok(prompt.includes('unnatural_expression'));
            assert.ok(prompt.includes('inverted_relation'));
            assert.ok(prompt.includes('rdf_error'));
        });

        it('getBatchSystemPrompt instruye al LLM a usar explanation en lugar de message', () => {
            const prompt = checker.getBatchSystemPrompt();
            assert.ok(prompt.includes('explanation'));
            assert.ok(prompt.includes('NO uses el campo'));
        });

        it('getBatchSystemPrompt no incluye repeated_sentence ni ok', () => {
            const prompt = checker.getBatchSystemPrompt();
            assert.ok(!prompt.includes('repeated_sentence'));
            const firstOccurrence = prompt.indexOf('ok');
            const hasOkAsCode = prompt.includes('"ok"') || prompt.includes(',ok,') || prompt.includes(' ok,') || prompt.includes(',ok ');
            assert.ok(!hasOkAsCode, 'El prompt no debe listar "ok" como codigo LLM');
        });
    });
});
