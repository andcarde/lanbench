// @ts-nocheck
/**
 * @file Renderer for the validation feedback on the annotation page.
 *
 * Converts the canonical list of {@link SentenceValidationDTO} returned by
 * `/api/annotations/check` into Bootstrap components (badges + tooltips +
 * proposal boxes). Exposed as UMD so it can be used from tests and from the
 * page without a module system.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.AnnotationsFeedback = api;
})(typeof self !== 'undefined' ? self : this, function () {

    /**
     * Escapes a value for safe insertion as HTML text.
     * @param {*} value - Value to escape.
     * @returns {string} HTML-escaped string.
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Formats a review status into a human-readable label.
     * @param {string} status - Review status.
     * @returns {string} Display label.
     */
    function formatStatusLabel(status) {
        if (status === 'completed') return 'Aceptada';
        if (status === 'disputed') return 'En disputa';
        return status || 'Desconocido';
    }

    /**
     * Formats the failed criteria into a readable summary.
     * @param {*} failedCriteria - List of failed criteria.
     * @returns {string} Summary string.
     */
    function formatFailedCriteria(failedCriteria) {
        if (!Array.isArray(failedCriteria) || failedCriteria.length === 0)
            return 'Ninguno';
        return failedCriteria
            .map(fc => `${fc.criterionCode} (${fc.decision})`)
            .join(', ');
    }

    /**
     * Formats the corrections into a readable summary.
     * @param {Array} corrections - List of corrections.
     * @returns {string} Summary string.
     */
    function formatCorrections(corrections) {
        if (!Array.isArray(corrections) || corrections.length === 0)
            return 'Sin cambios';
        return corrections
            .map(c => `#${c.sentenceIndex}: "${c.correctedSentence}"`)
            .join(' | ');
    }

    /**
     * Formats a review into a feedback table row (data + HTML).
     * @param {*} review - Review feedback entry.
     * @returns {*} Row object with summary fields and HTML, or null.
     */
    function formatFeedbackRow(review) {
        if (!review || typeof review !== 'object')
            return null;

        const failed = formatFailedCriteria(review.failedCriteria);
        const corrections = formatCorrections(review.corrections);
        const status = formatStatusLabel(review.status);

        return {
            id: review.id,
            entryId: review.entryId,
            statusLabel: status,
            failedSummary: failed,
            correctionsSummary: corrections,
            html: `<tr>
                <td>${escapeHtml(review.entryId)}</td>
                <td>${escapeHtml(status)}</td>
                <td>${escapeHtml(failed)}</td>
                <td>${escapeHtml(corrections)}</td>
            </tr>`
        };
    }

    /**
     * Renders the feedback table HTML.
     * @param {*} feedback - List of feedback entries.
     */
    function renderFeedbackTable(feedback) {
        if (!Array.isArray(feedback) || feedback.length === 0)
            return '<p class="text-muted">Aun no hay revisiones cerradas para este dataset.</p>';

        const rows = feedback
            .map(formatFeedbackRow)
            .filter(Boolean)
            .map(r => r.html)
            .join('');

        return `<table class="table table-sm">
            <thead>
                <tr>
                    <th>Entry</th>
                    <th>Estado</th>
                    <th>Criterios fallidos</th>
                    <th>Texto corregido</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    return {
        formatFeedbackRow,
        formatStatusLabel,
        formatFailedCriteria,
        formatCorrections,
        renderFeedbackTable,
        escapeHtml
    };
});
