'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService } = require('../services/annotations-service');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('annotations-service', () => {
    it('checkSentences devuelve SentenceValidation canónico y construye el contexto por índice', async () => {
        const checkCalls = [];
        const service = createAnnotationsService({
            spanishService: {
                async check(sentence, context) {
                    checkCalls.push({ sentence, context });

                    if (sentence === 'Primera')
                        return { valid: false, reason: 'Error', suggestion: 'Primera.' };

                    return null;
                },
                async save() {
                    throw new Error('save should not be called');
                }
            }
        });

        const validations = await service.checkSentences(
            ['Primera', 'Segunda'],
            {
                entryId: 21,
                category: 'Airport',
                triples: [{ subject: 'A', predicate: 'B', object: 'C' }],
                englishSentences: ['First source', 'Second source']
            }
        );

        assert.deepEqual(checkCalls, [
            {
                sentence: 'Primera',
                context: {
                    eid: 21,
                    category: 'Airport',
                    triples: [{ subject: 'A', predicate: 'B', object: 'C' }],
                    referenceSentence: 'First source'
                }
            },
            {
                sentence: 'Segunda',
                context: {
                    eid: 21,
                    category: 'Airport',
                    triples: [{ subject: 'A', predicate: 'B', object: 'C' }],
                    referenceSentence: 'Second source'
                }
            }
        ]);
        assert.deepEqual(validations, [
            {
                sentence: 'Primera',
                isValid: false,
                alerts: [{
                    code: 'sentence_review',
                    severity: 'warning',
                    message: 'Error',
                    suggestion: 'Primera.'
                }],
                rejectionReasons: []
            },
            {
                sentence: 'Segunda',
                isValid: true,
                alerts: [],
                rejectionReasons: []
            }
        ]);
    });

    it('saveSentences delega la persistencia y devuelve SavedAnnotation canónico', async () => {
        const capturedPayloads = [];
        const service = createAnnotationsService({
            spanishService: {
                async check() {
                    return { valid: true, reason: null, suggestion: null };
                },
                async save(payload) {
                    capturedPayloads.push(payload);
                    return { ok: true, savedCount: 2 };
                }
            }
        });

        const result = await service.saveSentences({
            idUser: 5,
            idDataset: 9,
            rdfId: 17,
            sentences: ['Uno.', 'Dos.'],
            rejectionReasons: ['', 'Motivo']
        });

        assert.equal(result.entryId, 17);
        assert.equal(result.datasetId, 9);
        assert.deepEqual(result.sentences, ['Uno.', 'Dos.']);
        assert.match(result.savedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepEqual(capturedPayloads, [{
            idUser: 5,
            idDataset: 9,
            rdfId: 17,
            sentences: ['Uno.', 'Dos.'],
            rejectionReasons: ['', 'Motivo']
        }]);
    });

    it('saveSentences propaga errores de guardado envueltos en { error }', async () => {
        const failure = new Error('No se pudo persistir.');
        const service = createAnnotationsService({
            spanishService: {
                async check() {
                    return { valid: true, reason: null, suggestion: null };
                },
                async save() {
                    return { error: failure };
                }
            }
        });

        await assert.rejects(
            () => service.saveSentences({
                idUser: 5,
                idDataset: 9,
                rdfId: 17,
                sentences: ['Uno.'],
                rejectionReasons: [null]
            }),
            failure
        );
    });
});
