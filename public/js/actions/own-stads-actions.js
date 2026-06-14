// @ts-nocheck
/**
 * @file own-stads — REAL actions (decoupled, not loaded by default).
 *
 * Talks to the live personal-statistics API. Exposes the exact same
 * `window.OwnStadsActions` interface as the front-mock twin, so `own-stads.js`
 * is identical in both modes. Swap the `<script>` tag in `own-stads.html` to
 * activate it (needs the running app + a logged-in user).
 *
 * Endpoint map:
 *   GET /api/me/stats -> fetchMyStats
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.OwnStadsActions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const STATS_URL = '/api/me/stats';

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
     * Fetches the current user's global statistics.
     * @returns {Promise<*>} Normalized result with the `{ user, totals, datasets }` payload.
     */
    function fetchMyStats() {
        return callJson(STATS_URL, { method: 'GET' });
    }

    return { fetchMyStats };
});
