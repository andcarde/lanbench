'use strict';

/**
 * @file Unit tests for the canonical mappers (`contracts/dto-mappers`).
 *
 * Covers DTO normalization (DatasetList, Section, EntryContext,
 * SentenceValidation, SavedAnnotation) against synthetic fixtures.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    mapDatasetListDTO,
    mapDatasetSectionDTO,
    mapSentenceValidationDTOs,
    mapSavedAnnotationDTO,
    normalizeIncomingEntryContext
} = require('../../../contracts/dto-mappers');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('dto-mappers', () => {
    it('mapDatasetListDTO produce el DatasetListDTO canonico', () => {
        assert.deepEqual(
            mapDatasetListDTO({
                id: 5,
                name: 'Mi dataset',
                totalEntries: 17,
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

    it('mapDatasetListDTO conserva el estado de revision del dataset', () => {
        const dto = mapDatasetListDTO({
            id: 8,
            name: 'Reviewable',
            totalEntries: 10,
            review: {
                canReview: true,
                showReviewButton: true,
                reviewAvailable: false,
                reviewableCount: 0
            }
        });

        assert.deepEqual(dto.review, {
            canReview: true,
            showReviewButton: true,
            reviewAvailable: false,
            reviewableCount: 0,
            blockedBySelfAnnotation: false
        });
    });

    it('mapDatasetListDTO propaga blockedBySelfAnnotation (regla de auto-revision)', () => {
        const dto = mapDatasetListDTO({
            id: 8,
            name: 'Self-annotated',
            totalEntries: 10,
            review: {
                canReview: true,
                showReviewButton: true,
                reviewAvailable: false,
                reviewableCount: 0,
                blockedBySelfAnnotation: true
            }
        });

        assert.equal(/** @type {any} */ (dto.review).blockedBySelfAnnotation, true);
    });

    it('mapDatasetListDTO expone las opciones de LLM del dataset', () => {
        const dto = mapDatasetListDTO({
            id: 9,
            name: 'Sin LLM',
            totalEntries: 3,
            options: {
                llmMode: 'none',
                isReviewEnabled: false,
                hasAdditionalReviews: true
            }
        });

        assert.deepEqual(dto.options, {
            llmMode: 'none',
            isReviewEnabled: false,
            hasAdditionalReviews: true
        });
    });

    it('mapDatasetListDTO propaga hasActiveCredential cuando viene definido', () => {
        const dtoWithActive = mapDatasetListDTO({
            id: 11,
            name: 'Con credencial',
            totalEntries: 1,
            hasActiveCredential: true
        });
        const dtoWithoutActive = mapDatasetListDTO({
            id: 12,
            name: 'Sin credencial',
            totalEntries: 1,
            hasActiveCredential: false
        });
        const dtoOmitted = mapDatasetListDTO({
            id: 13,
            name: 'Sin flag',
            totalEntries: 1
        });

        assert.equal(/** @type {any} */ (dtoWithActive).hasActiveCredential, true);
        assert.equal(/** @type {any} */ (dtoWithoutActive).hasActiveCredential, false);
        assert.equal(/** @type {any} */ (dtoOmitted).hasActiveCredential, undefined);
    });

    it('mapDatasetSectionDTO produce el DatasetSectionDTO canonico desde la forma plana', () => {
        assert.deepEqual(
            mapDatasetSectionDTO({
                datasetId: 4,
                datasetName: 'Dataset 4',
                totalSections: 3,
                sectionIndex: 2,
                sectionSize: 10,
                totalEntries: 1,
                startEntry: 11,
                endEntry: 11,
                isLastSection: false,
                entries: [{
                    entryId: 22,
                    category: 'Building',
                    triples: [{
                        subject: 'A',
                        predicate: 'B',
                        object: 'C'
                    }],
                    englishSentences: ['Sentence']
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
                    category: 'Building',
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

    it('mapDatasetSectionDTO corrige Airport a Place si los triples no son de aeropuerto', () => {
        const dto = mapDatasetSectionDTO({
            entries: [{
                entryId: 1,
                category: 'Airport',
                triples: [{
                    subject: 'Punjab,_Pakistan',
                    predicate: 'leaderTitle',
                    object: 'Provincial_Assembly_of_the_Punjab'
                }]
            }]
        });

        assert.equal(dto.entries[0].category, 'Place');
    });

    it('mapDatasetSectionDTO conserva Airport cuando los triples si son de aeropuerto', () => {
        const dto = mapDatasetSectionDTO({
            entries: [{
                entryId: 99,
                category: 'Airport',
                triples: [{
                    subject: 'Allama_Iqbal_International_Airport',
                    predicate: 'location',
                    object: 'Punjab,_Pakistan'
                }]
            }]
        });

        assert.equal(dto.entries[0].category, 'Airport');
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

    it('mapSentenceValidationDTOs conserva proposal opcional', () => {
        assert.deepEqual(
            mapSentenceValidationDTOs(
                ['Madrid esta en Francia.'],
                [{
                    valid: false,
                    reason: 'Objeto incorrecto.',
                    proposal: 'Madrid esta en Espana.'
                }]
            ),
            [{
                sentence: 'Madrid esta en Francia.',
                isValid: false,
                alerts: [{
                    code: 'sentence_review',
                    severity: 'warning',
                    message: 'Objeto incorrecto.'
                }],
                rejectionReasons: [],
                proposal: 'Madrid esta en Espana.'
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
                    subject: 'Allama_Iqbal_International_Airport',
                    predicate: 'location',
                    object: 'Punjab,_Pakistan'
                }]
            }),
            {
                entryId: 9,
                category: 'Airport',
                englishSentences: ['Sentence'],
                triples: [{
                    subject: 'Allama_Iqbal_International_Airport',
                    predicate: 'location',
                    object: 'Punjab,_Pakistan'
                }]
            }
        );
    });

    it('normalizeIncomingEntryContext corrige la categoria Airport inconsistente del caso Punjab', () => {
        assert.deepEqual(
            normalizeIncomingEntryContext({
                entryId: 1,
                category: 'Airport',
                englishSentences: [
                    'The Punjab, Pakistan, is led by the Provincial Assembly of the Punjab.'
                ],
                triples: [{
                    subject: 'Punjab,_Pakistan',
                    predicate: 'leaderTitle',
                    object: 'Provincial_Assembly_of_the_Punjab'
                }]
            }),
            {
                entryId: 1,
                category: 'Place',
                englishSentences: [
                    'The Punjab, Pakistan, is led by the Provincial Assembly of the Punjab.'
                ],
                triples: [{
                    subject: 'Punjab,_Pakistan',
                    predicate: 'leaderTitle',
                    object: 'Provincial_Assembly_of_the_Punjab'
                }]
            }
        );
    });
});
