// @ts-nocheck
/**
 * @file Frontend for `public/reviewer.html` — the review page.
 *
 * Requests the next review (`POST /api/reviews/request`), renders the entry
 * with the ordered criteria and persists each decision with
 * `POST /api/reviews/:id/decisions`. On close, it sends `/finalize` or
 * `/release` as appropriate.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.ReviewerUI = api;

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => api.bootstrap(window.ReviewerActions));
        else
            api.bootstrap(window.ReviewerActions);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    const DECISION_ACCEPTED = 'accepted';
    const DECISION_REJECTED = 'rejected';
    const DECISION_NEEDS_FIX = 'needs_fix';

    /**
     * Builds the criteria state from the received data.
     * @param {*} criteria - Ordered list of criteria.
     * @param {Array} decisions - Decisions already taken on the review.
     * @returns {*} Criteria state with each criterion's decision.
     */
    function buildCriteriaState(criteria, decisions) {
        const decisionMap = new Map((decisions || []).map(d => [d.criterionCode, d]));
        return (criteria || []).map(criterion => {
            const decision = decisionMap.get(criterion.code) || null;
            return {
                code: criterion.code,
                label: criterion.label,
                description: criterion.description,
                decided: Boolean(decision),
                decision: decision ? decision.decision : null,
                comment: decision ? (decision.comment || '') : ''
            };
        });
    }

    /**
     * Computes the next undecided criterion in the state.
     * @param {*} criteriaState - Current criteria state.
     * @returns {*} The next undecided criterion, or null.
     */
    function computeNextActiveCriterion(criteriaState) {
        if (!Array.isArray(criteriaState))
            return null;
        const next = criteriaState.find(c => !c.decided);
        return next || null;
    }

    /**
     * Indicates whether all criteria have been decided.
     * @param {*} criteriaState - Current criteria state.
     * @returns {boolean} True if every criterion is decided.
     */
    function canFinalize(criteriaState) {
        if (!Array.isArray(criteriaState) || criteriaState.length === 0)
            return false;
        return criteriaState.every(c => c.decided === true);
    }

    /**
     * Builds the sentence review state from the entry's annotations.
     * @param {Array} annotations - Sentences annotated by the annotator.
     * @param {Array} comments - The reviewer's previous corrections.
     * @returns {Array} Normalized per-sentence state.
     */
    function buildSentenceReviewState(annotations, comments) {
        const latestCommentBySentence = new Map();
        (comments || []).forEach(comment => {
            if (comment && Number.isInteger(comment.sentenceIndex))
                latestCommentBySentence.set(comment.sentenceIndex, comment);
        });

        return (annotations || []).map(annotation => {
            const sentenceIndex = Number.isInteger(annotation.sentenceIndex)
                ? annotation.sentenceIndex
                : 0;
            const previousCorrection = latestCommentBySentence.get(sentenceIndex) || null;
            const alternative = previousCorrection && previousCorrection.correctedSentence
                ? previousCorrection.correctedSentence
                : '';

            return {
                sentenceIndex,
                sentence: annotation.sentence || '',
                origin: annotation.origin || 'manual',
                decision: previousCorrection ? DECISION_REJECTED : null,
                alternative,
                persistedAlternative: alternative
            };
        });
    }

    /**
     * Checks whether all sentences have a valid decision.
     * @param {Array} sentenceState - Per-sentence state.
     * @returns {boolean} True when "Done" can be shown.
     */
    function canFinishSentenceReview(sentenceState) {
        if (!Array.isArray(sentenceState) || sentenceState.length === 0)
            return false;

        return sentenceState.every(sentence => {
            if (!sentence || sentence.decision === null)
                return false;
            if (sentence.decision === DECISION_ACCEPTED)
                return true;
            if (sentence.decision === DECISION_REJECTED)
                return typeof sentence.alternative === 'string' && sentence.alternative.trim().length > 0;
            return false;
        });
    }

    /**
     * Indicates whether any sentence has been rejected.
     * @param {Array} sentenceState - Per-sentence state.
     * @returns {boolean} True if there is a rejection.
     */
    function hasRejectedSentence(sentenceState) {
        return Array.isArray(sentenceState) && sentenceState.some(sentence => sentence.decision === DECISION_REJECTED);
    }

    /**
     * Builds a compact comment for the global review decision.
     * @param {Array} sentenceState - Per-sentence state.
     * @returns {string} Comment for persistence.
     */
    function buildRejectedSentencesComment(sentenceState) {
        const indexes = (sentenceState || [])
            .filter(sentence => sentence.decision === DECISION_REJECTED)
            .map(sentence => `#${sentence.sentenceIndex}`);
        return indexes.length > 0
            ? `Frases rechazadas: ${indexes.join(', ')}.`
            : '';
    }

    /**
     * Indicates whether a decision requires a comment.
     * @param {*} decision - Review decision.
     * @returns {boolean} True if a comment is required.
     */
    function requiresComment(decision) {
        return decision === DECISION_REJECTED || decision === DECISION_NEEDS_FIX;
    }

    /**
     * Reads datasetId from the URL if the screen came from a dataset card.
     * @param {Location} locationLike - Browser location.
     * @returns {?number} Normalized dataset id.
     */
    function readDatasetIdFromLocation(locationLike) {
        const search = locationLike && typeof locationLike.search === 'string'
            ? locationLike.search
            : '';
        const datasetId = Number(new URLSearchParams(search).get('datasetId'));
        return Number.isInteger(datasetId) && datasetId > 0 ? datasetId : null;
    }

    /**
     * Checks whether a criterion is unlocked (all previous ones decided).
     * @param {*} criteriaState - Current criteria state.
     * @param {string} code - Criterion code to check.
     * @returns {boolean} True if the criterion is unlocked.
     */
    function isCriterionUnlocked(criteriaState, code) {
        if (!Array.isArray(criteriaState))
            return false;
        const index = criteriaState.findIndex(c => c.code === code);
        if (index < 0)
            return false;
        if (index === 0)
            return true;
        return criteriaState.slice(0, index).every(c => c.decided);
    }

    /**
     * Bootstraps the reviewer UI: wires DOM elements and event handlers.
     * @param {Array} actions - Review action functions (AJAX layer).
     * @returns {Promise<*>}
     */
    async function bootstrap(actions) {
        if (typeof document === 'undefined' || !actions)
            return;

        const requestBtn = document.getElementById('btnRequestReview');
        const finalizeBtn = document.getElementById('btnFinalizeReview');
        const releaseBtn = document.getElementById('btnReleaseReview');
        const contextEl = document.getElementById('reviewContext');
        const sentencesEl = document.getElementById('reviewSentences');
        const statusEl = document.getElementById('reviewStatus');

        const state = {
            datasetId: readDatasetIdFromLocation(window.location),
            review: null,
            criteria: [],
            sentences: []
        };

        /**
         * Updates the status line text.
         * @param {string} text - Status text to display.
         */
        function setStatus(text) {
            if (statusEl) statusEl.textContent = text || '';
        }

        /**
         * Renders the review context (triples, English reference, alert decisions) in the UI.
         * @param {*} dto - Review context DTO.
         */
        function renderContext(dto) {
            if (!contextEl) return;
            const triplesHtml = (dto.triples || []).map(t =>
                `<li><code>${escapeHtml(t.subject)}</code> — <code>${escapeHtml(t.predicate)}</code> — <code>${escapeHtml(t.object)}</code></li>`
            ).join('');
            const englishHtml = (dto.englishSentences || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
            const alertsHtml = (dto.alertDecisions || []).map(d =>
                `<li>frase #${d.sentenceIndex} — <em>${escapeHtml(d.alertCode)}</em> [${escapeHtml(d.decision)}] ${d.reason ? escapeHtml(d.reason) : ''}</li>`
            ).join('');

            contextEl.innerHTML = `
                <h3>Triples</h3>
                <ul class="reviewer-triples">${triplesHtml || '<li>(sin triples)</li>'}</ul>
                <h3>Referencia inglesa</h3>
                <ul class="reviewer-english">${englishHtml || '<li>(sin referencia)</li>'}</ul>
                <h3>Decisiones del anotador frente a alertas</h3>
                <ul class="reviewer-alerts">${alertsHtml || '<li>(ninguna)</li>'}</ul>
            `;
        }

        /**
         * Renders the annotated sentences so they can be accepted or rejected.
         */
        function renderSentenceReviews() {
            if (!sentencesEl) return;

            if (state.sentences.length === 0) {
                sentencesEl.innerHTML = '<p class="text-muted">No hay frases completadas para revisar.</p>';
                return;
            }

            sentencesEl.innerHTML = state.sentences.map((sentence, i) => {
                const isAccepted = sentence.decision === DECISION_ACCEPTED;
                const isRejected = sentence.decision === DECISION_REJECTED;
                const reviewedClass = sentence.decision ? 'sentence-reviewed' : '';
                return `
                    <article class="reviewer-sentence-card ${reviewedClass}" data-index="${i}">
                        <div class="sentence-header">
                            <span class="sentence-number">#${escapeHtml(sentence.sentenceIndex)}</span>
                            <span class="sentence-origin">${escapeHtml(sentence.origin)}</span>
                        </div>
                        <p class="sentence-text">${escapeHtml(sentence.sentence)}</p>
                        <div class="sentence-actions" aria-label="Decision de frase">
                            <button type="button" class="btn btn-sm ${isAccepted ? 'btn-success' : 'btn-outline-success'}" data-decision="${DECISION_ACCEPTED}">Aceptar</button>
                            <button type="button" class="btn btn-sm ${isRejected ? 'btn-danger' : 'btn-outline-danger'}" data-decision="${DECISION_REJECTED}">Rechazar</button>
                        </div>
                        <label class="sentence-alternative ${isRejected ? '' : 'd-none'}">
                            Alternativa
                            <textarea class="form-control" rows="2" placeholder="Escribe una alternativa">${escapeHtml(sentence.alternative)}</textarea>
                        </label>
                    </article>
                `;
            }).join('');

            sentencesEl.querySelectorAll('button[data-decision]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const card = btn.closest('.reviewer-sentence-card');
                    const index = Number(card.getAttribute('data-index'));
                    const decision = btn.getAttribute('data-decision');
                    if (state.sentences[index])
                        state.sentences[index].decision = decision;
                    renderSentenceReviews();
                    refreshFinalizeButton();
                });
            });

            sentencesEl.querySelectorAll('textarea').forEach(textarea => {
                textarea.addEventListener('input', () => {
                    const card = textarea.closest('.reviewer-sentence-card');
                    const index = Number(card.getAttribute('data-index'));
                    if (state.sentences[index])
                        state.sentences[index].alternative = textarea.value;
                    refreshFinalizeButton();
                });
            });
        }

        /**
         * Refreshes the enabled/visible state of the finalize button.
         * @returns {void}
         */
        function refreshFinalizeButton() {
            if (!finalizeBtn) return;
            const ready = canFinishSentenceReview(state.sentences);
            finalizeBtn.disabled = !ready;
            finalizeBtn.classList.toggle('d-none', !ready);
        }

        /**
         * Saves alternatives and global criteria, then closes the review.
         * @returns {Promise<boolean>} True if it could be finalized.
         */
        async function submitSentenceReview() {
            const rejectedSentences = state.sentences.filter(sentence => sentence.decision === DECISION_REJECTED);
            for (const sentence of rejectedSentences) {
                const alternative = sentence.alternative.trim();
                if (alternative === sentence.persistedAlternative)
                    continue;

                const correctionRes = await actions.submitCorrection(state.review.id, {
                    sentenceIndex: sentence.sentenceIndex,
                    originalSentence: sentence.sentence,
                    correctedSentence: alternative,
                    comment: 'Alternativa propuesta por el revisor.'
                });
                if (!correctionRes.ok) {
                    setStatus(`Error al guardar alternativa #${sentence.sentenceIndex}: ${correctionRes.data && correctionRes.data.message ? correctionRes.data.message : correctionRes.status}`);
                    return false;
                }
                sentence.persistedAlternative = alternative;
            }

            const rejected = hasRejectedSentence(state.sentences);
            const rejectedComment = buildRejectedSentencesComment(state.sentences);
            for (let i = 0; i < state.criteria.length; i++) {
                const criterion = state.criteria[i];
                const decision = rejected && i === 0 ? DECISION_REJECTED : DECISION_ACCEPTED;
                const decisionRes = await actions.submitDecision(state.review.id, {
                    criterionCode: criterion.code,
                    decision,
                    comment: decision === DECISION_REJECTED ? rejectedComment : null
                });
                if (!decisionRes.ok) {
                    setStatus(`Error al registrar decision: ${decisionRes.data && decisionRes.data.message ? decisionRes.data.message : decisionRes.status}`);
                    return false;
                }
                criterion.decided = true;
                criterion.decision = decision;
                criterion.comment = decision === DECISION_REJECTED ? rejectedComment : '';
            }

            const finalizeRes = await actions.finalizeReview(state.review.id);
            if (!finalizeRes.ok) {
                setStatus(`Error al finalizar: ${finalizeRes.data && finalizeRes.data.message ? finalizeRes.data.message : finalizeRes.status}`);
                return false;
            }
            state.review = finalizeRes.data;
            setStatus(`Revision finalizada: ${finalizeRes.data.status}`);
            return true;
        }

        /**
         * Loads the review context for the given review id and renders it.
         * @param {number} reviewId - Review id to load.
         * @returns {Promise<*>}
         */
        async function loadContext(reviewId) {
            const res = await actions.fetchReviewContext(reviewId);
            if (!res.ok) {
                setStatus(`Error al cargar contexto (${res.status}).`);
                return;
            }
            state.review = res.data.review;
            state.criteria = buildCriteriaState(res.data.criteria, res.data.reviewDecisions);
            state.sentences = buildSentenceReviewState(res.data.annotations, res.data.reviewComments);
            renderContext(res.data);
            renderSentenceReviews();
            refreshFinalizeButton();
            setStatus(`Revision #${state.review.id} cargada.`);
        }

        if (state.datasetId)
            setStatus(`Revision acotada al dataset #${state.datasetId}.`);

        if (requestBtn) {
            requestBtn.addEventListener('click', async () => {
                setStatus('Solicitando siguiente revision...');
                const res = await actions.fetchNextReview(state.datasetId);
                if (!res.ok) {
                    setStatus(`Error: ${res.data && res.data.message ? res.data.message : res.status}`);
                    return;
                }
                await loadContext(res.data.id);
            });
        }

        if (finalizeBtn) {
            finalizeBtn.addEventListener('click', async () => {
                if (!state.review) return;
                if (!canFinishSentenceReview(state.sentences)) {
                    setStatus('Acepta o rechaza todas las frases y completa las alternativas pendientes.');
                    return;
                }
                finalizeBtn.disabled = true;
                setStatus('Guardando revision...');
                const done = await submitSentenceReview();
                if (!done)
                    refreshFinalizeButton();
            });
        }

        if (releaseBtn) {
            releaseBtn.addEventListener('click', async () => {
                if (!state.review) return;
                const res = await actions.releaseReview(state.review.id);
                if (!res.ok && res.status !== 204) {
                    setStatus(`Error al liberar: ${res.data && res.data.message ? res.data.message : res.status}`);
                    return;
                }
                setStatus('Revision liberada.');
                state.review = null;
                state.criteria = [];
                state.sentences = [];
                if (sentencesEl) sentencesEl.innerHTML = '<p class="text-muted">Sin revision activa.</p>';
                if (contextEl) contextEl.innerHTML = '';
                refreshFinalizeButton();
            });
        }
    }

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

    return {
        bootstrap,
        buildCriteriaState,
        computeNextActiveCriterion,
        canFinalize,
        buildSentenceReviewState,
        canFinishSentenceReview,
        hasRejectedSentence,
        buildRejectedSentencesComment,
        requiresComment,
        readDatasetIdFromLocation,
        isCriterionUnlocked,
        escapeHtml
    };
});
