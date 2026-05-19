'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService, injectDuplicateAlerts } = require('../../../services/annotations-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('repeated-sentence-detection', () => {
    describe('injectDuplicateAlerts', () => {
        it('no añade alerta si no hay previousSentences', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(['Hola mundo.'], results, {});
            assert.deepEqual(results[0].alerts, []);
        });

        it('no añade alerta si previousSentences esta vacio', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(['Hola mundo.'], results, { previousSentences: [] });
            assert.deepEqual(results[0].alerts, []);
        });

        it('añade alerta repeated_sentence cuando la oracion coincide exactamente', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(
                ['Hola mundo.'],
                results,
                { previousSentences: ['Hola mundo.'] }
            );
            assert.equal(results[0].alerts.length, 1);
            assert.equal(results[0].alerts[0].code, 'repeated_sentence');
            assert.equal(results[0].alerts[0].severity, 'duplicate');
            assert.equal(results[0].alerts[0].type, 'diversity');
        });

        it('la comparacion es case-insensitive', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(
                ['hola mundo.'],
                results,
                { previousSentences: ['Hola Mundo.'] }
            );
            assert.equal(results[0].alerts.length, 1);
            assert.equal(results[0].alerts[0].code, 'repeated_sentence');
        });

        it('ignora espacios iniciales y finales en la comparacion', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(
                ['  Hola mundo.  '],
                results,
                { previousSentences: ['Hola mundo.'] }
            );
            assert.equal(results[0].alerts.length, 1);
        });

        it('no añade alerta cuando las oraciones son distintas', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }, { valid: true, alerts: [] }];
            injectDuplicateAlerts(
                ['Hola mundo.', 'Adios mundo.'],
                results,
                { previousSentences: ['Otra frase diferente.'] }
            );
            assert.equal(results[0].alerts.length, 0);
            assert.equal(results[1].alerts.length, 0);
        });

        it('solo marca las oraciones que coinciden cuando hay varias', () => {
            /** @type {any[]} */
            const results = [
                { valid: true, alerts: [] },
                { valid: true, alerts: [] },
                { valid: true, alerts: [] }
            ];
            injectDuplicateAlerts(
                ['Primera.', 'Segunda.', 'Tercera.'],
                results,
                { previousSentences: ['Segunda.'] }
            );
            assert.equal(results[0].alerts.length, 0);
            assert.equal(results[1].alerts.length, 1);
            assert.equal(results[1].alerts[0].code, 'repeated_sentence');
            assert.equal(results[2].alerts.length, 0);
        });

        it('conserva las alertas previas del LLM y añade repeated_sentence ademas', () => {
            const existingAlert = {
                code: 'spelling_error',
                severity: 'error',
                message: 'Falta ortográfica',
                type: 'orthography',
                source: 'llm'
            };
            /** @type {any[]} */
            const results = [{ valid: false, alerts: [existingAlert] }];
            injectDuplicateAlerts(
                ['Hola mundo.'],
                results,
                { previousSentences: ['Hola mundo.'] }
            );
            assert.equal(results[0].alerts.length, 2);
            assert.equal(results[0].alerts[0].code, 'spelling_error');
            assert.equal(results[0].alerts[1].code, 'repeated_sentence');
        });

        it('no añade alerta para oraciones vacias', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(
                [''],
                results,
                { previousSentences: [''] }
            );
            assert.equal(results[0].alerts.length, 0);
        });

        it('ignora entradas no-string en previousSentences', () => {
            /** @type {any[]} */
            const results = [{ valid: true, alerts: [] }];
            injectDuplicateAlerts(
                ['Hola.'],
                results,
                { previousSentences: [null, undefined, 42, 'Hola.'] }
            );
            assert.equal(results[0].alerts.length, 1);
        });
    });

    describe('checkSentences con previousSentences en entryContext', () => {
        it('inyecta alerta duplicate cuando una oracion ya fue enviada', async () => {
            const service = createAnnotationsService({
                spanishService: {
                    async checkBatch(/** @type {*} */ sentences) {
                        return sentences.map(() => ({ valid: true, alerts: [] }));
                    },
                    async save() { throw new Error('no deberia llamarse'); }
                }
            });

            const validations = await service.checkSentences(
                ['Oracion repetida.', 'Oracion nueva.'],
                /** @type {any} */ ({ previousSentences: ['Oracion repetida.'] })
            );

            const repeated = /** @type {any} */ (validations.find((/** @type {*} */ v) => v.sentence === 'Oracion repetida.'));
            const fresh = /** @type {any} */ (validations.find((/** @type {*} */ v) => v.sentence === 'Oracion nueva.'));

            assert.ok(repeated.alerts.some((/** @type {*} */ a) => a.code === 'repeated_sentence'));
            assert.ok(!fresh.alerts.some((/** @type {*} */ a) => a.code === 'repeated_sentence'));
        });

        it('no inyecta alerta si previousSentences no esta en el contexto', async () => {
            const service = createAnnotationsService({
                spanishService: {
                    async checkBatch(/** @type {*} */ sentences) {
                        return sentences.map(() => ({ valid: true, alerts: [] }));
                    },
                    async save() { throw new Error('no deberia llamarse'); }
                }
            });

            const validations = await service.checkSentences(
                ['Oracion cualquiera.'],
                /** @type {any} */ ({})
            );

            assert.equal(validations[0].alerts.length, 0);
        });
    });
});
