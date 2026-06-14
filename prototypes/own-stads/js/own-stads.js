// @ts-nocheck
/**
 * @file own-stads — UI logic of the "Mis estadísticas" prototype.
 *
 * Action-agnostic: it drives the page through whatever `window.OwnStadsActions`
 * is loaded (mock or real) and renders the user's personal statistics:
 *
 *   - global totals: annotations, reviews, datasets annotated / reviewed, and
 *     the average time per annotation and per review,
 *   - a per-dataset breakdown limited to datasets where the user has at least
 *     one annotation or review, with the per-dataset averages.
 *
 * Mirrors the UMD + `window.*Actions` convention of the shipped pages.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.OwnStadsUI = api;

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => api.bootstrap(window.OwnStadsActions));
        else
            api.bootstrap(window.OwnStadsActions);
    }
})(typeof self !== 'undefined' ? self : this, function () {
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
     * Formats an average duration in seconds as `Xm YYs` (or `Ys` under a
     * minute). Returns `—` when there is no activity (`null`/`0`).
     * @param {?number} seconds - Average seconds, or null.
     * @returns {string} Human-readable duration.
     */
    function formatDuration(seconds) {
        const value = Number(seconds);
        if (!Number.isFinite(value) || value <= 0)
            return '—';
        const total = Math.floor(value);
        const minutes = Math.floor(total / 60);
        const rest = total % 60;
        return minutes > 0
            ? `${minutes}m ${String(rest).padStart(2, '0')}s`
            : `${rest}s`;
    }

    /**
     * Builds the ordered list of summary cards from the totals block.
     * @param {object} totals - The `totals` section of the stats payload.
     * @returns {Array<{label:string, value:(string|number), cls:string}>} Cards.
     */
    function buildSummaryCards(totals) {
        const t = totals || {};
        return [
            { label: 'Anotaciones totales', value: Number(t.annotations || 0), cls: 'value-annotation' },
            { label: 'Revisiones totales', value: Number(t.reviews || 0), cls: 'value-review' },
            { label: 'Datasets anotados', value: Number(t.datasetsAnnotated || 0), cls: '' },
            { label: 'Datasets revisados', value: Number(t.datasetsReviewed || 0), cls: '' },
            { label: 'Tiempo medio · anotación', value: formatDuration(t.avgAnnotationSeconds), cls: 'value-annotation' },
            { label: 'Tiempo medio · revisión', value: formatDuration(t.avgReviewSeconds), cls: 'value-review' }
        ];
    }

    /**
     * Renders the summary cards and the per-dataset table.
     * @param {object} stats - Stats payload (`{ user, totals, datasets }`).
     * @param {{cards:HTMLElement, table:HTMLElement, who:HTMLElement}} el - Targets.
     * @returns {void}
     */
    function renderStats(stats, el) {
        const data = stats || {};
        const totals = data.totals || {};
        const datasets = Array.isArray(data.datasets) ? data.datasets : [];

        if (el.who)
            el.who.textContent = data.user && data.user.email ? data.user.email : '';

        if (el.cards) {
            el.cards.innerHTML = buildSummaryCards(totals).map(c => `
                <div class="col-6 col-md-4 col-lg-2">
                    <div class="stat-card">
                        <div class="stat-value ${c.cls}">${escapeHtml(c.value)}</div>
                        <div class="stat-label">${escapeHtml(c.label)}</div>
                    </div>
                </div>
            `).join('');
        }

        if (el.table) {
            el.table.innerHTML = datasets.length
                ? `<div class="table-responsive">
                       <table class="table table-sm align-middle stats-table mb-0">
                           <thead>
                               <tr>
                                   <th>Dataset</th>
                                   <th class="text-end">Anotaciones</th>
                                   <th class="text-end">T. medio anot.</th>
                                   <th class="text-end">Revisiones</th>
                                   <th class="text-end">T. medio rev.</th>
                               </tr>
                           </thead>
                           <tbody>
                               ${datasets.map(d => `
                                   <tr>
                                       <td>${escapeHtml(d.datasetName || `#${d.datasetId}`)}</td>
                                       <td class="text-end">${Number(d.annotations || 0)}</td>
                                       <td class="text-end">${escapeHtml(formatDuration(d.avgAnnotationSeconds))}</td>
                                       <td class="text-end">${Number(d.reviews || 0)}</td>
                                       <td class="text-end">${escapeHtml(formatDuration(d.avgReviewSeconds))}</td>
                                   </tr>
                               `).join('')}
                           </tbody>
                       </table>
                   </div>`
                : '<p class="text-muted mb-0">Aún no hay actividad registrada en ningún dataset.</p>';
        }
    }

    /**
     * Extracts a human-readable message from an action result.
     * @param {*} res - Result `{ ok, status, data }`.
     * @returns {string} Message to display.
     */
    function messageFromResult(res) {
        if (!res) return 'Error desconocido';
        const data = res.data;
        if (data && typeof data === 'object' && (data.message || data.code))
            return data.message || data.code;
        return `HTTP ${res ? res.status : '?'}`;
    }

    /**
     * Entry point: wires the refresh button and loads the stats.
     * @param {*} actions - Implementation of `window.OwnStadsActions`.
     * @returns {void}
     */
    function bootstrap(actions) {
        if (typeof document === 'undefined' || !actions) return;

        const el = {
            cards: document.getElementById('statsCards'),
            table: document.getElementById('statsByDataset'),
            who: document.getElementById('statsUser'),
            status: document.getElementById('statsStatus'),
            refreshBtn: document.getElementById('btnRefreshStats')
        };

        function setStatus(text) {
            if (el.status) el.status.textContent = text || '';
        }

        async function load() {
            setStatus('Cargando estadísticas...');
            const res = await actions.fetchMyStats();
            if (!res || !res.ok) {
                setStatus(`No se pudieron cargar las estadísticas: ${messageFromResult(res)}`);
                return;
            }
            renderStats(res.data, el);
            setStatus('');
        }

        if (el.refreshBtn) el.refreshBtn.addEventListener('click', load);
        load();
    }

    return { bootstrap, buildSummaryCards, renderStats, formatDuration, messageFromResult, escapeHtml };
});
