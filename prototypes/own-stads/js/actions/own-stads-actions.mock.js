// @ts-nocheck
/**
 * @file own-stads — FRONT-MOCK actions (active by default).
 *
 * A self-contained, in-memory stand-in for `GET /api/me/stats`. No network, no
 * backend. Exposes the exact same `window.OwnStadsActions` interface as the real
 * twin so `own-stads.js` is identical in both modes (project's front-mocks
 * convention). Everything resets on reload — it is a prototype playground.
 *
 * The shape mirrors what the real `me-statistics-service` returns: global
 * totals plus a per-dataset breakdown limited to datasets where the user has
 * at least one annotation or review.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.OwnStadsActions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const NETWORK_DELAY_MS = 120;

    /**
     * Seeded per-dataset activity. Only datasets with at least one annotation or
     * review are surfaced; the totals are derived from these rows so the mock
     * stays internally consistent.
     */
    const SEED = [
        { datasetId: 1, datasetName: 'WebNLG-es', annotations: 42, annotationSeconds: 42 * 95, reviews: 18, reviewSeconds: 18 * 130 },
        { datasetId: 2, datasetName: 'Astronautas-es', annotations: 0, annotationSeconds: 0, reviews: 7, reviewSeconds: 7 * 210 },
        { datasetId: 5, datasetName: 'Monumentos-es', annotations: 13, annotationSeconds: 13 * 140, reviews: 0, reviewSeconds: 0 }
    ];

    /**
     * Average (floored) of `seconds / count`, or null when there is no activity.
     * @param {number} seconds - Total seconds.
     * @param {number} count - Number of tasks.
     * @returns {?number} Average seconds, or null.
     */
    function average(seconds, count) {
        return count > 0 ? Math.floor(seconds / count) : null;
    }

    /**
     * Builds the global statistics payload from the seed.
     * @returns {object} The `{ user, totals, datasets }` payload.
     */
    function buildStats() {
        const datasets = SEED
            .filter(d => d.annotations > 0 || d.reviews > 0)
            .map(d => ({
                datasetId: d.datasetId,
                datasetName: d.datasetName,
                annotations: d.annotations,
                reviews: d.reviews,
                avgAnnotationSeconds: average(d.annotationSeconds, d.annotations),
                avgReviewSeconds: average(d.reviewSeconds, d.reviews)
            }))
            .sort((a, b) => a.datasetName.localeCompare(b.datasetName));

        const totalAnnotations = SEED.reduce((acc, d) => acc + d.annotations, 0);
        const totalReviews = SEED.reduce((acc, d) => acc + d.reviews, 0);
        const totalAnnotationSeconds = SEED.reduce((acc, d) => acc + d.annotationSeconds, 0);
        const totalReviewSeconds = SEED.reduce((acc, d) => acc + d.reviewSeconds, 0);

        return {
            user: { id: 1, email: 'tu.cuenta@lanbench.dev' },
            totals: {
                annotations: totalAnnotations,
                reviews: totalReviews,
                datasetsAnnotated: SEED.filter(d => d.annotations > 0).length,
                datasetsReviewed: SEED.filter(d => d.reviews > 0).length,
                avgAnnotationSeconds: average(totalAnnotationSeconds, totalAnnotations),
                avgReviewSeconds: average(totalReviewSeconds, totalReviews)
            },
            datasets
        };
    }

    /**
     * Resolves a value after a small delay to mimic network latency.
     * @param {*} value - Value to return.
     * @returns {Promise<*>} Promise resolved with the value.
     */
    function delay(value) {
        return new Promise(resolve => setTimeout(() => resolve(value), NETWORK_DELAY_MS));
    }

    /**
     * Fetches the current user's global statistics.
     * @returns {Promise<{ok:boolean,status:number,data:*}>} Normalized result.
     */
    function fetchMyStats() {
        return delay({ ok: true, status: 200, data: buildStats() });
    }

    return { fetchMyStats };
});
