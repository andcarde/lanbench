'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsService } = require('../services/datasets-service');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('datasets-service', () => {
    it('createDataset importa el XML a entryRecords y los persiste junto al dataset', async () => {
        const capturedCalls = [];
        const service = createDatasetsService({
            readDataset() {
                return {
                    entries: [{ eid: 1 }, { eid: 2 }]
                };
            },
            readFileAsBuffer() {
                return Buffer.from('<benchmark />');
            },
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
                async createOwnedDataset(payload) {
                    capturedCalls.push(payload);
                    return {
                        idDataset: 4,
                        name: payload.datasetData.name,
                        entries: payload.datasetData.entries,
                        languages: payload.datasetData.languages,
                        completedPercent: 0,
                        withoutReviewPercent: 0,
                        remainPercent: 100,
                        colorClass: 'dataset-purple'
                    };
                }
            }
        });

        const payload = await service.createDataset(7, {
            filename: 'tmp.xml',
            originalname: 'Mi Dataset.xml'
        });

        assert.equal(payload.ok, true);
        assert.equal(payload.idDataset, 4);
        assert.deepEqual(payload.dataset, {
            id: 4,
            name: 'Mi Dataset',
            totalEntries: 2,
            completedPercent: 0,
            remainPercent: 100,
            withoutReviewPercent: 0,
            languages: ['Spanish', 'English'],
            colorClass: 'dataset-purple'
        });
        assert.equal(capturedCalls.length, 1);
        assert.equal(capturedCalls[0].idUser, 7);
        assert.equal(capturedCalls[0].entryRecords.length, 1);
        assert.equal(capturedCalls[0].entryRecords[0].eid, 1);
    });

    it('getAccessibleDatasetSection lee las entries desde el modelo relacional y devuelve DatasetSection canónico', async () => {
        const service = createDatasetsService({
            datasetsRepository: {
                async findAccessibleDatasetGraphById() {
                    return {
                        idDataset: 11,
                        name: 'DATASET 11',
                        entryRecords: [{
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
                                lang: 'en',
                                text: 'Madrid is part of Spain.'
                            }],
                            dbpediaLinks: [],
                            links: []
                        }]
                    };
                }
            },
            parseAnnotationEntries() {
                throw new Error('No debería leer del snapshot XML.');
            }
        });

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
                category: 'Airport',
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
        const service = createDatasetsService({
            datasetsRepository: {
                async findAccessibleDatasetGraphById() {
                    return {
                        idDataset: 11,
                        name: 'DATASET 11',
                        entryRecords: [{
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
            buildDatasetXml(entries) {
                assert.equal(entries.length, 1);
                assert.equal(entries[0].originalTriplesets.length, 1);
                return '<benchmark>rebuilt</benchmark>';
            },
            parseDatasetXml() {
                throw new Error('No debería validar el snapshot XML.');
            }
        });

        const xml = await service.getAccessibleDatasetText(7, 11);
        assert.equal(xml, '<benchmark>rebuilt</benchmark>');
    });
});
