'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsService } = require('../../../services/datasets-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('datasets-service', () => {
    it('createDataset importa el XML a entryRecords y los persiste junto al dataset', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const service = createDatasetsService(/** @type {any} */ ({
            /**
             * Ejecuta la logica de read dataset.
             * @returns {*} Resultado producido por la funcion.
             */
            readDataset() {
                return {
                    entries: [{ eid: 1 }, { eid: 2 }]
                };
            },
            /**
             * Ejecuta la logica de read file as buffer.
             * @returns {*} Resultado producido por la funcion.
             */
            readFileAsBuffer() {
                return Buffer.from('<benchmark />');
            },
            /**
             * Convierte parse dataset import al formato esperado.
             * @returns {*} Resultado producido por la funcion.
             */
            parseDatasetImport() {
                return {
                    entries: [{
                        position: 0,
                        eid: 1,
                        category: 'Airport',
                        shape: null,
                        shapeType: null,
                        size: 1,
                        originalTriplesets: [],
                        modifiedTriplesets: [],
                        lexes: [],
                        dbpediaLinks: [],
                        links: []
                    }]
                };
            },
            datasetsRepository: {
                /**
                 * Crea owned dataset con la configuracion recibida.
                 * @param {*} payload - Valor de payload usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async createOwnedDataset(payload) {
                    capturedCalls.push(payload);
                    return {
                        id: 4,
                        name: payload.datasetData.name,
                        totalEntries: payload.datasetData.totalEntries,
                        languages: payload.datasetData.languages,
                        sectionsCompleted: 0,
                        sectionsInReview: 0,
                        sectionsPending: 1,
                        llmMode: 'none',
                        isReviewEnabled: false,
                        hasAdditionalReviews: false,
                        colorClass: 'dataset-purple'
                    };
                }
            }
        }));

        const payload = await service.createDataset(7, {
            filename: 'tmp.xml',
            originalname: 'Mi Dataset.xml'
        });

        assert.equal(payload.ok, true);
        assert.equal(payload.datasetId, 4);
        assert.deepEqual(payload.dataset, {
            id: 4,
            name: 'Mi Dataset',
            totalEntries: 2,
            completedPercent: 0,
            remainPercent: 100,
            withoutReviewPercent: 0,
            languages: ['Spanish', 'English'],
            review: {
                canReview: false,
                showReviewButton: false,
                reviewAvailable: false,
                reviewableCount: 0
            },
            options: {
                llmMode: 'none',
                isReviewEnabled: false,
                hasAdditionalReviews: false
            },
            colorClass: 'dataset-purple'
        });
        assert.equal(capturedCalls.length, 1);
        assert.equal(capturedCalls[0].userId, 7);
        assert.equal(capturedCalls[0].entryRecords.length, 1);
        assert.equal(capturedCalls[0].entryRecords[0].eid, 1);
        assert.equal(capturedCalls[0].datasetData.llmMode, 'none');
        assert.equal(capturedCalls[0].datasetData.isReviewEnabled, false);
        assert.equal(capturedCalls[0].datasetData.hasAdditionalReviews, false);
    });

    it('createDataset persiste las opciones de creacion normalizadas', async () => {
        /** @type {any} */
        /** @type {any} */
        let capturedDatasetData = null;
        const service = createDatasetsService(/** @type {any} */ ({
            readDataset() {
                return { entries: [{ eid: 1 }] };
            },
            readFileAsBuffer() {
                return Buffer.from('<benchmark />');
            },
            parseDatasetImport() {
                return { entries: [] };
            },
            datasetsRepository: {
                async createOwnedDataset(/** @type {*} */ payload) {
                    capturedDatasetData = payload.datasetData;
                    return {
                        id: 9,
                        name: payload.datasetData.name,
                        totalEntries: payload.datasetData.totalEntries,
                        languages: payload.datasetData.languages,
                        sectionsCompleted: 0,
                        sectionsInReview: 0,
                        sectionsPending: 1,
                        llmMode: payload.datasetData.llmMode,
                        isReviewEnabled: payload.datasetData.isReviewEnabled,
                        hasAdditionalReviews: payload.datasetData.hasAdditionalReviews,
                        colorClass: 'dataset-purple'
                    };
                }
            }
        }));

        const payload = await service.createDataset(
            7,
            { filename: 'tmp.xml', originalname: 'Opciones.xml' },
            { llmMode: 'generation', isReviewEnabled: 'true', hasAdditionalReviews: 'on' }
        );

        assert.equal(capturedDatasetData.llmMode, 'generation');
        assert.equal(capturedDatasetData.isReviewEnabled, true);
        assert.equal(capturedDatasetData.hasAdditionalReviews, true);
        assert.deepEqual(payload.dataset.options, {
            llmMode: 'generation',
            isReviewEnabled: true,
            hasAdditionalReviews: true
        });
    });

    it('getAccessibleDatasetSection lee las entries desde el modelo relacional y devuelve DatasetSection canónico', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                /**
                 * Obtiene accessible dataset graph by id desde la fuente correspondiente.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async findAccessibleDatasetGraphById() {
                    return {
                        id: 11,
                        name: 'DATASET 11',
                        entries: [{
                            eid: 3,
                            category: 'City',
                            shape: null,
                            shapeType: null,
                            size: 1,
                            triplesets: [{
                                type: 'original',
                                triples: [{
                                    subject: 'Madrid',
                                    predicate: 'isPartOf',
                                    object: 'Spain'
                                }]
                            }],
                            lexes: [{
                                lang: 'en',
                                text: 'Madrid is part of Spain.'
                            }],
                            dbpediaLinks: [],
                            links: []
                        }]
                    };
                }
            },
            /**
             * Convierte parse annotation entries al formato esperado.
             * @returns {*} Resultado producido por la funcion.
             */
            parseAnnotationEntries() {
                throw new Error('No debería leer del snapshot XML.');
            }
        }));

        const payload = await service.getAccessibleDatasetSection(7, 11, 1);

        assert.deepEqual(payload, {
            datasetId: 11,
            datasetName: 'DATASET 11',
            totalSections: 1,
            sectionIndex: 1,
            sectionSize: 10,
            startEntry: 1,
            endEntry: 1,
            isLastSection: true,
            totalEntries: 1,
            entries: [{
                entryId: 3,
                category: 'City',
                triples: [{
                    subject: 'Madrid',
                    predicate: 'isPartOf',
                    object: 'Spain'
                }],
                englishSentences: ['Madrid is part of Spain.'],
                sectionIndex: 1
            }]
        });
    });

    it('getAccessibleDatasetText reconstruye el XML desde el modelo relacional', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                /**
                 * Obtiene accessible dataset graph by id desde la fuente correspondiente.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async findAccessibleDatasetGraphById() {
                    return {
                        id: 11,
                        name: 'DATASET 11',
                        entries: [{
                            eid: 3,
                            category: 'Airport',
                            shape: null,
                            shapeType: null,
                            size: 1,
                            triplesets: [{
                                type: 'original',
                                triples: [{
                                    subject: 'Madrid',
                                    predicate: 'isPartOf',
                                    object: 'Spain'
                                }]
                            }],
                            lexes: [{
                                lid: 'Id1',
                                lang: 'en',
                                comment: '',
                                text: 'Madrid is part of Spain.'
                            }],
                            dbpediaLinks: [],
                            links: []
                        }]
                    };
                }
            },
            /**
             * Construye dataset xml a partir de los datos recibidos.
             * @param {Array<*>} entries - Valor de entries usado por la funcion.
             * @returns {*} Resultado producido por la funcion.
             */
            buildDatasetXml(entries) {
                assert.equal(entries.length, 1);
                assert.equal(entries[0].originalTriplesets.length, 1);
                return '<benchmark>rebuilt</benchmark>';
            },
            /**
             * Convierte parse dataset xml al formato esperado.
             * @returns {*} Resultado producido por la funcion.
             */
            parseDatasetXml() {
                throw new Error('No debería validar el snapshot XML.');
            }
        }));

        const xml = await service.getAccessibleDatasetText(7, 11);
        assert.equal(xml, '<benchmark>rebuilt</benchmark>');
    });

    it('deleteDataset exige administracion y delega el borrado recursivo', async () => {
        /** @type {any[]} */
        const deleted = [];
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findPermitForUser(/** @type {*} */ payload) {
                    assert.deepEqual(payload, { datasetId: 12, userId: 7 });
                    return {
                        isAdmin: true,
                        isOwned: false,
                        dataset: { id: 12, name: 'Dataset 12' }
                    };
                },
                async deleteDatasetRecursively(/** @type {*} */ payload) {
                    deleted.push(payload);
                    return { datasetId: payload.datasetId };
                }
            },
            usersRepository: {}
        }));

        const result = await service.deleteDataset(7, 12);

        assert.deepEqual(deleted, [{ datasetId: 12 }]);
        assert.deepEqual(result, { ok: true, datasetId: 12 });
    });
});
