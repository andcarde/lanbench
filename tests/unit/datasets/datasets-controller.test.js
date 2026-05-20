'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsController } = require('../../../controllers/datasets-controller');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('datasets-controller', () => {
    it('listAllDatasets devuelve 401 cuando la sesión no es válida', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Mock of the list-accessible-dataset-items service method.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async listAccessibleDatasetItems() {
                    throw new Error('listAccessibleDatasetItems should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.listAllDatasets({}, response);

        assert.equal(recorder.statusCode, 401);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Sesión no válida.',
            code: 'unauthenticated'
        });
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
                /**
                 * Mock of the list-accessible-dataset-items service method.
                 * @param {*} userId - Value of userId used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async listAccessibleDatasetItems(userId) {
                    assert.equal(userId, 7);
                    return [dto];
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.listAllDatasets({
            session: {
                user: { id: 7, email: 'user7@example.com' }
            }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, [dto]);
    });

    it('getDatasetById devuelve 400 cuando id no es entero positivo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Gets the accessible dataset item from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async getAccessibleDatasetItem() {
                    throw new Error('getAccessibleDatasetItem should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetById({
            params: { id: 'x' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'El id del dataset es inválido.',
            code: 'invalid_payload'
        });
    });

    it('getDatasetById devuelve 400 cuando id es un entero negativo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Gets the accessible dataset item from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async getAccessibleDatasetItem() {
                    throw new Error('getAccessibleDatasetItem should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetById({
            params: { id: '-2' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'El id del dataset es inválido.',
            code: 'invalid_payload'
        });
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
                /**
                 * Gets the accessible dataset section from the corresponding source.
                 * @param {*} userId - Value of userId used by the function.
                 * @param {*} datasetId - Value of datasetId used by the function.
                 * @param {number} sectionNumber - Value of sectionNumber used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async getAccessibleDatasetSection(userId, datasetId, sectionNumber) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 3);
                    assert.equal(sectionNumber, 1);
                    return expectedPayload;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetSection({
            params: { id: '3', section: '1' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, expectedPayload);
    });

    it('getDatasetText devuelve el XML original como text/plain', async () => {
        const xmlContent = '<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>';
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Gets the accessible dataset text from the corresponding source.
                 * @param {*} userId - Value of userId used by the function.
                 * @param {*} datasetId - Value of datasetId used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async getAccessibleDatasetText(userId, datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 8);
                    return xmlContent;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.getDatasetText({
            params: { id: '8' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.equal(recorder.contentType, 'text/plain; charset=utf-8');
        assert.equal(recorder.payload, xmlContent);
    });

    it('downloadDatasetXml descarga el XML como adjunto con su filename', async () => {
        const xmlBody = '<benchmark>downloaded</benchmark>';
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetXmlDownload(/** @type {*} */ userId, /** @type {*} */ datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 8);
                    return {
                        filename: 'ru_dev.xml',
                        body: xmlBody,
                        contentType: 'application/xml; charset=utf-8'
                    };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetXml({
            params: { id: '8' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.equal(recorder.contentType, 'application/xml; charset=utf-8');
        assert.equal(recorder.headers['Content-Disposition'], 'attachment; filename="ru_dev.xml"');
        assert.equal(recorder.payload, xmlBody);
    });

    it('downloadDatasetXml devuelve 400 cuando id no es entero positivo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetXmlDownload() {
                    throw new Error('getAccessibleDatasetXmlDownload should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetXml({
            params: { id: 'x' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'El id del dataset es inválido.',
            code: 'invalid_payload'
        });
    });

    it('downloadDatasetXml devuelve 401 sin sesión válida', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetXmlDownload() {
                    throw new Error('getAccessibleDatasetXmlDownload should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetXml({ params: { id: '8' } }, response);

        assert.equal(recorder.statusCode, 401);
        assert.equal(recorder.payload?.code, 'unauthenticated');
    });

    it('downloadDatasetAnnotatedXml descarga el XML extendido con filename <name>-extended.xml', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetAnnotatedXmlDownload(/** @type {*} */ userId, /** @type {*} */ datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 8);
                    return {
                        filename: 'ru_dev-extended.xml',
                        body: '<benchmark>extended</benchmark>',
                        contentType: 'application/xml; charset=utf-8'
                    };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetAnnotatedXml({
            params: { id: '8' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.equal(recorder.contentType, 'application/xml; charset=utf-8');
        assert.equal(
            recorder.headers['Content-Disposition'],
            'attachment; filename="ru_dev-extended.xml"'
        );
        assert.equal(recorder.payload, '<benchmark>extended</benchmark>');
    });

    it('downloadDatasetAnnotatedXml propaga el 409 dataset_not_completed del service', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetAnnotatedXmlDownload() {
                    const error = /** @type {any} */ (new Error('El dataset todavía no está completado al 100%.'));
                    error.status = 409;
                    error.code = 'dataset_not_completed';
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetAnnotatedXml({
            params: { id: '8' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 409);
        assert.equal(recorder.payload?.code, 'dataset_not_completed');
    });

    it('downloadDatasetAnnotatedXml devuelve 400 cuando id no es entero positivo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetAnnotatedXmlDownload() {
                    throw new Error('getAccessibleDatasetAnnotatedXmlDownload should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetAnnotatedXml({
            params: { id: 'x' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.equal(recorder.payload?.code, 'invalid_payload');
    });

    it('downloadDatasetAnnotatedXml devuelve 401 sin sesión válida', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async getAccessibleDatasetAnnotatedXmlDownload() {
                    throw new Error('getAccessibleDatasetAnnotatedXmlDownload should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.downloadDatasetAnnotatedXml({ params: { id: '8' } }, response);

        assert.equal(recorder.statusCode, 401);
        assert.equal(recorder.payload?.code, 'unauthenticated');
    });

    it('createDataset devuelve 400 si no se sube fichero', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Creates a dataset with the received configuration.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async createDataset() {
                    throw new Error('createDataset should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.createDataset({
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'No se ha proporcionado un fichero XML.',
            code: 'invalid_payload'
        });
    });

    it('createDataset delega en datasetsService y responde 201', async () => {
        const expectedPayload = {
            ok: true,
            datasetId: 4,
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
                /**
                 * Creates a dataset with the received configuration.
                 * @param {*} userId - Value of userId used by the function.
                 * @param {*} file - Value of file used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async createDataset(userId, file, /** @type {*} */ options) {
                    assert.equal(userId, 7);
                    assert.deepEqual(file, {
                        filename: 'tmp_test.xml',
                        originalname: 'Mi Dataset.xml'
                    });
                    assert.deepEqual(options, {
                        llmMode: 'correction',
                        isReviewEnabled: 'true',
                        hasAdditionalReviews: 'false'
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
            body: {
                llmMode: 'correction',
                isReviewEnabled: 'true',
                hasAdditionalReviews: 'false'
            },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 201);
        assert.deepEqual(recorder.payload, expectedPayload);
    });

    it('deleteDataset delega en datasetsService y responde 200', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async deleteDataset(/** @type {*} */ userId, /** @type {*} */ datasetId) {
                    assert.equal(userId, 7);
                    assert.equal(datasetId, 8);
                    return { ok: true, datasetId };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.deleteDataset({
            params: { id: '8' },
            session: { user: { id: 7, email: 'user7@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, { ok: true, datasetId: 8 });
    });

    it('deleteDataset devuelve 400 cuando id no es entero positivo', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                async deleteDataset() {
                    throw new Error('deleteDataset should not be called');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await datasetsController.deleteDataset({
            params: { id: 'x' },
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
 * Creates a response recorder with the received configuration.
 * @returns {*} Result produced by the function.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = {
        statusCode: null,
        payload: null,
        contentType: null,
        headers: {}
    };

    /** @type {any} */
    const response = {
        locals: {},
        /**
         * Records the HTTP status code.
         * @param {string} code - Value of code used by the function.
         * @returns {*} Result produced by the function.
         */
        status(code) {
            recorder.statusCode = code;
            return this;
        },
        /**
         * Records the response content type.
         * @param {*} value - Value of value used by the function.
         * @returns {*} Result produced by the function.
         */
        type(value) {
            recorder.contentType = value;
            return this;
        },
        /**
         * Records an HTTP header.
         * @param {string} name - Header name.
         * @param {string} value - Header value.
         * @returns {*} Result produced by the function.
         */
        set(name, value) {
            recorder.headers[name] = value;
            return this;
        },
        /**
         * Records the sent payload.
         * @param {*} payload - Value of payload used by the function.
         * @returns {*} Result produced by the function.
         */
        send(payload) {
            recorder.payload = payload;
            return this;
        },
        /**
         * Records the JSON payload.
         * @param {*} payload - Value of payload used by the function.
         * @returns {*} Result produced by the function.
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
