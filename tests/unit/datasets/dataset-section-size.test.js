'use strict';

/**
 * Unit coverage for the declarative per-dataset section size (P4):
 *   - `resolveSectionSize` legacy fallback;
 *   - `createDataset` persisting the value and partitioning by it;
 *   - `getAccessibleDatasetSection` honouring a non-default size;
 *   - progress math and the continue-dataset flow using the dataset's size;
 *   - the frontend `normaliseDatasetOptions` parsing rules.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { resolveSectionSize, SECTION_SIZE } = require('../../../constants/datasets');
const { createDatasetsService } = require('../../../services/datasets-service');
const { createContinueDatasetService } = require('../../../services/continue-dataset-service');
const { calculatePercentagesFromSectionCounters } = require('../../../utils/dataset-progress');
const { normaliseDatasetOptions, normaliseSectionSize } = require('../../../public/js/datasets');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds N minimal persisted-entry rows for the section-partition tests.
 * @param {number} count
 * @returns {Array<*>}
 */
function buildEntries(count) {
    return Array.from({ length: count }, (_value, index) => ({
        eid: index + 1,
        category: 'City',
        shape: null,
        shapeType: null,
        size: 1,
        triplesets: [{ type: 'original', triples: [{ subject: 'S', predicate: 'p', object: 'O' }] }],
        lexes: [],
        dbpediaLinks: [],
        links: []
    }));
}

/**
 * Builds a datasets-service whose creation captures the persisted `datasetData`.
 * @param {{ entryCount:number, capture:(data:any)=>void }} options
 * @returns {*}
 */
function buildCreateService({ entryCount, capture }) {
    return createDatasetsService(/** @type {any} */ ({
        readDataset() { return { entries: buildEntries(entryCount) }; },
        readFileAsBuffer() { return Buffer.from('<benchmark />'); },
        parseDatasetImport() { return { entries: [] }; },
        datasetsRepository: {
            async createOwnedDataset(/** @type {*} */ payload) {
                capture(payload.datasetData);
                return {
                    id: 9,
                    name: payload.datasetData.name,
                    totalEntries: payload.datasetData.totalEntries,
                    languages: payload.datasetData.languages,
                    sectionSize: payload.datasetData.sectionSize,
                    sectionsCompleted: 0,
                    sectionsInReview: 0,
                    sectionsPending: payload.datasetData.sectionsPending,
                    llmMode: payload.datasetData.llmMode,
                    isReviewEnabled: payload.datasetData.isReviewEnabled,
                    hasAdditionalReviews: payload.datasetData.hasAdditionalReviews,
                    colorClass: 'dataset-purple'
                };
            }
        }
    }));
}

describe('resolveSectionSize (P4 helper, DECOUPLE-0)', () => {
    it('returns the explicit positive value', () => {
        assert.equal(resolveSectionSize({ sectionSize: 7 }), 7);
        assert.equal(resolveSectionSize({ sectionSize: '25' }), 25);
    });

    it('falls back to the default for legacy/garbage rows', () => {
        assert.equal(resolveSectionSize({}), SECTION_SIZE);
        assert.equal(resolveSectionSize(null), SECTION_SIZE);
        assert.equal(resolveSectionSize({ sectionSize: 0 }), SECTION_SIZE);
        assert.equal(resolveSectionSize({ sectionSize: -4 }), SECTION_SIZE);
        assert.equal(resolveSectionSize({ sectionSize: 'abc' }), SECTION_SIZE);
        assert.equal(SECTION_SIZE, 10);
    });
});

describe('createDataset persists & partitions by the declarative section size (T4.1)', () => {
    it('persists sectionSize=25 from the body and partitions 30 entries into 2 sections', async () => {
        /** @type {any} */
        let captured = null;
        const service = buildCreateService({ entryCount: 30, capture: (data) => { captured = data; } });

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, { sectionSize: '25' });

        assert.equal(captured.sectionSize, 25);
        assert.equal(captured.totalEntries, 30);
        assert.equal(captured.sectionsPending, 2, 'ceil(30 / 25) = 2 sections');
    });

    it('defaults a missing or invalid sectionSize to 10', async () => {
        /** @type {any} */
        let captured = null;
        const service = buildCreateService({ entryCount: 25, capture: (data) => { captured = data; } });

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, { sectionSize: 'nope' });
        assert.equal(captured.sectionSize, 10);
        assert.equal(captured.sectionsPending, 3, 'ceil(25 / 10) = 3 sections');

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, {});
        assert.equal(captured.sectionSize, 10);
    });
});

