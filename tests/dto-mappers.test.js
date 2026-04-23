'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    mapDatasetListDTO,
    mapDatasetSectionDTO,
    mapSentenceValidationDTOs,
    mapSavedAnnotationDTO,
    normalizeIncomingEntryContext
} = require('../contracts/dto-mappers');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('dto-mappers', () => {
    it('mapDatasetListDTO normaliza tanto forma legacy como canónica', () => {
        assert.deepEqual(
            mapDatasetListDTO({
                idDataset: 5,
                name: 'Mi dataset',
                triplesRDF: 17,
                completedPercent: 20,
                remainPercent: 80,
                withoutReviewPercent: 0,
                languages: ['Spanish', 'English'],
                colorClass: 'dataset-purple'
            }),
            {
                id: 5,
                name: 'Mi dataset',
                totalEntries: 17,
                completedPercent: 20,
                remainPercent: 80,
                withoutReviewPercent: 0,
                languages: ['Spanish', 'English'],
                colorClass: 'dataset-purple'
            }
        );
    });

    it('mapDatasetSectionDTO aplana la estructura legacy a DatasetSection canónico', () => {
        assert.deepEqual(
            mapDatasetSectionDTO({
                dataset: {
                    idDataset: 4,
                    name: 'Dataset 4',
                    totalSections: 3
                },
                section: {
                    number: 2,
                    size: 10,
                    totalEntries: 1,
                    startEntry: 11,
                    endEntry: 11,
                    isLastSection: false
                },
                entries: [{
                    eid: 22,
                    category: 'Airport',
                    originalTriples: [{
                        subject: 'A',
                        predicate: 'B',
                        object: 'C'
                    }],
                    sourceSentences: ['Sentence']
                }]
            }),
            {
                datasetId: 4,
                datasetName: 'Dataset 4',
                totalSections: 3,
                sectionIndex: 2,
                sectionSize: 10,
                startEntry: 11,
                endEntry: 11,
                isLastSection: false,
                totalEntries: 1,
                entries: [{
                    entryId: 22,
                    category: 'Airport',
                    triples: [{
                        subject: 'A',
                        predicate: 'B',
                        object: 'C'
                    }],
                    englishSentences: ['Sentence'],
                    sectionIndex: 2
                }]
            }
        );
    });

    it('mapSentenceValidationDTOs produce alerts canónicas desde resultados legacy', () => {
        assert.deepEqual(
            mapSentenceValidationDTOs(
                ['Hola'],
                [{ valid: false, reason: 'Error', suggestion: 'Hola.' }]
            ),
            [{
                sentence: 'Hola',
                isValid: false,
                alerts: [{
                    code: 'sentence_review',
                    severity: 'warning',
                    message: 'Error',
                    suggestion: 'Hola.'
                }],
                rejectionReasons: []
            }]
        );
    });

    it('mapSavedAnnotationDTO devuelve la estructura canónica de guardado', () => {
        const dto = mapSavedAnnotationDTO({
            entryId: 7,
            datasetId: 2,
            sentences: ['Uno.', 'Dos.'],
            savedAt: '2026-04-23T10:00:00.000Z'
        });

        assert.deepEqual(dto, {
            entryId: 7,
            datasetId: 2,
            sentences: ['Uno.', 'Dos.'],
            savedAt: '2026-04-23T10:00:00.000Z'
        });
    });

    it('normalizeIncomingEntryContext acepta EntryContext canónico', () => {
        assert.deepEqual(
            normalizeIncomingEntryContext({
                entryId: 9,
                category: 'Airport',
                englishSentences: ['Sentence'],
                sectionIndex: 1,
                triples: [{
                    subject: 'A',
                    predicate: 'B',
                    object: 'C'
                }]
            }),
            {
                eid: 9,
                category: 'Airport',
                sourceSentences: ['Sentence'],
                triples: [{
                    subject: 'A',
                    predicate: 'B',
                    object: 'C'
                }]
            }
        );
    });
});
