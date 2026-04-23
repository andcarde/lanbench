'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsController } = require('../business/annotations-controller');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('annotations-controller', () => {
    it('check acepta EntryContext canónico y devuelve SentenceValidation canónico', async () => {
        const capturedCalls = [];
        const annotationsController = createAnnotationsController({
            annotationsService: {
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
        await annotationsController.check({
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
                async checkSentences() {
                    throw new Error('checkSentences should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await annotationsController.check({
            body: {
                sentences: [1, 2, 3]
            }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, { text: 'Datos inválidos' });
    });

    it('send acepta ids canónicos y devuelve SavedAnnotation canónico', async () => {
        const capturedSaves = [];
        const annotationsController = createAnnotationsController({
            annotationsService: {
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
        await annotationsController.send({
            session: {
                user: {
                    idUser: 7,
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
                idUser: 7,
                idDataset: 3,
                rdfId: 9,
                sentences: ['Primera.', 'Segunda.'],
                rejectionReasons: ['', 'Demasiado literal']
            }
        ]);
    });

    it('send devuelve 403 si no hay sesión válida', async () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async saveSentences() {
                    throw new Error('saveSentences should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await annotationsController.send({
            body: {
                datasetId: 3,
                entryId: 9,
                sentences: ['Primera.'],
                rejectionReasons: ['Aceptada']
            }
        }, response);

        assert.equal(recorder.statusCode, 403);
        assert.deepEqual(recorder.payload, { text: 'Sesión no válida.' });
    });
});

function createResponseRecorder() {
    const recorder = {
        statusCode: null,
        payload: null
    };

    const response = {
        status(code) {
            recorder.statusCode = code;
            return this;
        },
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
