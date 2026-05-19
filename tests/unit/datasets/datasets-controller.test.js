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
                 * Ejecuta de forma asincrona la logica de list accessible dataset items.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Ejecuta de forma asincrona la logica de list accessible dataset items.
                 * @param {*} userId - Valor de userId usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Obtiene accessible dataset item desde la fuente correspondiente.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Obtiene accessible dataset item desde la fuente correspondiente.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Obtiene accessible dataset section desde la fuente correspondiente.
                 * @param {*} userId - Valor de userId usado por la funcion.
                 * @param {*} datasetId - Valor de datasetId usado por la funcion.
                 * @param {number} sectionNumber - Valor de sectionNumber usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Obtiene accessible dataset text desde la fuente correspondiente.
                 * @param {*} userId - Valor de userId usado por la funcion.
                 * @param {*} datasetId - Valor de datasetId usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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

    it('createDataset devuelve 400 si no se sube fichero', async () => {
        const datasetsController = createDatasetsController({
            datasetsService: {
                /**
                 * Crea dataset con la configuracion recibida.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
                 * Crea dataset con la configuracion recibida.
                 * @param {*} userId - Valor de userId usado por la funcion.
                 * @param {*} file - Valor de file usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
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
 * Crea response recorder con la configuracion recibida.
 * @returns {*} Resultado producido por la funcion.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = {
        statusCode: null,
        payload: null,
        contentType: null
    };

    /** @type {any} */
    const response = {
        locals: {},
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
         * Ejecuta la logica de type.
         * @param {*} value - Valor de value usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        type(value) {
            recorder.contentType = value;
            return this;
        },
        /**
         * Ejecuta la logica de send.
         * @param {*} payload - Valor de payload usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        send(payload) {
            recorder.payload = payload;
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
