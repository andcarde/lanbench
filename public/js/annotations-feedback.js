// @ts-nocheck
/**
 * @file Renderizador del feedback de validacion en la pagina de anotacion.
 *
 * Convierte la lista canonica de {@link SentenceValidationDTO} devuelta por
 * `/api/annotations/check` en componentes Bootstrap (badges + tooltips +
 * cuadros de propuesta). Expuesto como UMD para que pueda usarse desde
 * tests y desde la pagina sin un sistema de modulos.
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
     * Convierte escape html al formato esperado.
     * @param {*} value - Valor de value usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Convierte format status label al formato esperado.
     * @param {string} status - Valor de status usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function formatStatusLabel(status) {
        if (status === 'completed') return 'Aceptada';
        if (status === 'disputed') return 'En disputa';
        return status || 'Desconocido';
    }

    /**
     * Convierte format failed criteria al formato esperado.
     * @param {*} failedCriteria - Valor de failedCriteria usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function formatFailedCriteria(failedCriteria) {
        if (!Array.isArray(failedCriteria) || failedCriteria.length === 0)
            return 'Ninguno';
        return failedCriteria
            .map(fc => `${fc.criterionCode} (${fc.decision})`)
            .join(', ');
    }

    /**
     * Convierte format corrections al formato esperado.
     * @param {Array} corrections - Valor de corrections usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function formatCorrections(corrections) {
        if (!Array.isArray(corrections) || corrections.length === 0)
            return 'Sin cambios';
        return corrections
            .map(c => `#${c.sentenceIndex}: "${c.correctedSentence}"`)
            .join(' | ');
    }

    /**
     * Convierte format feedback row al formato esperado.
     * @param {*} review - Valor de review usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Renderiza feedback table en la interfaz.
     * @param {*} feedback - Valor de feedback usado por la funcion.
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
