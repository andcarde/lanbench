'use strict';

/**
 * Unit coverage for the single-dataset review-availability fix (P5): the
 * `GET /api/datasets/:id` DTO must compute `review.reviewAvailable` consistently
 * with the list endpoint, so a freshly reviewable section surfaces the Revisión
 * affordance even when the card is read on its own.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsService } = require('../../../services/datasets-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * @param {{ reviewableRows:any[], selfAnnotatedRows?:any[] }} options
 * @returns {*}
 */
function buildService({ reviewableRows, selfAnnotatedRows = [] }) {
    return createDatasetsService(/** @type {any} */ ({
        datasetsRepository: {
            async findAccessibleById() {
                return {
                    id: 5,
                    name: 'D5',
                    totalEntries: 10,
                    languages: '["Spanish"]',
                    isReviewEnabled: true,
                    sectionsCompleted: 0,
                    sectionsInReview: 1,
                    sectionsPending: 1,
                    sectionSize: 5,
                    colorClass: 'dataset-purple',
                    permits: [{ isReviewer: true, isAnnotator: true, isAdmin: false, isOwned: false }]
                };
            },
            async countAnnotatedEntriesByDataset() { return []; },
            async findReviewableEntryDatasetIds() { return reviewableRows; },
            async findSelfAnnotatedReviewableDatasetIds() { return selfAnnotatedRows; },
            async findActiveReviewDatasetIdsForReviewer() { return []; }
        },
        datasetLlmCredentialsRepository: {}
    }));
}

describe('getAccessibleDatasetItem review availability (P5)', () => {
    it('surfaces reviewAvailable=true when the reviewer has reviewable entries', async () => {
        const service = buildService({ reviewableRows: [{ datasetId: 5 }, { datasetId: 5 }] });
        const dto = await service.getAccessibleDatasetItem(7, 5);

        assert.equal(dto.review.canReview, true);
        assert.equal(dto.review.reviewableCount, 2);
        assert.equal(dto.review.reviewAvailable, true);
        assert.equal(dto.review.showReviewButton, true);
        assert.equal(dto.review.blockedBySelfAnnotation, false);
    });

    it('keeps reviewAvailable=false when no entries are pending review', async () => {
        const service = buildService({ reviewableRows: [] });
        const dto = await service.getAccessibleDatasetItem(7, 5);

        assert.equal(dto.review.reviewableCount, 0);
        assert.equal(dto.review.reviewAvailable, false);
        assert.equal(dto.review.blockedBySelfAnnotation, false);
    });

    it('flags blockedBySelfAnnotation when every candidate entry was annotated by the reviewer', async () => {
        const service = buildService({ reviewableRows: [], selfAnnotatedRows: [{ datasetId: 5 }, { datasetId: 5 }] });
        const dto = await service.getAccessibleDatasetItem(7, 5);

        assert.equal(dto.review.reviewableCount, 0);
        assert.equal(dto.review.reviewAvailable, false);
        assert.equal(dto.review.showReviewButton, true);
        assert.equal(dto.review.blockedBySelfAnnotation, true);
    });

    it('does not flag self-annotation when reviewable entries also exist', async () => {
        const service = buildService({ reviewableRows: [{ datasetId: 5 }], selfAnnotatedRows: [{ datasetId: 5 }] });
        const dto = await service.getAccessibleDatasetItem(7, 5);

        assert.equal(dto.review.reviewAvailable, true);
        assert.equal(dto.review.blockedBySelfAnnotation, false);
    });
});