describe('getAccessibleDatasetSection honours a non-default section size (T4.2)', () => {
    /**
     * @param {number} sectionSize
     * @param {number} entryCount
     * @returns {*}
     */
    function buildSectionService(sectionSize, entryCount) {
        return createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findAccessibleDatasetGraphById() {
                    return { id: 11, name: 'DATASET 11', sectionSize, entries: buildEntries(entryCount) };
                }
            }
        }));
    }

    it('partitions 10 entries into sections of 4', async () => {
        const service = buildSectionService(4, 10);

        const first = await service.getAccessibleDatasetSection(7, 11, 1);
        assert.equal(first.totalSections, 3, 'ceil(10 / 4) = 3');
        assert.equal(first.sectionSize, 4);
        assert.equal(first.totalEntries, 4);
        assert.equal(first.startEntry, 1);
        assert.equal(first.endEntry, 4);

        const last = await service.getAccessibleDatasetSection(7, 11, 3);
        assert.equal(last.totalEntries, 2, 'last section has the 2 remaining entries');
        assert.equal(last.startEntry, 9);
        assert.equal(last.endEntry, 10);
        assert.equal(last.isLastSection, true);
    });
});

describe('dataset progress uses the section size (T4.3)', () => {
    it('counts reviewed entries by completedSections * sectionSize', () => {
        // 1 completed (reviewed) section of size 4 over 8 annotated of 12 total,
        // review enabled: 4 reviewed → 33% completed, 4 in-review → 33% without review.
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 1,
            sectionsInReview: 1,
            sectionsPending: 1,
            reviewEnabled: true,
            annotatedEntries: 8,
            totalEntries: 12,
            sectionSize: 4
        });
        assert.equal(progress.completed, 33, '4 reviewed / 12 ≈ 33%');
        assert.equal(progress.withoutReview, 33, '(8-4) in review / 12 ≈ 33%');
    });

    it('defaults to a size of 10 when none is given', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 1,
            sectionsInReview: 0,
            sectionsPending: 0,
            reviewEnabled: true,
            annotatedEntries: 10,
            totalEntries: 10
        });
        assert.equal(progress.completed, 100, '1 completed section × 10 = all 10 entries');
    });
});

describe('continue-dataset-service uses the dataset section size (T4.3)', () => {
    it('resumes an active session computing entryIndexInSection with a non-10 size', async () => {
        const service = createContinueDatasetService(/** @type {any} */ ({
            activeSessionsRepository: {
                async findSession() { return { sectionNumber: 2, entryNumber: 5, mode: 'annotation' }; }
            },
            sectionAssignmentsRepository: {
                async expireStaleAssignments() {}
            },
            datasetsRepository: {
                async findAccessibleById() { return { id: 3, totalEntries: 20, sectionsPending: 2, sectionsInReview: 0, sectionSize: 4 }; },
                async findEntryByPosition() { return { id: 50, eid: 6, position: 5 }; }
            }
        }));

        const result = await service.continueDataset(8, 3);
        assert.equal(result.caseNumber, 4, 'active session → case 4');
        assert.equal(result.sectionNumber, 2);
        assert.equal(result.entryPosition, 5);
        assert.equal(result.entryIndexInSection, 1, '5 % 4 = 1');
    });
});

describe('frontend normaliseDatasetOptions / normaliseSectionSize (T4.4)', () => {
    it('parses the section size, defaulting/clamping to 10', () => {
        assert.equal(normaliseSectionSize('25'), 25);
        assert.equal(normaliseSectionSize(4), 4);
        assert.equal(normaliseSectionSize('0'), 10);
        assert.equal(normaliseSectionSize('-3'), 10);
        assert.equal(normaliseSectionSize('abc'), 10);
        assert.equal(normaliseSectionSize(undefined), 10);
    });

    it('normaliseDatasetOptions returns the parsed size', () => {
        assert.equal(normaliseDatasetOptions({ sectionSize: '7' }).sectionSize, 7);
        assert.equal(normaliseDatasetOptions({}).sectionSize, 10);
        assert.equal(normaliseDatasetOptions({ sectionSize: 0 }).sectionSize, 10);
    });
});
