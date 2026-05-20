// @ts-nocheck
/**
 * @file Actions (AJAX) consumed by the reviewer page.
 *
 * Centralizes calls to `/api/reviews/*` (`request`, decisions, corrections,
 * `finalize`, `release`).
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.ReviewerActions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const BASE = '/api/reviews';

    /**
     * Performs a JSON call against the server and returns { ok, status, data }.
     * @param {string} url - URL to call.
     * @param {*} options - Fetch options (method, body, headers).
     * @returns {Promise<*>} Normalized result of the call.
     */
    async function callJson(url, options = {}) {
        const fetchImpl = typeof fetch === 'function' ? fetch : null;
        if (!fetchImpl)
            throw new Error('fetch is not available');

        const response = await fetchImpl(url, {
            credentials: 'same-origin',
            ...options,
            headers: {
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });

        const text = await response.text();
        let data = null;
        if (text) {
            try { data = JSON.parse(text); }
            catch { data = text; }
        }
        return { ok: response.ok, status: response.status, data };
    }

    /**
     * Requests the next review from the API.
     * @param {?number} datasetId - Optional dataset to scope the review.
     * @returns {Promise<*>} Normalized result of the call.
     */
    function fetchNextReview(datasetId = null) {
        const normalizedDatasetId = Number(datasetId);
        const body = Number.isInteger(normalizedDatasetId) && normalizedDatasetId > 0
            ? JSON.stringify({ datasetId: normalizedDatasetId })
            : undefined;

        return callJson(`${BASE}/request`, {
            method: 'POST',
            ...(body ? { body } : {})
        });
    }

    /**
     * Fetches the context of the given review.
     * @param {number} reviewId - Review id.
     * @returns {Promise<*>} Normalized result of the call.
     */
    function fetchReviewContext(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}`, { method: 'GET' });
    }

    /**
     * Submits a criterion decision for the given review.
     * @param {number} reviewId - Review id.
     * @param {*} payload - Decision payload (criterionCode, decision, comment).
     * @returns {Promise<*>} Normalized result of the call.
     */
    function submitDecision(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/decisions`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Submits a text correction for a sentence of the given review.
     * @param {number} reviewId - Review id.
     * @param {*} payload - Correction payload (sentenceIndex, correctedSentence, comment).
     * @returns {Promise<*>} Normalized result of the call.
     */
    function submitCorrection(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/corrections`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Finalizes (closes) the given review.
     * @param {number} reviewId - Review id.
     */
    function finalizeReview(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/finalize`, { method: 'POST' });
    }

    /**
     * Releases the given review back to the pending pool.
     * @param {number} reviewId - Review id.
     * @returns {Promise<*>} Normalized result of the call.
     */
    function releaseReview(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/release`, { method: 'POST' });
    }

    return {
        fetchNextReview,
        fetchReviewContext,
        submitDecision,
        submitCorrection,
        finalizeReview,
        releaseReview
    };
});
