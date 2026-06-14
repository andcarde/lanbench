'use strict';

/**
 * Unit coverage for the conditional "Nuevo dataset" creation rules (P6):
 *   - the pure frontend rule encoder `applyNewDatasetFormRules` (R1 + R2);
 *   - the server-side defensive normalisation in `createDataset`
 *     (policy: NORMALISE, never reject).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { applyNewDatasetFormRules } = require('../../../public/js/datasets');
const { createDatasetsService } = require('../../../services/datasets-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('applyNewDatasetFormRules (P6, pure)', () => {
    const cases = [
        {
            name: 'review off ⇒ additional hidden + off (R1)',
            input: { llmMode: 'none', review: false, additionalReviews: true },
            expected: { review: false, additionalReviews: false, reviewLocked: false, additionalShown: false, additionalLocked: false }
        },
        {
            name: 'review on ⇒ additional shown, value preserved',
            input: { llmMode: 'none', review: true, additionalReviews: true },
            expected: { review: true, additionalReviews: true, reviewLocked: false, additionalShown: true, additionalLocked: false }
        },
        {
            name: 'review on, additional off ⇒ shown but off',
            input: { llmMode: 'generation', review: true, additionalReviews: false },
            expected: { review: true, additionalReviews: false, reviewLocked: false, additionalShown: true, additionalLocked: false }
        },
        {
            name: 'generation + review off ⇒ additional off (R1, no R2)',
            input: { llmMode: 'generation', review: false, additionalReviews: true },
            expected: { review: false, additionalReviews: false, reviewLocked: false, additionalShown: false, additionalLocked: false }
        },
        {
            name: 'correction forces review + additional, both locked (R2)',
            input: { llmMode: 'correction', review: false, additionalReviews: false },
            expected: { review: true, additionalReviews: true, reviewLocked: true, additionalShown: true, additionalLocked: true }
        }
    ];

    for (const testCase of cases) {
        it(testCase.name, () => {
            assert.deepEqual(applyNewDatasetFormRules(testCase.input), testCase.expected);
        });
    }
});

/**
 * Builds a datasets-service whose creation captures the persisted `datasetData`.
 * @param {(data:any)=>void} capture
 * @returns {*}
 */
function buildService(capture) {
    return createDatasetsService(/** @type {any} */ ({
        readDataset() { return { entries: [{ eid: 1 }] }; },
        readFileAsBuffer() { return Buffer.from('<benchmark />'); },
        parseDatasetImport() { return { entries: [] }; },
        datasetsRepository: {
            async createOwnedDataset(/** @type {*} */ payload) {
                capture(payload.datasetData);
                return { id: 9, ...payload.datasetData, colorClass: 'dataset-purple' };
            }
        }
    }));
}

describe('createDataset server-side rule normalisation (P6, T6.3)', () => {
    it('correction ⇒ review + additional forced true even if the request says otherwise', async () => {
        /** @type {any} */
        let captured = null;
        const service = buildService((data) => { captured = data; });

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, {
            llmMode: 'correction', isReviewEnabled: 'false', hasAdditionalReviews: 'false'
        });

        assert.equal(captured.llmMode, 'correction');
        assert.equal(captured.isReviewEnabled, true);
        assert.equal(captured.hasAdditionalReviews, true);
    });

    it('review disabled ⇒ additional reviews forced false', async () => {
        /** @type {any} */
        let captured = null;
        const service = buildService((data) => { captured = data; });

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, {
            llmMode: 'none', isReviewEnabled: 'false', hasAdditionalReviews: 'true'
        });

        assert.equal(captured.isReviewEnabled, false);
        assert.equal(captured.hasAdditionalReviews, false);
    });

    it('review enabled (non-correction) keeps the requested additional flag', async () => {
        /** @type {any} */
        let captured = null;
        const service = buildService((data) => { captured = data; });

        await service.createDataset(7, { filename: 't.xml', originalname: 'D.xml' }, {
            llmMode: 'generation', isReviewEnabled: 'true', hasAdditionalReviews: 'true'
        });

        assert.equal(captured.isReviewEnabled, true);
        assert.equal(captured.hasAdditionalReviews, true);
    });
});
