// @ts-nocheck
/**
 * @file own-stads — UI logic of the "Mis estadísticas" prototype.
 *
 * Self-contained: no backend, no dependency on the reviewer prototype. The
 * figures are GLOBAL on purpose — they are NOT broken down by dataset nor by
 * task type (annotation vs review); they summarize the person's whole activity.
 *
 * In a real backend this would consume a single `GET /api/me/stats` endpoint
 * returning the same shape produced by `buildStats()` below.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.OwnStadsUI = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', api.bootstrap);
        else
            api.bootstrap();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    /**
     * Global, task-agnostic statistics (front-mock). One flat summary — no
     * `datasetId`, no annotation/review split.
     * @returns {object} The stats payload consumed by `renderStats`.
     */
    function buildStats() {
        return {
            completed: 128,        // tareas cerradas correctamente (anotación + revisión)
            disputed: 19,          // revisiones cerradas en disputa
            acceptanceRate: 87,    // % aceptado a la primera
            avgMinutes: 6,         // tiempo medio por tarea
            pending: 23,           // tareas pendientes en cola
            recent: [
                { outcome: 'completed', label: 'Revisión · entry 4012', finishedAt: 'hace 1 h' },
                { outcome: 'disputed', label: 'Revisión · entry 4090', finishedAt: 'hace 3 h' },
                { outcome: 'completed', label: 'Anotación · entry 7781', finishedAt: 'ayer' },
                { outcome: 'completed', label: 'Revisión · entry 3815', finishedAt: 'ayer' },
                { outcome: 'completed', label: 'Anotación · entry 3801', finishedAt: 'hace 2 días' }
            ]
        };
    }

    /**
     * Escapes HTML for safe insertion into the DOM.
     * @param {*} value - Value to escape.
     * @returns {string} Escaped text.
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
     * Renders the stat cards and the recent-activity list.
     * @param {object} stats - Stats payload (see `buildStats`).
     * @param {{cards:HTMLElement, recent:HTMLElement}} el - Target elements.
     * @returns {void}
     */
    function renderStats(stats, el) {
        const cards = [
            { label: 'Tareas completadas', value: stats.completed, cls: 'value-accepted' },
            { label: 'Cerradas en disputa', value: stats.disputed, cls: 'value-disputed' },
            { label: '% aceptación a la primera', value: `${stats.acceptanceRate}%`, cls: '' },
            { label: 'Tiempo medio (min)', value: stats.avgMinutes, cls: '' },
            { label: 'Pendientes en cola', value: stats.pending, cls: '' }
        ];

        if (el.cards) {
            el.cards.innerHTML = cards.map(c => `
                <div class="col-6 col-md-4 col-lg">
                    <div class="proto-stat-card">
                        <div class="proto-stat-value ${c.cls}">${escapeHtml(c.value)}</div>
                        <div class="proto-stat-label">${escapeHtml(c.label)}</div>
                    </div>
                </div>
            `).join('');
        }

        if (el.recent) {
            const rows = stats.recent || [];
            el.recent.innerHTML = rows.length
                ? rows.map(r => `
                    <div class="stats-recent-row">
                        <span class="outcome ${escapeHtml(r.outcome)}">${r.outcome === 'completed' ? 'completada' : 'disputa'}</span>
                        <span>${escapeHtml(r.label)}</span>
                        <span class="meta">${escapeHtml(r.finishedAt)}</span>
                    </div>`).join('')
                : '<p class="text-muted mb-0">Aún no hay actividad registrada.</p>';
        }
    }

    /**
     * Entry point: wires the refresh button and paints the initial stats.
     * @returns {void}
     */
    function bootstrap() {
        if (typeof document === 'undefined') return;
        const el = {
            cards: document.getElementById('statsCards'),
            recent: document.getElementById('statsRecent'),
            refreshBtn: document.getElementById('btnRefreshStats')
        };

        const paint = () => renderStats(buildStats(), el);
        if (el.refreshBtn) el.refreshBtn.addEventListener('click', paint);
        paint();
    }

    return { bootstrap, buildStats, renderStats, escapeHtml };
});
