'use strict';

/**
 * Unit coverage for the dataset review button tooltip. When the button is
 * disabled specifically because the reviewer annotated every candidate entry
 * (self-review rule, USER-STORIES §US-13), the tooltip must explain that
 * instead of the generic "nothing to review" wording.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { reviewButtonTitle, normaliseDatasetReviewState } = require('../../../public/js/datasets');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const SELF_ANNOTATION_TOOLTIP = 'Todas las entradas pendientes han sido anotadas por ti. Otra persona debe ser el revisor.';

describe('reviewButtonTitle', () => {
    it('shows "Abrir revisión" when there is something to review', () => {
        assert.equal(
            reviewButtonTitle({ showReviewButton: true, reviewAvailable: true, reviewableCount: 2 }),
            'Abrir revisión'
        );
    });

    it('explains the self-review rule when the reviewer annotated every candidate entry', () => {
        assert.equal(
            reviewButtonTitle({ showReviewButton: true, reviewAvailable: false, reviewableCount: 0, blockedBySelfAnnotation: true }),
            SELF_ANNOTATION_TOOLTIP
        );
    });

    it('falls back to the generic message when there is simply nothing annotated yet', () => {
        assert.equal(
            reviewButtonTitle({ showReviewButton: true, reviewAvailable: false, reviewableCount: 0, blockedBySelfAnnotation: false }),
            'No hay secciones pendientes de revisión'
        );
    });

    it('prefers the open-review wording even if the self-annotation flag is set', () => {
        assert.equal(
            reviewButtonTitle({ reviewAvailable: true, blockedBySelfAnnotation: true }),
            'Abrir revisión'
        );
    });

    it('tolerates a missing/invalid review object', () => {
        assert.equal(reviewButtonTitle(null), 'No hay secciones pendientes de revisión');
        assert.equal(reviewButtonTitle(undefined), 'No hay secciones pendientes de revisión');
    });
});

describe('normaliseDatasetReviewState', () => {
    it('normalises blockedBySelfAnnotation to a boolean', () => {
        assert.equal(normaliseDatasetReviewState({ blockedBySelfAnnotation: 1 }).blockedBySelfAnnotation, true);
        assert.equal(normaliseDatasetReviewState({}).blockedBySelfAnnotation, false);
    });
});
