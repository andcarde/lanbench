'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsController } = require('../../../controllers/annotations-controller');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('annotations-controller', () => {
    it('check acepta EntryContext canónico y devuelve SentenceValidation canónico', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Comprueba check sentences y devuelve el resultado de la validacion.
                 * @param {Array<*>} sentences - Valor de sentences usado por la funcion.
                 * @param {*} entryContext - Valor de entryContext usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async checkSentences(sentences, entryContext) {
                    capturedCalls.push({ sentences, entryContext });
                    return [
                        {
                            sentence: 'Esta es correcta.',
                            isValid: true,
                            alerts: [],
                            rejectionReasons: []
                        },
                        {
                            sentence: 'Esto necesita ajuste',
                            isValid: false,
                            alerts: [{
                                code: 'semantic_review',
                                severity: 'warning',
                                message: 'Necesita revisión semántica.',
                                suggestion: 'Oración corregida.'
                            }],
                            rejectionReasons: []
                        }
                    ];
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).check({
            body: {
                sentences: ['Esta es correcta.', 'Esto necesita ajuste'],
                entryContext: {
                    entryId: 15,
                    category: 'Airport',
                    englishSentences: [
                        'This one is correct.',
                        'This one needs revision.'
                    ],
                    sectionIndex: 2,
                    triples: [
                        {
                            subject: 'Madrid',
                            predicate: 'isPartOf',
                            object: 'Spain'
                        }
                    ]
                }
            }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, [
            {
                sentence: 'Esta es correcta.',
                isValid: true,
                alerts: [],
                rejectionReasons: []
            },
            {
                sentence: 'Esto necesita ajuste',
                isValid: false,
                alerts: [{
                    code: 'semantic_review',
                    severity: 'warning',
                    message: 'Necesita revisión semántica.',
                    suggestion: 'Oración corregida.'
                }],
                rejectionReasons: []
            }
        ]);
        assert.equal(capturedCalls.length, 1);
        assert.deepEqual(capturedCalls[0].sentences, ['Esta es correcta.', 'Esto necesita ajuste']);
        assert.equal(capturedCalls[0].entryContext.eid, 15);
        assert.deepEqual(capturedCalls[0].entryContext.sourceSentences, [
            'This one is correct.',
            'This one needs revision.'
        ]);
    });

    it('check devuelve 400 cuando el payload es inválido', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Comprueba check sentences y devuelve el resultado de la validacion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async checkSentences() {
                    throw new Error('checkSentences should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).check({
            body: {
                sentences: [1, 2, 3]
            }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Datos inválidos.',
            code: 'invalid_payload'
        });
    });

    it('send acepta ids canónicos y devuelve SavedAnnotation canónico', async () => {
        /** @type {any[]} */
        const capturedSaves = [];
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Ejecuta de forma asincrona save sentences contra la capa de persistencia o API correspondiente.
                 * @param {*} payload - Valor de payload usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async saveSentences(payload) {
                    capturedSaves.push(payload);
                    return {
                        entryId: 9,
                        datasetId: 3,
                        sentences: ['Primera.', 'Segunda.'],
                        savedAt: '2026-04-23T10:00:00.000Z'
                    };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).send({
            session: {
                user: {
                    id: 7,
                    email: 'annotator@example.com'
                }
            },
            body: {
                datasetId: 3,
                entryId: 9,
                sentences: ['Primera.', 'Segunda.'],
                rejectionReasons: ['', 'Demasiado literal']
            }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, {
            entryId: 9,
            datasetId: 3,
            sentences: ['Primera.', 'Segunda.'],
            savedAt: '2026-04-23T10:00:00.000Z'
        });
        assert.deepEqual(capturedSaves, [
            {
                userId: 7,
                datasetId: 3,
                rdfId: 9,
                sentences: ['Primera.', 'Segunda.'],
                rejectionReasons: ['', 'Demasiado literal']
            }
        ]);
    });

    it('check no aplica reglas de longitud: oraciones cortas se delegan en el servicio', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Comprueba check sentences y devuelve el resultado de la validacion.
                 * @param {Array<*>} sentences - Valor de sentences usado por la funcion.
                 * @param {*} entryContext - Valor de entryContext usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async checkSentences(sentences, entryContext) {
                    capturedCalls.push({ sentences, entryContext });
                    return sentences.map(sentence => ({
                        sentence,
                        isValid: true,
                        alerts: [],
                        rejectionReasons: []
                    }));
                }
            }
        });

        const shortSentences = ['Hola.', 'Es un test.', 'Madrid es capital.'];
        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).check({
            body: {
                sentences: shortSentences,
                entryContext: {
                    entryId: 1,
                    category: 'City',
                    englishSentences: ['Hi.', 'It is a test.', 'Madrid is the capital.'],
                    sectionIndex: 1,
                    triples: [
                        { subject: 'Madrid', predicate: 'capitalOf', object: 'Spain' }
                    ]
                }
            }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.equal(capturedCalls.length, 1);
        assert.deepEqual(capturedCalls[0].sentences, shortSentences);
        assert.equal(Array.isArray(recorder.payload), true);
        assert.equal(recorder.payload.length, shortSentences.length);
        recorder.payload.forEach((/** @type {*} */ validation, /** @type {*} */ index) => {
            assert.equal(validation.sentence, shortSentences[index]);
            assert.equal(validation.isValid, true);
            assert.deepEqual(validation.alerts, []);
            assert.deepEqual(validation.rejectionReasons, []);
        });
    });

    it('send devuelve 401 si no hay sesión válida', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Ejecuta de forma asincrona save sentences contra la capa de persistencia o API correspondiente.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async saveSentences() {
                    throw new Error('saveSentences should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).send({
            body: {
                datasetId: 3,
                entryId: 9,
                sentences: ['Primera.'],
                rejectionReasons: ['Aceptada']
            }
        }, response);

        assert.equal(recorder.statusCode, 401);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Sesión no válida.',
            code: 'unauthenticated'
        });
    });

    it('continue delega en continueDatasetService y devuelve el caso calculado', async () => {
        const expectedPayload = {
            caseNumber: 5,
            sectionNumber: 2,
            entryId: 101
        };

        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset(/** @type {*} */ userId, /** @type {*} */ datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 3);
                    return expectedPayload;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).continue({
            params: { datasetId: '3' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, expectedPayload);
    });

    it('continue devuelve 401 si no hay sesión válida', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset() { throw new Error('continueDataset should not be called'); }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).continue({
            params: { datasetId: '3' }
        }, response);

        assert.equal(recorder.statusCode, 401);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Sesión no válida.',
            code: 'unauthenticated'
        });
    });

    it('continue devuelve 400 si el datasetId es inválido', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset() { throw new Error('continueDataset should not be called'); }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).continue({
            params: { datasetId: 'abc' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'El id del dataset es inválido.',
            code: 'invalid_payload'
        });
    });

    it('next delega en continueDatasetService.getNextEntry y devuelve el payload', async () => {
        const expectedPayload = {
            datasetId: 3,
            datasetName: 'demo',
            totalSections: 2,
            sectionNumber: 1,
            sectionSize: 10,
            totalEntriesInSection: 10,
            entryIndexInSection: 0,
            isLastEntryInSection: false,
            entry: { entryId: 1, sectionIndex: 1, category: 'Airport', triples: [], englishSentences: [] }
        };

        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset() { throw new Error('not used'); },
                async getNextEntry(/** @type {*} */ userId, /** @type {*} */ datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 3);
                    return expectedPayload;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).next({
            params: { datasetId: '3' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, expectedPayload);
    });

    it('next devuelve 401 si no hay sesión válida', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset() { throw new Error('not used'); },
                async getNextEntry() { throw new Error('getNextEntry should not be called'); }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).next({
            params: { datasetId: '3' }
        }, response);

        assert.equal(recorder.statusCode, 401);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Sesión no válida.',
            code: 'unauthenticated'
        });
    });

    it('next devuelve 400 si el datasetId es inválido', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() { throw new Error('not used'); },
                async saveSentences() { throw new Error('not used'); }
            },
            continueDatasetService: {
                async continueDataset() { throw new Error('not used'); },
                async getNextEntry() { throw new Error('getNextEntry should not be called'); }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (annotationsController)).next({
            params: { datasetId: '-5' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'El id del dataset es inválido.',
            code: 'invalid_payload'
        });
    });
});

/**
 * Crea response recorder con la configuracion recibida.
 * @returns {*} Resultado producido por la funcion.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = {
        statusCode: null,
        payload: null
    };

    /** @type {any} */
    const response = {
        /**
         * Ejecuta la logica de status.
         * @param {string} code - Valor de code usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        status(code) {
            recorder.statusCode = code;
            return this;
        },
        /**
         * Ejecuta la logica de json.
         * @param {*} payload - Valor de payload usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        json(payload) {
            recorder.payload = payload;
            return this;
        }
    };

    return {
        response,
        recorder
    };
}
