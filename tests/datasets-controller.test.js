'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsController } = require('../business/datasets-controller');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('datasets-controller', () => {
    it('listAllDatasets devuelve 403 cuando la sesión no es válida', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async listAccessibleDatasetItems() {
                    throw new Error('listAccessibleDatasetItems should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.listAllDatasets({}, response);

        assert.equal(recorder.statusCode, 403);
        assert.deepEqual(recorder.payload, { message: 'Sesión no válida.' });
    });

    it('listAllDatasets devuelve el listado canónico desde datasetsService', async () => {
        const dto = {
            id: 21,
            name: 'ru_dev',
            totalEntries: 790,
            completedPercent: 0,
            remainPercent: 100,
            withoutReviewPercent: 0,
            languages: ['Spanish', 'English'],
            colorClass: 'dataset-purple'
        };

        const datasetsController = createDatasetsController({
            datasetsService: {
                async listAccessibleDatasetItems(idUser) {
                    assert.equal(idUser, 7);
                    return [dto];
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.listAllDatasets({
            session: {
                user: { idUser: 7, email: 'user7@example.com' }
            }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, [dto]);
    });

    it('getDatasetById devuelve 400 cuando id no es entero positivo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetItem() {
                    throw new Error('getAccessibleDatasetItem should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetById({
            params: { id: 'x' },
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, { message: 'El id del dataset es inválido.' });
    });

    it('getDatasetById devuelve 400 cuando id es un entero negativo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetItem() {
                    throw new Error('getAccessibleDatasetItem should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetById({
            params: { id: '-2' },
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, { message: 'El id del dataset es inválido.' });
    });

    it('getDatasetSection devuelve la carga canónica construida por datasetsService', async () => {
        const expectedPayload = {
            datasetId: 3,
            datasetName: 'DATASET 3',
            totalSections: 3,
            sectionIndex: 1,
            sectionSize: 10,
            startEntry: 1,
            endEntry: 10,
            isLastSection: false,
            totalEntries: 10,
            entries: [
                {
                    entryId: 1,
                    category: 'Airport',
                    triples: [],
                    englishSentences: [],
                    sectionIndex: 1
                }
            ]
        };

        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetSection(idUser, idDataset, sectionNumber) {
                    assert.equal(idUser, 7);
                    assert.equal(idDataset, 3);
                    assert.equal(sectionNumber, 1);
                    return expectedPayload;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetSection({
            params: { id: '3', section: '1' },
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, expectedPayload);
    });

    it('getDatasetText devuelve el XML original como text/plain', async () => {
        const xmlContent = '<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>';
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetText(idUser, idDataset) {
                    assert.equal(idUser, 7);
                    assert.equal(idDataset, 8);
                    return xmlContent;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetText({
            params: { id: '8' },
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.equal(recorder.contentType, 'text/plain; charset=utf-8');
        assert.equal(recorder.payload, xmlContent);
    });

    it('createDataset devuelve 400 si no se sube fichero', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async createDataset() {
                    throw new Error('createDataset should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.createDataset({
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, { message: 'No se ha proporcionado un fichero XML.' });
    });

    it('createDataset delega en datasetsService y responde 201', async () => {
        const expectedPayload = {
            ok: true,
            idDataset: 4,
            dataset: {
                id: 4,
                name: 'Mi Dataset',
                totalEntries: 2,
                completedPercent: 0,
                remainPercent: 100,
                withoutReviewPercent: 0,
                languages: ['Spanish', 'English'],
                colorClass: 'dataset-purple'
            }
        };

        const datasetsController = createDatasetsController({
            datasetsService: {
                async createDataset(idUser, file) {
                    assert.equal(idUser, 7);
                    assert.deepEqual(file, {
                        filename: 'tmp_test.xml',
                        originalname: 'Mi Dataset.xml'
                    });
                    return expectedPayload;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.createDataset({
            file: {
                filename: 'tmp_test.xml',
                originalname: 'Mi Dataset.xml'
            },
            session: { user: { idUser: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 201);
        assert.deepEqual(recorder.payload, expectedPayload);
    });
});

function createResponseRecorder() {
    const recorder = {
        statusCode: null,
        payload: null,
        contentType: null
    };

    const response = {
        locals: {},
        status(code) {
            recorder.statusCode = code;
            return this;
        },
        type(value) {
            recorder.contentType = value;
            return this;
        },
        send(payload) {
            recorder.payload = payload;
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
