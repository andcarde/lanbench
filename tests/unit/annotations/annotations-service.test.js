'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService } = require('../../../services/annotations-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('annotations-service', () => {
    it('checkSentences usa checkBatch cuando el spanishService lo soporta', async () => {
        /** @type {any[]} */
        const checkCalls = [];
        /** @type {any[]} */
        const batchCalls = [];
        const service = createAnnotationsService({
            spanishService: {
                async checkBatch(/** @type {*} */ sentences, /** @type {*} */ entryContext) {
                    batchCalls.push({ sentences, entryContext });
                    return [
                        {
                            valid: false,
                            alerts: [{
                                code: 'language_not_spanish',
                                severity: 'error',
                                message: 'La frase esta en ingles.',
                                suggestion: 'Microsoft fue fundada por Bill Gates.'
                            }]
                        },
                        { valid: true, reason: null, suggestion: null }
                    ];
                },
                async check(/** @type {*} */ sentence, /** @type {*} */ context) {
                    checkCalls.push({ sentence, context });
                    return { valid: true, reason: null, suggestion: null };
                },
                async save() {
                    throw new Error('save should not be called');
                }
            }
        });

        const entryContext = {
            entryId: 16,
            category: 'Company',
            triples: [{ subject: 'Microsoft', predicate: 'founder', object: 'Bill_Gates' }],
            englishSentences: ['Microsoft was founded by Bill Gates.']
        };

        const validations = await /** @type {any} */ (service).checkSentences(
            ['Microsoft was founded by Bill Gates.', 'Microsoft fue fundada por Bill Gates.'],
            entryContext
        );

        assert.equal(checkCalls.length, 0);
        assert.deepEqual(batchCalls, [{
            sentences: ['Microsoft was founded by Bill Gates.', 'Microsoft fue fundada por Bill Gates.'],
            entryContext
        }]);
        assert.deepEqual(validations, [
            {
                sentence: 'Microsoft was founded by Bill Gates.',
                isValid: false,
                alerts: [{
                    code: 'language_not_spanish',
                    severity: 'error',
                    message: 'La frase esta en ingles.',
                    suggestion: 'Microsoft fue fundada por Bill Gates.'
                }],
                rejectionReasons: []
            },
            {
                sentence: 'Microsoft fue fundada por Bill Gates.',
                isValid: true,
                alerts: [],
                rejectionReasons: []
            }
        ]);
    });

    it('checkSentences devuelve SentenceValidation canónico y construye el contexto por índice', async () => {
        /** @type {any[]} */
        const checkCalls = [];
        const service = createAnnotationsService({
            spanishService: {
                /**
                 * Checks check and returns the validation result.
                 * @param {*} sentence - Value of sentence used by the function.
                 * @param {*} context - Value of context used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async check(sentence, context) {
                    checkCalls.push({ sentence, context });

                    if (sentence === 'Primera')
                        return { valid: false, reason: 'Error', suggestion: 'Primera.' };

                    return null;
                },
                /**
                 * Asynchronously runs save against the corresponding persistence layer or API.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async save() {
                    throw new Error('save should not be called');
                }
            }
        });

        const validations = await /** @type {any} */ (service).checkSentences(
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
                    entryId: 21,
                    category: 'Airport',
                    triples: [{ subject: 'A', predicate: 'B', object: 'C' }],
                    referenceSentence: 'First source'
                }
            },
            {
                sentence: 'Segunda',
                context: {
                    entryId: 21,
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

    it('checkSentences conserva proposal en el SentenceValidation canónico', async () => {
        const service = createAnnotationsService({
            spanishService: {
                async checkBatch() {
                    return [{
                        valid: false,
                        reason: 'Error semantico.',
                        proposal: 'Microsoft fue fundada por Bill Gates.'
                    }];
                },
                async save() {
                    throw new Error('save should not be called');
                }
            }
        });

        const validations = await /** @type {any} */ (service).checkSentences(
            ['Microsoft fue fundada por Francia.'],
            {
                entryId: 16,
                triples: [{ subject: 'Microsoft', predicate: 'founder', object: 'Bill_Gates' }],
                englishSentences: ['Microsoft was founded by Bill Gates.']
            }
        );

        assert.deepEqual(validations, [{
            sentence: 'Microsoft fue fundada por Francia.',
            isValid: false,
            alerts: [{
                code: 'sentence_review',
                severity: 'warning',
                message: 'Error semantico.'
            }],
            rejectionReasons: [],
            proposal: 'Microsoft fue fundada por Bill Gates.'
        }]);
    });

    it('saveSentences delega la persistencia y devuelve SavedAnnotation canónico', async () => {
        /** @type {any[]} */
        const capturedPayloads = [];
        const service = createAnnotationsService({
            spanishService: {
                /**
                 * Checks check and returns the validation result.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async check() {
                    return { valid: true, reason: null, suggestion: null };
                },
                /**
                 * Asynchronously runs save against the corresponding persistence layer or API.
                 * @param {*} payload - Value of payload used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async save(payload) {
                    capturedPayloads.push(payload);
                    return { ok: true, savedCount: 2 };
                }
            }
        });

        const result = await service.saveSentences({
            userId: 5,
            datasetId: 9,
            rdfId: 17,
            sentences: [
                { sentence: 'Uno.', rejectionReason: null },
                { sentence: 'Dos.', rejectionReason: 'Motivo' }
            ]
        });

        assert.equal(result.entryId, 17);
        assert.equal(result.datasetId, 9);
        assert.deepEqual(result.sentences, ['Uno.', 'Dos.']);
        assert.match(result.savedAt, /^\d{4}-\d{2}-\d{2}T/);
        assert.deepEqual(capturedPayloads, [{
            userId: 5,
            datasetId: 9,
            rdfId: 17,
            sentences: [
                { sentence: 'Uno.', rejectionReason: null },
                { sentence: 'Dos.', rejectionReason: 'Motivo' }
            ]
        }]);
    });

    it('saveSentences propaga errores de guardado envueltos en { error }', async () => {
        const failure = new Error('No se pudo persistir.');
        const service = createAnnotationsService({
            spanishService: {
                /**
                 * Checks check and returns the validation result.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async check() {
                    return { valid: true, reason: null, suggestion: null };
                },
                /**
                 * Asynchronously runs save against the corresponding persistence layer or API.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async save() {
                    return { error: failure };
                }
            }
        });

        await assert.rejects(
            () => service.saveSentences({
                userId: 5,
                datasetId: 9,
                rdfId: 17,
                sentences: [{ sentence: 'Uno.', rejectionReason: null }]
            }),
            failure
        );
    });
});
