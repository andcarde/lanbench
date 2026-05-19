// @ts-nocheck
/**
 * @file Acciones (AJAX) consumidas por la pagina del revisor.
 *
 * Centraliza llamadas a `/api/reviews/*` (`request`, decisiones,
 * correcciones, `finalize`, `release`).
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
     * Ejecuta de forma asincrona la logica de call json.
     * @param {string} url - Valor de url usado por la funcion.
     * @param {*} options - Valor de options usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
            catch (_e) { data = text; }
        }
        return { ok: response.ok, status: response.status, data };
    }

    /**
     * Obtiene next review desde la fuente correspondiente.
     * @param {?number} datasetId - Dataset opcional para acotar la revision.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
     * Obtiene review context desde la fuente correspondiente.
     * @param {number} reviewId - Valor de reviewId usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function fetchReviewContext(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}`, { method: 'GET' });
    }

    /**
     * Ejecuta submit decision contra la capa de persistencia o API correspondiente.
     * @param {number} reviewId - Valor de reviewId usado por la funcion.
     * @param {*} payload - Valor de payload usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function submitDecision(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/decisions`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Ejecuta submit correction contra la capa de persistencia o API correspondiente.
     * @param {number} reviewId - Valor de reviewId usado por la funcion.
     * @param {*} payload - Valor de payload usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
     */
    function submitCorrection(reviewId, payload) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/corrections`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    /**
     * Ejecuta la logica de finalize review.
     * @param {number} reviewId - Valor de reviewId usado por la funcion.
     */
    function finalizeReview(reviewId) {
        return callJson(`${BASE}/${encodeURIComponent(reviewId)}/finalize`, { method: 'POST' });
    }

    /**
     * Ejecuta release review contra la capa de persistencia o API correspondiente.
     * @param {number} reviewId - Valor de reviewId usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
