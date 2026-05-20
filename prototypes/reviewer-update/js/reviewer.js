// @ts-nocheck
/**
 * @file reviewer-update — UI logic of the reviewer prototype.
 *
 * Action-agnostic: it drives the page through whatever `window.ReviewerActions`
 * is loaded (mock or real). Implements the reviewer flow:
 *
 *   - click a phrase to evaluate it; each phrase keeps its own decision state,
 *   - per-phrase sequential wizard of 5 criteria (the next stays locked until
 *     the current one is decided; backtracking to re-decide is allowed),
 *   - one review-level criterion (`diversity`) decided once for the entry,
 *   - binary decision `accepted` ("Sí") / `rejected` ("No"): "Sí" commits at
 *     once; "No" requires a motivo (<=280 chars) and a "Siguiente" to commit,
 *   - inline sentence correction, mandatory when a phrase criterion is "No",
 *   - auto-finalize once every criterion is decided -> completed | disputed,
 *   - 2-hour exclusive-assignment expiry countdown.
 *
 * Mirrors the UMD + `window.ReviewerActions` convention of the shipped
 * `public/js/reviewer.js`.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.ReviewerProtoUI = api;

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => api.bootstrap(window.ReviewerActions));
        else
            api.bootstrap(window.ReviewerActions);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    const DECISION_ACCEPTED = 'accepted';
    const DECISION_REJECTED = 'rejected';

    const DECISION_LABELS = {
        [DECISION_ACCEPTED]: 'Sí',
        [DECISION_REJECTED]: 'No'
    };

    // The reviewer queue is fixed to a single dataset (no scope selector in the UI).
    const FIXED_DATASET = { id: 1, name: 'WebNLG-es' };

    const COMMENT_MAX_LENGTH = 280;

    const EXPIRY_WARNING_MS = 5 * 60 * 1000;

    /**
     * Whether a decision requires a justifying comment.
     * @param {string} decision - Decision selected by the reviewer.
     * @returns {boolean} True for `rejected` ("No"); "Sí" never takes a comment.
     */
    function requiresComment(decision) {
        return decision === DECISION_REJECTED;
    }

    /**
     * Whether a proposed correction is valid: non-empty AND actually different
     * from the annotator's original sentence.
     * @param {string} corrected - Proposed corrected text.
     * @param {string} original - Annotator's original sentence.
     * @returns {boolean} True when "Guardar corrección" may be enabled/saved.
     */
    function isCorrectionChanged(corrected, original) {
        const value = (corrected || '').trim();
        return value !== '' && value !== (original || '').trim();
    }

    /**
     * Normalizes the received criteria together with the decisions already made.
     * @param {Array} criteria - Ordered catalog of criteria.
     * @param {Array} decisions - Previous decisions (`ReviewDecision`).
     * @returns {Array} Criteria state used by the wizard.
     */
    function buildCriteriaState(criteria, decisions) {
        const byCode = new Map((decisions || []).map(d => [d.criterionCode, d]));
        return (criteria || []).map(criterion => {
            const decision = byCode.get(criterion.code) || null;
            return {
                code: criterion.code,
                label: criterion.label,
                description: criterion.description || '',
                decided: Boolean(decision),
                decision: decision ? decision.decision : null,
                comment: decision ? (decision.comment || '') : '',
                editing: false,
                draftDecision: decision ? decision.decision : null,
                draftComment: decision ? (decision.comment || '') : '',
                error: ''
            };
        });
    }

    /**
     * Index of the active criterion: the first undecided one, or `length` if
     * they are all resolved.
     * @param {Array} criteria - Criteria state.
     * @returns {number} Index of the active criterion.
     */
    function activeCriterionIndex(criteria) {
        const index = criteria.findIndex(c => !c.decided);
        return index < 0 ? criteria.length : index;
    }

    /**
     * Checks whether every criterion has been decided.
     * @param {Array} criteria - Criteria state.
     * @returns {boolean} True when it can be finalized.
     */
    function canFinalize(criteria) {
        return Array.isArray(criteria) && criteria.length > 0 && criteria.every(c => c.decided);
    }

    /**
     * Predicted review outcome based on the decisions.
     * @param {Array} criteria - Criteria state.
     * @returns {string} `completed` if everything is `accepted`, otherwise `disputed`.
     */
    function predictedOutcome(criteria) {
        return criteria.every(c => c.decision === DECISION_ACCEPTED) ? 'completed' : 'disputed';
    }

    /**
     * Normalizes the annotated sentences with their previous corrections.
     * @param {Array} annotations - Annotator sentences.
     * @param {Array} comments - Previous corrections (`ReviewComment`).
     * @returns {Array} Per-sentence state.
     */
    function buildSentenceState(annotations, comments) {
        const latest = new Map();
        (comments || []).forEach(c => {
            if (c && Number.isInteger(c.sentenceIndex))
                latest.set(c.sentenceIndex, c);
        });

        return (annotations || []).map(annotation => {
            const sentenceIndex = Number.isInteger(annotation.sentenceIndex) ? annotation.sentenceIndex : 0;
            const previous = latest.get(sentenceIndex) || null;
            return {
                sentenceIndex,
                sentence: annotation.sentence || '',
                origin: annotation.origin || 'manual',
                correctedSentence: previous ? (previous.correctedSentence || '') : '',
                correctionComment: previous ? (previous.comment || '') : '',
                persistedCorrection: Boolean(previous),
                editing: false,
                draftCorrected: previous ? (previous.correctedSentence || '') : '',
                draftComment: previous ? (previous.comment || '') : '',
                error: ''
            };
        });
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
     * Extracts a human-readable message from an action result.
     * @param {*} res - Result `{ ok, status, data }`.
     * @returns {string} Message to display.
     */
    function messageFromResult(res) {
        if (!res) return 'Error desconocido';
        const data = res.data;
        if (data && typeof data === 'object') {
            if (data.message) return data.message;
            if (data.code) return data.code;
        }
        if (typeof data === 'string' && data) return data;
        return `HTTP ${res.status}`;
    }

    /**
     * Reads the `datasetId` from the query string if the screen is scoped.
     * @param {Location} locationLike - Browser location.
     * @returns {?number} Normalized dataset, or null.
     */
    function readDatasetIdFromLocation(locationLike) {
        const search = locationLike && typeof locationLike.search === 'string' ? locationLike.search : '';
        const value = Number(new URLSearchParams(search).get('datasetId'));
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    /**
     * Entry point: wires the DOM to the received actions.
     * @param {*} actions - Implementation of `window.ReviewerActions`.
     * @returns {void}
     */
    function bootstrap(actions) {
        if (typeof document === 'undefined' || !actions)
            return;

        const el = {
            scopeHint: document.getElementById('scopeHint'),
            requestBtn: document.getElementById('btnRequestReview'),
            empty: document.getElementById('reviewEmpty'),
            workspace: document.getElementById('reviewWorkspace'),
            entryPanel: document.getElementById('entryPanel'),
            annotator: document.getElementById('reviewAnnotator'),
            entryTriples: document.getElementById('entryTriples'),
            sentences: document.getElementById('reviewSentences'),
            criteria: document.getElementById('reviewCriteria'),
            criteriaProgress: document.getElementById('criteriaProgress'),
            expiryBadge: document.getElementById('expiryBadge')
        };

        const state = {
            datasetId: FIXED_DATASET.id,
            review: null,
            phraseCriteria: [],          // catalog: the 5 per-phrase criteria
            reviewCriteria: [],          // review-level criterion state (diversidad)
            sentences: [],               // each carries its own `criteria` wizard state
            selectedIndex: null,         // index of the phrase being evaluated
            context: { triples: [], englishSentences: [], alertDecisions: [] },
            finalized: false,
            expiryTimer: null,
            nextTimer: null              // delay before "Finalizado" turns into "Siguiente"
        };

        // ----------------------------------------------------------------- //
        // Status + scope                                                    //
        // ----------------------------------------------------------------- //

        function setStatus(text) {
            if (el.status) el.status.textContent = text || '';
        }

        // The top button is a small state machine:
        //   siguiente  → blue, enabled  (request the next review; also the start state)
        //   pendiente  → grey, disabled (a review is open, criteria not all decided yet)
        //   finalizado → green, disabled (just auto-finalized; becomes "siguiente" after a pause)
        function setNextButton(mode) {
            const btn = el.requestBtn;
            if (!btn) return;
            btn.classList.remove('btn-primary', 'btn-secondary', 'btn-success');
            if (mode === 'pendiente') {
                btn.textContent = 'Pendiente';
                btn.classList.add('btn-secondary');
                btn.disabled = true;
            } else if (mode === 'finalizado') {
                btn.textContent = 'Finalizado';
                btn.classList.add('btn-success');
                btn.disabled = true;
            } else {
                btn.textContent = 'Siguiente';
                btn.classList.add('btn-primary');
                btn.disabled = false;
            }
        }

        function refreshScopeHint() {
            if (el.scopeHint) el.scopeHint.textContent = `Dataset · ${FIXED_DATASET.name}`;
        }

        // ----------------------------------------------------------------- //
        // Expiry countdown                                                  //
        // ----------------------------------------------------------------- //

        function stopExpiryTimer() {
            if (state.expiryTimer) {
                clearInterval(state.expiryTimer);
                state.expiryTimer = null;
            }
            if (el.expiryBadge) el.expiryBadge.classList.add('d-none');
        }

        function renderExpiry() {
            if (!el.expiryBadge || !state.review || !state.review.expiresAt) {
                if (el.expiryBadge) el.expiryBadge.classList.add('d-none');
                return;
            }
            const remaining = new Date(state.review.expiresAt).getTime() - Date.now();
            el.expiryBadge.classList.remove('d-none', 'is-ok', 'is-warning', 'is-expired');

            if (remaining <= 0) {
                el.expiryBadge.classList.add('is-expired');
                el.expiryBadge.textContent = 'Asignación expirada — puede reasignarse';
                return;
            }
            const totalSeconds = Math.floor(remaining / 1000);
            const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
            const ss = String(totalSeconds % 60).padStart(2, '0');
            el.expiryBadge.classList.add(remaining <= EXPIRY_WARNING_MS ? 'is-warning' : 'is-ok');
            el.expiryBadge.textContent = `Reserva exclusiva · ${mm}:${ss}`;
        }

        function startExpiryTimer() {
            stopExpiryTimer();
            renderExpiry();
            state.expiryTimer = setInterval(renderExpiry, 1000);
        }

        // ----------------------------------------------------------------- //
        // Rendering — context                                               //
        // ----------------------------------------------------------------- //

        // Annotator goes in the title-row action group; the remaining panel holds
        // only the Triples RDF. (English ref + alerts live in each phrase card.)
        function renderContext() {
            if (el.annotator) {
                el.annotator.textContent = state.review
                    ? (state.review.annotatorEmail ? `Anotó: ${state.review.annotatorEmail}` : `Review #${state.review.id}`)
                    : '';
            }

            if (el.entryTriples) {
                const triplesHtml = (state.context.triples || []).map(t =>
                    `<li><code>${escapeHtml(t.subject)}</code> · <code>${escapeHtml(t.predicate)}</code> · <code>${escapeHtml(t.object)}</code></li>`
                ).join('');
                el.entryTriples.innerHTML = `
                    <span class="entry-triples-label">Triples RDF</span>
                    <ul class="reviewer-triples">${triplesHtml || '<li class="text-muted">(sin triples)</li>'}</ul>
                `;
            }
        }

        // ----------------------------------------------------------------- //
        // Rendering — sentences + inline correction                         //
        // ----------------------------------------------------------------- //

        function renderSentences() {
            if (!el.sentences) return;

            if (state.sentences.length === 0) {
                el.sentences.innerHTML = '<p class="text-muted mb-0">No hay frases anotadas para esta entry.</p>';
                return;
            }

            // When the global Diversidad is "No", advise (above phrase #0) that at
            // least one phrase below needs rewording to add lexical variety.
            const diversityNotice = diversityRejected()
                ? `<div class="diversity-notice" role="note">Diversidad en «No»: cambia al menos una de las frases siguientes para aportar variedad léxica frente al resto.</div>`
                : '';

            el.sentences.innerHTML = diversityNotice + state.sentences.map((s, i) => {
                const correctedFlag = s.persistedCorrection
                    ? '<span class="sentence-corrected-flag">corregida</span>'
                    : '';
                const originalClass = s.persistedCorrection ? 'sentence-text is-superseded' : 'sentence-text';
                const correctionPreview = s.persistedCorrection
                    ? `<div class="sentence-correction-preview">
                           <span class="label">Corrección propuesta</span>
                           ${escapeHtml(s.correctedSentence)}
                       </div>`
                    : '';

                const editForm = state.finalized
                    ? ''
                    : s.editing
                    ? `<div class="sentence-edit-form" data-index="${i}">
                           <label>Texto corregido (obligatorio)
                               <textarea class="form-control form-control-sm js-corrected" rows="2">${escapeHtml(s.draftCorrected || s.sentence)}</textarea>
                           </label>
                           ${s.error ? `<p class="criterion-error mb-0">${escapeHtml(s.error)}</p>` : ''}
                           <div class="d-flex gap-2 justify-content-center">
                               <button type="button" class="btn btn-sm btn-warning js-save-correction" ${isCorrectionChanged(s.draftCorrected || s.sentence, s.sentence) ? '' : 'disabled'}>Guardar corrección</button>
                               ${correctionMandatory(s) && !s.persistedCorrection ? '' : '<button type="button" class="btn btn-sm btn-link text-secondary js-cancel-correction">Cancelar</button>'}
                           </div>
                       </div>`
                    : `<button type="button" class="btn btn-sm btn-outline-warning js-edit-correction" data-index="${i}">
                           ${s.persistedCorrection ? 'Editar corrección' : 'Corregir frase'}
                       </button>`;

                const total = (s.criteria || []).length;
                const decided = (s.criteria || []).filter(c => c.decided).length;
                const progressClass = total > 0 && decided === total ? 'is-complete' : '';
                const progressBadge = `<span class="sentence-progress ${progressClass}" title="Criterios resueltos en esta frase">${decided}/${total}</span>`;
                const selectedClass = i === state.selectedIndex ? 'is-selected' : '';

                // English reference linked to this annotation (shown ABOVE it).
                const englishRef = (state.context.englishSentences || [])[s.sentenceIndex];
                const englishHtml = englishRef
                    ? `<p class="sentence-english"><span class="label">Referencia EN</span> ${escapeHtml(englishRef)}</p>`
                    : '';

                // Alerts the annotator resolved for this sentence (shown BELOW it).
                const sentenceAlerts = (state.context.alertDecisions || []).filter(d => d.sentenceIndex === s.sentenceIndex);
                const alertsHtml = sentenceAlerts.length
                    ? `<div class="sentence-alerts">${sentenceAlerts.map(d => {
                        const typeClass = `type-${escapeHtml(d.alertType || 'semantic')}`;
                        const decisionClass = d.decision === 'dismissed' ? 'alert-decision-dismissed' : 'alert-decision-applied';
                        const reason = d.reason ? ` — <span class="text-muted">${escapeHtml(d.reason)}</span>` : '';
                        return `<div class="sentence-alert">
                            <span class="alert-tag ${typeClass}">${escapeHtml(d.alertType || 'semantic')}</span>
                            <em>${escapeHtml(d.alertCode)}</em>
                            <span class="${decisionClass}">[${escapeHtml(d.decision)}]</span>${reason}
                        </div>`;
                    }).join('')}</div>`
                    : '';

                return `
                    <article class="reviewer-sentence-card ${s.persistedCorrection ? 'is-corrected' : ''} ${selectedClass}" data-index="${i}" role="button" tabindex="0" aria-pressed="${i === state.selectedIndex}">
                        <div class="sentence-header">
                            <span class="sentence-number">#${escapeHtml(s.sentenceIndex)}</span>
                            <span class="sentence-origin">${escapeHtml(s.origin)}</span>
                            <span class="sentence-header-right">
                                ${correctedFlag}
                                ${progressBadge}
                            </span>
                        </div>
                        ${englishHtml}
                        <p class="${originalClass}">${escapeHtml(s.sentence)}</p>
                        ${alertsHtml}
                        ${correctionPreview}
                        ${editForm}
                    </article>
                `;
            }).join('');

            bindSentenceHandlers();
        }

        function bindSentenceHandlers() {
            el.sentences.querySelectorAll('.js-edit-correction').forEach(btn => {
                btn.addEventListener('click', () => {
                    const i = Number(btn.getAttribute('data-index'));
                    const s = state.sentences[i];
                    if (!s) return;
                    s.editing = true;
                    s.error = '';
                    s.draftCorrected = s.correctedSentence || s.sentence;
                    s.draftComment = s.correctionComment || '';
                    renderSentences();
                });
            });

            el.sentences.querySelectorAll('.js-cancel-correction').forEach(btn => {
                btn.addEventListener('click', () => {
                    const form = btn.closest('.sentence-edit-form');
                    const i = Number(form.getAttribute('data-index'));
                    if (state.sentences[i]) {
                        state.sentences[i].editing = false;
                        state.sentences[i].error = '';
                    }
                    renderSentences();
                });
            });

            // Silent draft update (no re-render: keeps textarea focus). Toggles
            // "Guardar corrección" live: enabled only when the text is non-empty
            // and differs from the annotator's original.
            el.sentences.querySelectorAll('.js-corrected').forEach(area => {
                area.addEventListener('input', () => {
                    const form = area.closest('.sentence-edit-form');
                    const i = Number(form.getAttribute('data-index'));
                    const s = state.sentences[i];
                    if (!s) return;
                    s.draftCorrected = area.value;
                    const saveBtn = form.querySelector('.js-save-correction');
                    if (saveBtn) saveBtn.disabled = !isCorrectionChanged(area.value, s.sentence);
                });
            });

            el.sentences.querySelectorAll('.js-save-correction').forEach(btn => {
                btn.addEventListener('click', () => {
                    const form = btn.closest('.sentence-edit-form');
                    const i = Number(form.getAttribute('data-index'));
                    saveCorrection(i);
                });
            });

            // Click / Enter / Space anywhere on a card (but not on its inner
            // controls) selects that phrase for evaluation in the criteria panel.
            el.sentences.querySelectorAll('.reviewer-sentence-card').forEach(card => {
                const pick = () => {
                    const i = Number(card.getAttribute('data-index'));
                    if (Number.isInteger(i)) selectSentence(i);
                };
                card.addEventListener('click', (ev) => {
                    if (ev.target.closest('button, textarea, input, a, label')) return;
                    pick();
                });
                card.addEventListener('keydown', (ev) => {
                    if (ev.target !== card) return;
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        pick();
                    }
                });
            });
        }

        /**
         * Selects a phrase: the criteria panel then drives that phrase's wizard.
         * Each phrase keeps its own decision state, so switching never loses it.
         * @param {number} index - Index into `state.sentences`.
         * @returns {void}
         */
        function selectSentence(index) {
            if (index < 0 || index >= state.sentences.length) return;
            state.selectedIndex = index;
            renderSentences();
            renderCriteria();
        }

        // A criterion "No" opens the inline correction for the phrase being
        // evaluated, pre-filled with the original so the reviewer must change it.
        function openCorrection(index) {
            const s = state.sentences[index];
            // Don't disturb an already-open form or an already-corrected phrase.
            if (!s || state.finalized || s.editing || s.persistedCorrection) return;
            s.editing = true;
            s.error = '';
            s.draftCorrected = s.correctedSentence || s.sentence;
            renderSentences();
        }

        async function saveCorrection(index) {
            const s = state.sentences[index];
            if (!s || !state.review) return;

            const corrected = (s.draftCorrected || '').trim();
            if (!isCorrectionChanged(corrected, s.sentence)) {
                s.error = 'El texto corregido es obligatorio y debe diferir del original.';
                renderSentences();
                return;
            }

            setStatus(`Guardando corrección de la frase #${s.sentenceIndex}...`);
            const res = await actions.submitCorrection(state.review.id, {
                sentenceIndex: s.sentenceIndex,
                originalSentence: s.sentence,
                correctedSentence: corrected,
                comment: null   // justification lives in the criterion's "Motivo"
            });

            if (!res.ok) {
                s.error = messageFromResult(res);
                renderSentences();
                setStatus(`Error al guardar la corrección: ${messageFromResult(res)}`);
                return;
            }

            s.correctedSentence = corrected;
            s.correctionComment = '';
            s.persistedCorrection = true;
            s.editing = false;
            s.error = '';
            renderSentences();
            setStatus(`Corrección de la frase #${s.sentenceIndex} guardada.`);

            // Saving the last pending correction can unblock auto-finalize.
            if (!state.finalized && canFinalize(aggregateCriteria()) && !correctionsPending())
                autoFinalize();
        }

        // ----------------------------------------------------------------- //
        // Rendering — criteria wizard                                       //
        // ----------------------------------------------------------------- //

        /**
         * Criteria list for a scope: the selected phrase's, or the review-level one.
         * @param {string} scope - `'phrase'` or `'review'`.
         * @returns {Array} Criteria state array.
         */
        function criteriaListFor(scope) {
            if (scope === 'review') return state.reviewCriteria;
            const sentence = state.sentences[state.selectedIndex];
            return sentence ? sentence.criteria : [];
        }

        /**
         * A single criterion within a scope.
         * @param {string} scope - `'phrase'` or `'review'`.
         * @param {number} index - Position within that scope's list.
         * @returns {?object} Criterion state, or null.
         */
        function criterionFor(scope, index) {
            const list = criteriaListFor(scope);
            return list[index] || null;
        }

        /**
         * Every criterion across all phrases plus the review-level one. Used for
         * the overall progress badge and the finalize gate.
         * @returns {Array} Flattened criteria state.
         */
        // Diversidad (review-level) only makes sense across several phrases; with
        // a single phrase it is disabled and excluded from the finalize gate.
        function diversityApplies() {
            return state.sentences.length > 1;
        }

        function aggregateCriteria() {
            const fromPhrases = state.sentences.reduce((acc, s) => acc.concat(s.criteria || []), []);
            return diversityApplies() ? fromPhrases.concat(state.reviewCriteria || []) : fromPhrases;
        }

        // Whether a phrase's correction is mandatory (it has a committed "No").
        function correctionMandatory(s) {
            return (s.criteria || []).some(c => c.decided && c.decision === DECISION_REJECTED);
        }

        // Whether the review-level Diversidad has been rejected ("No").
        function diversityRejected() {
            return (state.reviewCriteria || []).some(c => c.decided && c.decision === DECISION_REJECTED);
        }

        // A phrase with a mandatory correction not yet saved keeps the review from
        // finalizing — this holds the top button on "Pendiente".
        function correctionsPending() {
            return state.sentences.some(s => correctionMandatory(s) && !s.persistedCorrection);
        }

        /**
         * HTML for one criterion card (locked / decided / active controls).
         * `scope` + `index` data-attributes route the handlers back to the right
         * list. "Sí" is committed on click (see the pick handler); only "No"
         * shows the motivo box plus a centered "Siguiente".
         * @param {object} c - Criterion state.
         * @param {number} i - Index within its scope.
         * @param {number} activeIdx - Active (unlocked) index within its scope.
         * @param {string} scope - `'phrase'` or `'review'`.
         * @param {boolean} [disabled] - Render a non-interactive "no aplica" card.
         * @returns {string} Section HTML.
         */
        function criterionSectionHtml(c, i, activeIdx, scope, disabled) {
            if (disabled) {
                return `<section class="reviewer-criterion is-disabled" data-scope="${scope}" data-index="${i}">
                    <div class="criterion-head">
                        <span class="criterion-index">${i + 1}.</span>
                        <span class="criterion-label">${escapeHtml(c.label)}</span>
                        <span class="criterion-state-chip state-chip-locked">no aplica</span>
                    </div>
                    <p class="criterion-description">Con una sola frase no hay diversidad que evaluar.</p>
                </section>`;
            }
            const isDecided = c.decided && !c.editing;
            const isControls = c.editing || (!c.decided && i === activeIdx);
            const isLocked = !c.decided && !c.editing && i !== activeIdx;

            let stateClass;
            let chip;
            if (isDecided) {
                stateClass = `is-decided decision-${c.decision}`;
                chip = `<span class="criterion-state-chip state-chip-${c.decision}">${escapeHtml(DECISION_LABELS[c.decision] || c.decision)}</span>`;
            } else if (isControls) {
                stateClass = 'is-active';
                chip = '<span class="criterion-state-chip state-chip-active">en curso</span>';
            } else {
                stateClass = 'is-locked';
                chip = '<span class="criterion-state-chip state-chip-locked">bloqueado</span>';
            }

            // "Editar" sits inline in the header, between the label and the
            // Sí/No chip; only on a decided criterion that isn't finalized.
            const editBtn = (isDecided && !state.finalized)
                ? `<button type="button" class="btn btn-sm btn-link p-0 js-edit-criterion" data-scope="${scope}" data-index="${i}">Editar</button>`
                : '';

            const head = `
                <div class="criterion-head">
                    <span class="criterion-index">${i + 1}.</span>
                    <span class="criterion-label">${escapeHtml(c.label)}</span>
                    ${editBtn}
                    ${chip}
                </div>`;

            if (isLocked) {
                return `<section class="reviewer-criterion ${stateClass}" data-scope="${scope}" data-index="${i}">${head}</section>`;
            }

            if (isDecided) {
                const commentHtml = c.comment
                    ? `<div class="criterion-summary"><span class="quoted">“${escapeHtml(c.comment)}”</span></div>`
                    : '';
                return `<section class="reviewer-criterion ${stateClass}" data-scope="${scope}" data-index="${i}">
                    ${head}
                    ${commentHtml}
                </section>`;
            }

            // Active controls. "Sí" commits immediately; "No" reveals the
            // mandatory motivo (280-char native cap) + a centered "Siguiente".
            const needsComment = requiresComment(c.draftDecision);
            const buttons = Object.keys(DECISION_LABELS).map(decision => {
                const selected = c.draftDecision === decision;
                const variant = decision === DECISION_ACCEPTED
                    ? (selected ? 'btn-success' : 'btn-outline-success')
                    : (selected ? 'btn-danger' : 'btn-outline-danger');
                return `<button type="button" class="btn btn-sm ${variant} js-pick-decision" data-scope="${scope}" data-index="${i}" data-decision="${decision}">${escapeHtml(DECISION_LABELS[decision])}</button>`;
            }).join('');

            const commentBox = needsComment
                ? `<textarea class="criterion-comment js-criterion-comment ${c.error ? 'is-invalid' : ''}" data-scope="${scope}" data-index="${i}" rows="2"
                       maxlength="${COMMENT_MAX_LENGTH}"
                       placeholder="Motivo">${escapeHtml(c.draftComment)}</textarea>`
                : '';

            const errorHtml = c.error ? `<p class="criterion-error">${escapeHtml(c.error)}</p>` : '';

            // "Siguiente" only exists for "No"; it stays disabled until a motivo
            // is filled. "Cancelar" only appears while re-editing a decided one.
            const siguienteDisabled = needsComment && !(c.draftComment || '').trim();
            const siguienteBtn = needsComment
                ? `<button type="button" class="btn btn-sm btn-primary js-save-decision" data-scope="${scope}" data-index="${i}" ${siguienteDisabled ? 'disabled' : ''}>Siguiente</button>`
                : '';
            // No "Cancelar" while re-editing: pressing "Sí" (or "No" + "Siguiente")
            // re-commits the decision and closes the editor.
            const actionsRow = siguienteBtn
                ? `<div class="criterion-actions">${siguienteBtn}</div>`
                : '';

            return `<section class="reviewer-criterion ${stateClass}" data-scope="${scope}" data-index="${i}">
                ${head}
                <p class="criterion-description">${escapeHtml(c.description)}</p>
                <div class="criterion-buttons">${buttons}</div>
                ${commentBox}
                ${errorHtml}
                ${actionsRow}
            </section>`;
        }

        function renderCriteria() {
            if (!el.criteria) return;

            // Header badge: overall progress across every phrase + the review-level one.
            const all = aggregateCriteria();
            if (el.criteriaProgress)
                el.criteriaProgress.textContent = `${all.filter(c => c.decided).length} / ${all.length}`;

            const sentence = state.sentences[state.selectedIndex] || null;
            if (!sentence) {
                el.criteria.innerHTML = state.sentences.length
                    ? '<p class="text-muted mb-0">Selecciona una frase para evaluar sus criterios.</p>'
                    : '<p class="text-muted mb-0">No hay frases que evaluar.</p>';
                return;
            }

            const phraseActive = activeCriterionIndex(sentence.criteria);
            const phraseHtml = sentence.criteria
                .map((c, i) => criterionSectionHtml(c, i, phraseActive, 'phrase'))
                .join('');

            const reviewActive = activeCriterionIndex(state.reviewCriteria);
            const reviewOff = !diversityApplies();
            const reviewHtml = state.reviewCriteria
                .map((c, i) => criterionSectionHtml(c, i, reviewActive, 'review', reviewOff))
                .join('');

            const phraseDecided = sentence.criteria.filter(c => c.decided).length;

            el.criteria.innerHTML = `
                <div class="criteria-phrase-header">
                    <span class="criteria-phrase-title">Evaluando · Frase #${escapeHtml(sentence.sentenceIndex)}</span>
                    <span class="criteria-phrase-progress">${phraseDecided}/${sentence.criteria.length}</span>
                </div>
                <div class="criteria-group">${phraseHtml}</div>
                <div class="criteria-divider">Criterio global de la entry</div>
                <div class="criteria-group">${reviewHtml}</div>
            `;

            bindCriteriaHandlers();
        }

        function bindCriteriaHandlers() {
            el.criteria.querySelectorAll('.js-pick-decision').forEach(btn => {
                btn.addEventListener('click', () => {
                    const scope = btn.getAttribute('data-scope');
                    const i = Number(btn.getAttribute('data-index'));
                    const decision = btn.getAttribute('data-decision');
                    const c = criterionFor(scope, i);
                    if (!c) return;
                    c.draftDecision = decision;
                    c.error = '';
                    if (decision === DECISION_ACCEPTED) {
                        // "Sí" = decide + advance in one action (no separate button).
                        c.draftComment = '';
                        saveDecision(scope, i);
                    } else {
                        renderCriteria();
                        // A phrase "No" requires correcting that phrase: open its form.
                        if (scope === 'phrase') openCorrection(state.selectedIndex);
                    }
                });
            });

            // Silent draft comment updates (no re-render): just toggle "Siguiente".
            el.criteria.querySelectorAll('.js-criterion-comment').forEach(area => {
                area.addEventListener('input', () => {
                    const scope = area.getAttribute('data-scope');
                    const i = Number(area.getAttribute('data-index'));
                    const c = criterionFor(scope, i);
                    if (!c) return;
                    c.draftComment = area.value;
                    const saveBtn = el.criteria.querySelector(`.js-save-decision[data-scope="${scope}"][data-index="${i}"]`);
                    if (saveBtn)
                        saveBtn.disabled = requiresComment(c.draftDecision) && !area.value.trim();
                });
            });

            el.criteria.querySelectorAll('.js-save-decision').forEach(btn => {
                btn.addEventListener('click', () =>
                    saveDecision(btn.getAttribute('data-scope'), Number(btn.getAttribute('data-index'))));
            });

            el.criteria.querySelectorAll('.js-edit-criterion').forEach(btn => {
                btn.addEventListener('click', () => {
                    const scope = btn.getAttribute('data-scope');
                    const i = Number(btn.getAttribute('data-index'));
                    const c = criterionFor(scope, i);
                    if (!c) return;
                    c.editing = true;
                    c.error = '';
                    c.draftDecision = c.decision;
                    c.draftComment = c.comment;
                    renderCriteria();
                });
            });

        }

        async function saveDecision(scope, index) {
            const c = criterionFor(scope, index);
            if (!c || !state.review) return;

            if (!c.draftDecision) {
                c.error = 'Selecciona una decisión.';
                renderCriteria();
                return;
            }
            const needsComment = requiresComment(c.draftDecision);
            const comment = (c.draftComment || '').trim();
            if (needsComment && !comment) {
                c.error = 'Esta decisión exige un motivo.';
                renderCriteria();
                return;
            }

            const sentence = scope === 'review' ? null : state.sentences[state.selectedIndex];
            const sentenceIndex = sentence ? sentence.sentenceIndex : null;
            const scopeLabel = scope === 'review' ? 'la entry' : `la frase #${sentenceIndex}`;

            setStatus(`Registrando “${c.label}” en ${scopeLabel}...`);
            const res = await actions.submitDecision(state.review.id, {
                sentenceIndex,
                criterionCode: c.code,
                decision: c.draftDecision,
                comment: needsComment ? comment : null
            });

            if (!res.ok) {
                c.error = messageFromResult(res);
                renderCriteria();
                setStatus(`Error al registrar la decisión: ${messageFromResult(res)}`);
                return;
            }

            c.decision = c.draftDecision;
            c.comment = needsComment ? comment : '';
            c.decided = true;
            c.editing = false;
            c.error = '';
            renderCriteria();
            renderSentences();   // refresh the per-phrase progress badge
            setStatus(`“${c.label}” en ${scopeLabel}: ${DECISION_LABELS[c.decision]}.`);

            // Deciding the last criterion auto-finalizes the whole review.
            if (!state.finalized && canFinalize(aggregateCriteria()))
                autoFinalize();
        }

        // ----------------------------------------------------------------- //
        // Finalize / release                                                //
        // ----------------------------------------------------------------- //

        const NEXT_AFTER_FINALIZE_MS = 2000;

        // Auto-finalize once every criterion is decided (no manual button).
        async function autoFinalize() {
            const all = aggregateCriteria();
            if (!state.review || state.finalized || !canFinalize(all) || correctionsPending()) return;

            setStatus('Finalizando revisión...');
            const res = await actions.finalizeReview(state.review.id);
            if (!res.ok) {
                setStatus(`Error al finalizar: ${messageFromResult(res)}`);
                return;
            }
            state.finalized = true;
            const status = (res.data && res.data.status) || predictedOutcome(all);
            state.review.status = status;
            stopExpiryTimer();
            renderCriteria();    // re-render: decided criteria lose their "Editar" affordance
            renderSentences();

            // "Finalizado" (green, blocked); after a short pause it becomes the
            // enabled blue "Siguiente" to request the next review.
            setNextButton('finalizado');
            if (state.nextTimer) clearTimeout(state.nextTimer);
            state.nextTimer = setTimeout(() => setNextButton('siguiente'), NEXT_AFTER_FINALIZE_MS);

            setStatus(`Revisión #${state.review.id} finalizada: ${status}.`);
        }

        function resetWorkspace() {
            stopExpiryTimer();
            if (state.nextTimer) { clearTimeout(state.nextTimer); state.nextTimer = null; }
            state.review = null;
            state.phraseCriteria = [];
            state.reviewCriteria = [];
            state.sentences = [];
            state.selectedIndex = null;
            state.context = { triples: [], englishSentences: [], alertDecisions: [] };
            state.finalized = false;
            if (el.annotator) el.annotator.textContent = '';
            if (el.entryTriples) el.entryTriples.innerHTML = '';
            if (el.entryPanel) el.entryPanel.classList.add('d-none');
            if (el.workspace) el.workspace.classList.add('d-none');
            if (el.empty) el.empty.classList.remove('d-none');
            setNextButton('siguiente');
        }

        // ----------------------------------------------------------------- //
        // Load a review into the workspace                                  //
        // ----------------------------------------------------------------- //

        async function loadContext(reviewId) {
            const res = await actions.fetchReviewContext(reviewId);
            if (!res.ok) {
                setStatus(`Error al cargar el contexto (${messageFromResult(res)}).`);
                return;
            }
            const data = res.data;
            state.review = data.review;
            state.phraseCriteria = data.phraseCriteria || [];
            state.sentences = buildSentenceState(data.annotations, data.reviewComments);

            // Split the flat decision list: per-phrase (sentenceIndex) vs review-level (null).
            const decisionsBySentence = new Map();
            const reviewLevelDecisions = [];
            (data.reviewDecisions || []).forEach(d => {
                if (d.sentenceIndex === null || d.sentenceIndex === undefined) {
                    reviewLevelDecisions.push(d);
                } else {
                    if (!decisionsBySentence.has(d.sentenceIndex)) decisionsBySentence.set(d.sentenceIndex, []);
                    decisionsBySentence.get(d.sentenceIndex).push(d);
                }
            });

            state.sentences.forEach(s => {
                s.criteria = buildCriteriaState(state.phraseCriteria, decisionsBySentence.get(s.sentenceIndex) || []);
            });
            state.reviewCriteria = buildCriteriaState(data.reviewCriteria || [], reviewLevelDecisions);
            state.selectedIndex = state.sentences.length ? 0 : null;

            state.context = {
                triples: data.triples || [],
                englishSentences: data.englishSentences || [],
                alertDecisions: data.alertDecisions || []
            };
            state.finalized = false;

            if (el.empty) el.empty.classList.add('d-none');
            if (el.entryPanel) el.entryPanel.classList.remove('d-none');
            if (el.workspace) el.workspace.classList.remove('d-none');

            renderContext();
            renderSentences();
            renderCriteria();
            startExpiryTimer();
            setNextButton('pendiente');
            setStatus(`Revisión #${state.review.id} cargada. Evalúa cada frase y el criterio global.`);
        }

        async function requestNext() {
            setStatus('Solicitando la siguiente revisión...');
            resetWorkspace();
            setNextButton('pendiente');   // disabled while fetching
            const res = await actions.fetchNextReview(state.datasetId);
            if (!res.ok) {
                setStatus(`Sin revisión disponible: ${messageFromResult(res)}`);
                setNextButton('siguiente');
                return;
            }
            await loadContext(res.data.id);
        }

        // ----------------------------------------------------------------- //
        // Wiring                                                            //
        // ----------------------------------------------------------------- //

        refreshScopeHint();

        if (el.requestBtn) el.requestBtn.addEventListener('click', requestNext);

        resetWorkspace();
        setStatus('Listo. Pulsa «Siguiente» para empezar.');
    }

    return {
        bootstrap,
        buildCriteriaState,
        activeCriterionIndex,
        canFinalize,
        predictedOutcome,
        buildSentenceState,
        requiresComment,
        readDatasetIdFromLocation,
        messageFromResult,
        escapeHtml
    };
});
