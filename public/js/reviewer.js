// @ts-nocheck
/**
 * @file Frontend de `public/reviewer.html` — pagina de revision.
 *
 * Pide la siguiente review (`POST /api/reviews/request`), renderiza la
 * entry con los criterios ordenados y persiste cada decision con
 * `POST /api/reviews/:id/decisions`. Al cerrar, envia `/finalize` o
 * `/release` segun el caso.
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
     * Construye criteria state a partir de los datos recibidos.
     * @param {*} criteria - Valor de criteria usado por la funcion.
     * @param {Array} decisions - Valor de decisions usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Ejecuta la logica de compute next active criterion.
     * @param {*} criteriaState - Valor de criteriaState usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function computeNextActiveCriterion(criteriaState) {
        if (!Array.isArray(criteriaState))
            return null;
        const next = criteriaState.find(c => !c.decided);
        return next || null;
    }

    /**
     * Ejecuta la logica de can finalize.
     * @param {*} criteriaState - Valor de criteriaState usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function canFinalize(criteriaState) {
        if (!Array.isArray(criteriaState) || criteriaState.length === 0)
            return false;
        return criteriaState.every(c => c.decided === true);
    }

    /**
     * Construye sentence review state con las anotaciones de la entry.
     * @param {Array} annotations - Frases anotadas por el anotador.
     * @param {Array} comments - Correcciones previas del revisor.
     * @returns {Array} Estado normalizado por frase.
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
     * Comprueba si todas las frases tienen una decision valida.
     * @param {Array} sentenceState - Estado por frase.
     * @returns {boolean} True cuando se puede mostrar Listo.
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
     * Indica si alguna frase ha sido rechazada.
     * @param {Array} sentenceState - Estado por frase.
     * @returns {boolean} True si existe rechazo.
     */
    function hasRejectedSentence(sentenceState) {
        return Array.isArray(sentenceState) && sentenceState.some(sentence => sentence.decision === DECISION_REJECTED);
    }

    /**
     * Construye comentario compacto para la decision global de revision.
     * @param {Array} sentenceState - Estado por frase.
     * @returns {string} Comentario para persistencia.
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
     * Ejecuta la logica de requires comment.
     * @param {*} decision - Valor de decision usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function requiresComment(decision) {
        return decision === DECISION_REJECTED || decision === DECISION_NEEDS_FIX;
    }

    /**
     * Lee datasetId de la URL si la pantalla viene desde una tarjeta de dataset.
     * @param {Location} locationLike - Location del navegador.
     * @returns {?number} Dataset normalizado.
     */
    function readDatasetIdFromLocation(locationLike) {
        const search = locationLike && typeof locationLike.search === 'string'
            ? locationLike.search
            : '';
        const datasetId = Number(new URLSearchParams(search).get('datasetId'));
        return Number.isInteger(datasetId) && datasetId > 0 ? datasetId : null;
    }

    /**
     * Comprueba is criterion unlocked y devuelve el resultado de la validacion.
     * @param {*} criteriaState - Valor de criteriaState usado por la funcion.
     * @param {string} code - Valor de code usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
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
     * Ejecuta de forma asincrona la logica de bootstrap.
     * @param {Array} actions - Valor de actions usado por la funcion.
     * @returns {Promise<*>} Resultado producido por la funcion.
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
         * Actualiza status con los datos indicados.
         * @param {string} text - Valor de text usado por la funcion.
         */
        function setStatus(text) {
            if (statusEl) statusEl.textContent = text || '';
        }

        /**
         * Renderiza context en la interfaz.
         * @param {*} dto - Valor de dto usado por la funcion.
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
         * Renderiza las frases anotadas para aceptarlas o rechazarlas.
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
         * Ejecuta la logica de refresh finalize button.
         * @returns {*} Resultado producido por la funcion.
         */
        function refreshFinalizeButton() {
            if (!finalizeBtn) return;
            const ready = canFinishSentenceReview(state.sentences);
            finalizeBtn.disabled = !ready;
            finalizeBtn.classList.toggle('d-none', !ready);
        }

        /**
         * Guarda alternativas, criterios globales y cierra la revision.
         * @returns {Promise<boolean>} True si se pudo finalizar.
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
         * Obtiene context desde la fuente correspondiente.
         * @param {number} reviewId - Valor de reviewId usado por la funcion.
         * @returns {Promise<*>} Resultado producido por la funcion.
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
