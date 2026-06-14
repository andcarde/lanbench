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
             * Runs the logic of read dataset.
             * @returns {*} Result produced by the function.
             */
            readDataset() {
                return {
                    entries: [{ eid: 1 }, { eid: 2 }]
                };
            },
            /**
             * Runs the logic of read file as buffer.
             * @returns {*} Result produced by the function.
             */
            readFileAsBuffer() {
                return Buffer.from('<benchmark />');
            },
            /**
             * Converts parse dataset import to the expected format.
             * @returns {*} Result produced by the function.
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
                 * Creates owned dataset with the received configuration.
                 * @param {*} payload - Value of payload used by the function.
                 * @returns {Promise<*>} Result produced by the function.
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
                reviewableCount: 0,
                blockedBySelfAnnotation: false
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
            { llmMode: 'generation', isReviewEnabled: 'true', hasAdditionalReviews: '1' }
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
                 * Gets accessible dataset graph by id from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
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
             * Converts parse annotation entries to the expected format.
             * @returns {*} Result produced by the function.
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
                 * Gets accessible dataset graph by id from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
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
             * Builds dataset xml from the received data.
             * @param {Array<*>} entries - Value of entries used by the function.
             * @returns {*} Result produced by the function.
             */
            buildDatasetXml(entries) {
                assert.equal(entries.length, 1);
                assert.equal(entries[0].originalTriplesets.length, 1);
                return '<benchmark>rebuilt</benchmark>';
            },
            /**
             * Converts parse dataset xml to the expected format.
             * @returns {*} Result produced by the function.
             */
            parseDatasetXml() {
                throw new Error('No debería validar el snapshot XML.');
            }
        }));

        const xml = await service.getAccessibleDatasetText(7, 11);
        assert.equal(xml, '<benchmark>rebuilt</benchmark>');
    });

    it('getAccessibleDatasetXmlDownload devuelve filename, body y contentType', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphById() {
                    return {
                        id: 11,
                        name: 'ru_dev',
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
                            lexes: [],
                            dbpediaLinks: [],
                            links: []
                        }]
                    };
                }
            },
            buildDatasetXml() {
                return '<benchmark>download</benchmark>';
            }
        }));

        const payload = await service.getAccessibleDatasetXmlDownload(7, 11);

        assert.deepEqual(payload, {
            filename: 'ru_dev.xml',
            body: '<benchmark>download</benchmark>',
            contentType: 'application/xml; charset=utf-8'
        });
    });

    it('getAccessibleDatasetXmlDownload rechaza con 404 cuando el dataset no tiene entries', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphById() {
                    return {
                        id: 11,
                        name: 'empty',
                        entries: []
                    };
                }
            },
            buildDatasetXml() {
                throw new Error('buildDatasetXml should not be called for empty dataset');
            }
        }));

        await assert.rejects(
            service.getAccessibleDatasetXmlDownload(7, 11),
            (/** @type {any} */ err) => err?.status === 404 && err?.code === 'dataset_without_entries'
        );
    });

    it('getAccessibleDatasetAnnotatedXmlDownload devuelve filename, body y contentType al 100% completado', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphWithAnnotationsById() {
                    return {
                        id: 11,
                        name: 'ru_dev',
                        totalEntries: 10,
                        sectionsCompleted: 1,
                        sectionsPending: 0,
                        entries: [{
                            eid: 1,
                            category: 'Place',
                            shape: null,
                            shapeType: null,
                            size: 1,
                            triplesets: [],
                            lexes: [],
                            dbpediaLinks: [],
                            links: [],
                            annotations: [
                                { sentenceIndex: 0, sentence: 'Madrid está en España.' }
                            ]
                        }]
                    };
                }
            },
            buildAnnotatedDatasetXml(/** @type {any} */ entries) {
                assert.equal(entries.length, 1);
                assert.equal(entries[0].annotations.length, 1);
                assert.equal(entries[0].annotations[0].sentence, 'Madrid está en España.');
                return '<benchmark>extended</benchmark>';
            }
        }));

        const payload = await service.getAccessibleDatasetAnnotatedXmlDownload(7, 11);

        assert.deepEqual(payload, {
            filename: 'ru_dev-extended.xml',
            body: '<benchmark>extended</benchmark>',
            contentType: 'application/xml; charset=utf-8'
        });
    });

    it('getAccessibleDatasetAnnotatedXmlDownload rechaza con 409 dataset_not_completed cuando faltan secciones', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphWithAnnotationsById() {
                    return {
                        id: 11,
                        name: 'ru_dev',
                        totalEntries: 20,
                        sectionsCompleted: 1,
                        sectionsPending: 1,
                        entries: [{
                            eid: 1,
                            category: 'Place',
                            triplesets: [],
                            lexes: [],
                            dbpediaLinks: [],
                            links: [],
                            annotations: []
                        }]
                    };
                }
            },
            buildAnnotatedDatasetXml() {
                throw new Error('No debería construirse el XML si el dataset no está completado.');
            }
        }));

        await assert.rejects(
            service.getAccessibleDatasetAnnotatedXmlDownload(7, 11),
            (/** @type {any} */ err) => err?.status === 409 && err?.code === 'dataset_not_completed'
        );
    });

    it('getAccessibleDatasetAnnotatedXmlDownload rechaza con 409 si sectionsPending > 0 aunque sectionsCompleted iguale el total', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphWithAnnotationsById() {
                    return {
                        id: 11,
                        name: 'ru_dev',
                        totalEntries: 10,
                        sectionsCompleted: 1,
                        sectionsPending: 2,
                        entries: [{
                            eid: 1,
                            triplesets: [],
                            lexes: [],
                            dbpediaLinks: [],
                            links: [],
                            annotations: []
                        }]
                    };
                }
            },
            buildAnnotatedDatasetXml() {
                throw new Error('No debería construirse el XML si sectionsPending > 0.');
            }
        }));

        await assert.rejects(
            service.getAccessibleDatasetAnnotatedXmlDownload(7, 11),
            (/** @type {any} */ err) => err?.status === 409 && err?.code === 'dataset_not_completed'
        );
    });

    it('getAccessibleDatasetAnnotatedXmlDownload rechaza con 404 dataset_without_entries cuando no hay entries', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphWithAnnotationsById() {
                    return {
                        id: 11,
                        name: 'empty',
                        totalEntries: 0,
                        sectionsCompleted: 0,
                        sectionsPending: 0,
                        entries: []
                    };
                }
            },
            buildAnnotatedDatasetXml() {
                throw new Error('No debería construirse el XML para un dataset vacío.');
            }
        }));

        await assert.rejects(
            service.getAccessibleDatasetAnnotatedXmlDownload(7, 11),
            (/** @type {any} */ err) => err?.status === 404 && err?.code === 'dataset_without_entries'
        );
    });

    it('createDataset persiste la descripcion cuando es valida y la propaga al DTO', async () => {
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
                        id: 21,
                        name: payload.datasetData.name,
                        description: payload.datasetData.description,
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

        const payload = await service.createDataset(
            7,
            { filename: 'tmp.xml', originalname: 'Con descripcion.xml' },
            { description: '  Un dataset de prueba con descripcion  ' }
        );

        assert.equal(capturedDatasetData.description, 'Un dataset de prueba con descripcion');
        assert.equal(payload.dataset.description, 'Un dataset de prueba con descripcion');
    });

    it('createDataset persiste description = null cuando se omite o esta vacia', async () => {
        /** @type {any[]} */
        const captured = [];
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
                    captured.push(payload.datasetData);
                    return {
                        id: 22,
                        name: payload.datasetData.name,
                        description: payload.datasetData.description,
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

        const omitted = await service.createDataset(
            7,
            { filename: 'a.xml', originalname: 'Sin descripcion.xml' }
        );
        const blank = await service.createDataset(
            7,
            { filename: 'b.xml', originalname: 'Solo espacios.xml' },
            { description: '   \n\t  ' }
        );

        assert.equal(captured[0].description, null);
        assert.equal(captured[1].description, null);
        assert.equal(omitted.dataset.description, undefined);
        assert.equal(blank.dataset.description, undefined);
    });

    it('createDataset rechaza con 400 dataset_description_too_long cuando supera 512 caracteres', async () => {
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
                async createOwnedDataset() {
                    throw new Error('No deberia llegar al repositorio.');
                }
            }
        }));

        const tooLong = 'A'.repeat(513);

        await assert.rejects(
            () => service.createDataset(
                7,
                { filename: 'tmp.xml', originalname: 'Excedida.xml' },
                { description: tooLong }
            ),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 400);
                assert.equal(error.code, 'dataset_description_too_long');
                return true;
            }
        );
    });

    it('deleteDataset exige administracion y delega el borrado recursivo', async () => {
        /** @type {any[]} */
        const deleted = [];
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async deleteDatasetRecursively(/** @type {*} */ payload) {
                    deleted.push(payload);
                    return { datasetId: payload.datasetId };
                }
            },
            datasetsPermissionsRepository: {
                async findPermitForUser(/** @type {*} */ payload) {
                    assert.deepEqual(payload, { datasetId: 12, userId: 7 });
                    return {
                        isAdmin: true,
                        isOwned: false,
                        dataset: { id: 12, name: 'Dataset 12' }
                    };
                }
            },
            usersRepository: {}
        }));

        const result = await service.deleteDataset(7, 12);

        assert.deepEqual(deleted, [{ datasetId: 12 }]);
        assert.deepEqual(result, { ok: true, datasetId: 12 });
    });
});
