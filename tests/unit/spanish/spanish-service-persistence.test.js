'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSpanishService } = require('../../../domain/spanish/spanish-service');
const { buildAnnotationRows } = require('../../../repositories/annotations-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('spanish-service persistence', () => {
    it('checkBatch fusiona reglas locales con alertas semanticas de Ollama', async () => {
        const spanishService = createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [
                        {
                            valid: false,
                            alerts: [{
                                code: 'incomplete_semantics',
                                type: 'semantic',
                                severity: 'error',
                                source: 'llm',
                                message: 'La oracion omite la relacion de liderazgo.',
                                suggestion: 'Punjab, Pakistan, esta liderado por la Asamblea Provincial del Punjab.'
                            }]
                        }
                    ];
                }
            }
        });

        const result = await spanishService.checkBatch(['La provincia de Pakistan'], {
            triples: [{
                subject: 'Punjab,_Pakistan',
                predicate: 'leaderTitle',
                object: 'Provincial_Assembly_of_the_Punjab'
            }]
        });

        assert.equal(result[0].valid, false);
        assert.equal(result[0].reason, 'La oracion es un fragmento y no verbaliza la relacion RDF.');
        assert.equal(result[0].alerts[0].code, 'incomplete_sentence');
        assert.ok(result[0].alerts.some((/** @type {*} */ alert) => alert.code === 'incomplete_semantics'));
        assert.ok(result[0].alerts.some((/** @type {*} */ alert) => alert.code === 'punctuation_missing'));
    });

    it('checkBatch degrada falsos relation_missing de leaderTitle a aviso cuando la relacion esta cubierta', async () => {
        const spanishService = createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [
                        {
                            valid: false,
                            alerts: [{
                                code: 'relation_missing',
                                type: 'semantic',
                                severity: 'error',
                                source: 'llm',
                                message: 'La candidata no verbaliza la relacion del triple RDF.',
                                suggestion: 'Agregar la relacion.'
                            }]
                        }
                    ];
                }
            }
        });

        const result = await spanishService.checkBatch(['La asamblea de Punjab gobierna Punjab, Pakistan.'], {
            triples: [{
                subject: 'Punjab,_Pakistan',
                predicate: 'leaderTitle',
                object: 'Provincial_Assembly_of_the_Punjab'
            }]
        });

        assert.equal(result[0].valid, false);
        assert.equal(result[0].alerts.length, 1);
        assert.equal(result[0].alerts[0].code, 'imprecise_entity_name');
        assert.equal(result[0].alerts[0].severity, 'warning');
    });

    it('checkBatch suprime falsos positivos del LLM cuando la cobertura determinista es completa', async () => {
        const spanishService = createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [
                        {
                            valid: false,
                            alerts: [{
                                code: 'relation_missing',
                                type: 'semantic',
                                severity: 'error',
                                source: 'llm',
                                message: 'La frase no verbaliza el pais.'
                            }]
                        }
                    ];
                }
            }
        });

        const result = await spanishService.checkBatch(['Madrid esta en Espana.'], {
            triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }]
        });

        assert.deepEqual(result[0], { valid: true, reason: null, suggestion: null });
    });

    it('checkBatch mantiene error determinista cuando falta el objeto del triple', async () => {
        const spanishService = createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [{ valid: true, reason: null, suggestion: null }];
                }
            }
        });

        const result = await spanishService.checkBatch(['Madrid esta en Francia.'], {
            triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }]
        });

        assert.equal(result[0].valid, false);
        assert.equal(result[0].alerts[0].code, 'missing_triple');
    });

    it('checkBatch pide otra respuesta a Ollama y adjunta proposal cuando el LLM rechaza una oracion', async () => {
        /** @type {any[]} */
        const proposalCalls = [];
        const spanishService = createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [
                        {
                            valid: false,
                            alerts: [{
                                code: 'semantic_mismatch',
                                type: 'semantic',
                                severity: 'error',
                                source: 'llm',
                                message: 'La candidata cambia el pais.'
                            }]
                        }
                    ];
                },
                async proposeCorrectionsBatch(/** @type {*} */ sentences, /** @type {*} */ context, /** @type {*} */ validations) {
                    proposalCalls.push({ sentences, context, validations });
                    return ['Madrid esta en Espana.'];
                }
            }
        });

        const context = {
            triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }],
            sourceSentences: ['Madrid is in Spain.']
        };
        const result = await spanishService.checkBatch(['Madrid esta en Francia.'], context);

        assert.equal(result[0].valid, false);
        assert.equal(result[0].proposal, 'Madrid esta en Espana.');
        assert.equal(proposalCalls.length, 1);
        assert.deepEqual(proposalCalls[0].sentences, ['Madrid esta en Francia.']);
        assert.equal(proposalCalls[0].validations[0].valid, false);
    });

    it('save persiste anotaciones ligadas a entry y user mediante el repositorio', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const spanishService = createSpanishService({
            annotationsRepository: {
                /**
                 * Ejecuta de forma asincrona la logica de replace for accessible entry.
                 * @param {*} payload - Valor de payload usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async replaceForAccessibleEntry(payload) {
                    capturedCalls.push(payload);
                    return { entryId: 44, savedCount: 2 };
                }
            }
        });

        const result = await spanishService.save({
            userId: 8,
            datasetId: 3,
            rdfId: 12,
            sentences: ['Primera.', 'Segunda.'],
            rejectionReasons: [null, 'Motivo']
        });

        assert.deepEqual(result, {
            ok: true,
            datasetId: 3,
            rdfId: 12,
            savedCount: 2
        });
        assert.deepEqual(capturedCalls, [{
            userId: 8,
            datasetId: 3,
            eid: 12,
            sentences: [
                { sentenceIndex: 0, sentence: 'Primera.', rejectionReason: null },
                { sentenceIndex: 1, sentence: 'Segunda.', rejectionReason: 'Motivo' }
            ]
        }]);
    });

    it('buildAnnotationRows emite una fila por sentenceIndex de la entry', () => {
        const rows = buildAnnotationRows({
            datasetId: 3,
            userId: 8,
            sentences: [
                { sentenceIndex: 0, sentence: 'Primera.', rejectionReason: null },
                { sentenceIndex: 1, sentence: 'Segunda.', rejectionReason: 'Motivo' }
            ]
        });

        assert.deepEqual(rows, [
            {
                datasetId: 3,
                userId: 8,
                sentenceIndex: 0,
                sentence: 'Primera.',
                rejectionReason: null,
                origin: 'manual'
            },
            {
                datasetId: 3,
                userId: 8,
                sentenceIndex: 1,
                sentence: 'Segunda.',
                rejectionReason: 'Motivo',
                origin: 'manual'
            }
        ]);
    });
});
