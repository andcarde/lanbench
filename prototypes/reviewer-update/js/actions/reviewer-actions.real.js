// @ts-nocheck
/**
 * @file reviewer-update — REAL actions (decoupled, not loaded by default).
 *
 * Talks to the live review API documented in TECHNICAL-DESIGN.md §4.2 / §4.5.
 * Exposes the exact same `window.ReviewerActions` interface as the front-mock
 * twin, so `reviewer.js` is identical in both modes. Swap the `<script>` tag in
 * `reviewer.html` to activate it (needs the running app + a logged-in reviewer
 * — moderator for the global queue, or `Permit.isReviewer` for a scoped one).
 *
 * Endpoint map:
 *   POST   /api/reviews/request            -> fetchNextReview
 *   GET    /api/reviews/:id                -> fetchReviewContext
 *   POST   /api/reviews/:id/decisions      -> submitDecision
 *   POST   /api/reviews/:id/corrections    -> submitCorrection
 *   POST   /api/reviews/:id/finalize       -> finalizeReview
 *   POST   /api/reviews/:id/release        -> releaseReview
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
     * Performs a JSON request and normalizes the response.
     * @param {string} url - Target URL.
     * @param {*} options - `fetch` options.
     * @returns {Promise<{ok:boolean,status:number,data:*}>} Normalized result.
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
     * Requests the next review from the queue, optionally scoped.
     * @param {?number} datasetId - Dataset to scope by (null = global queue).
     * @returns {Promise<*>} Result with the assigned review.
     */
    function fetchNextReview(datasetId = null) {
        const normalized = Number(datasetId);
        const body = Number.isInteger(normalized) && normalized > 0
            ? JSON.stringify({ datasetId: normalized })
            : undefined;
        return callJson(`${BASE}/request`, { method: 'POST', ...(body ? { body } : {}) });
    }

    /**
     * Loads the full context of a review.
     * @param {number} reviewId - Review identifier.
     * @returns {Promise<*>} Context (review, criteria, decisions, sentences, etc.).
     */
    function fetchReviewContext(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}`, { method: 'GET' });
    }

    /**
     * Records the decision for a criterion.
     * @param {number} reviewId - Review identifier.
     * @param {{criterionCode:string,decision:string,comment:?string}} payload - Decision.
     * @returns {Promise<*>} Result (may carry `criterion_locked` / `comment_required`).
     */
    function submitDecision(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/decisions`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Persists the correction of a sentence.
     * @param {number} reviewId - Review identifier.
     * @param {{sentenceIndex:number,originalSentence:string,correctedSentence:string,comment:string}} payload - Correction.
     * @returns {Promise<*>} Result (may carry `invalid_correction`).
     */
    function submitCorrection(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/corrections`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Closes the review (requires all criteria decided).
     * @param {number} reviewId - Review identifier.
     * @returns {Promise<*>} Result with `status` `completed`|`disputed`.
     */
    function finalizeReview(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/finalize`, { method: 'POST' });
    }

    /**
     * Releases the review and returns it to the queue.
     * @param {number} reviewId - Review identifier.
     * @returns {Promise<*>} Result of the release.
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
