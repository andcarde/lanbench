// @ts-nocheck
/**
 * @file Reviewer FRONT-MOCK actions — the front-debug twin of
 * `public/js/actions/reviewer-actions.js`.
 *
 * `node scripts/front-debug.js` swaps this file into `public/js/actions/` so
 * the reviewer page runs disconnected from the backend. A stateful, in-memory
 * stand-in for `/api/reviews/*`: no network, no database. It exposes the exact
 * same `window.ReviewerActions` interface as the real twin so `reviewer.js` is
 * identical in both modes (project's front-mocks convention).
 *
 * It faithfully reproduces the contract that matters for the UI:
 *   - exclusive assignment with a 2-hour `expiresAt` window,
 *   - per-phrase sequential wizard guard (`criterion_locked`) + mandatory
 *     comment (`comment_required`) on `rejected` ("No"),
 *   - one review-level criterion (`diversity`) decided once for the entry,
 *   - correction validation (`invalid_correction`),
 *   - finalize gate (`criteria_incomplete`) -> `completed` | `disputed`,
 *   - a small seeded queue across two datasets.
 *
 * Everything resets on page reload — it is a prototype playground.
 */
'use strict';

(function (root, factory) {
    const api = factory();

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.ReviewerActions = api;
})(typeof self !== 'undefined' ? self : this, function () {
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const NETWORK_DELAY_MS = 120;

    /**
     * Per-phrase evaluation criteria (US-13, `EvaluationCriterion`). Each
     * annotated sentence is judged independently against these five.
     */
    const PHRASE_CRITERIA = [
        { code: 'naturalness', label: 'Naturalidad', description: '¿La frase suena natural para una persona hispanohablante?' },
        { code: 'fluency', label: 'Fluidez', description: '¿La redacción de la frase es fluida y gramaticalmente correcta?' },
        { code: 'adequacy', label: 'Adecuación', description: '¿El significado de la frase se corresponde con los triples y la referencia?' },
        { code: 'completeness', label: 'Completitud', description: '¿La frase expresa toda la información relevante que le corresponde?' },
        { code: 'coverage', label: 'Cobertura', description: '¿La frase cubre los triples que le atañen?' }
    ];

    /**
     * Review-level criteria: judged once for the whole entry (not per phrase).
     * `diversity` is inherently comparative across all the sentences.
     */
    const REVIEW_CRITERIA = [
        { code: 'diversity', label: 'Diversidad', description: '¿El conjunto de frases aporta variedad léxica? (criterio global de la entry)' }
    ];

    /**
     * Decisions that require a justifying comment.
     * @param {string} decision - Decision being evaluated.
     * @returns {boolean} True for `rejected` ("No").
     */
    function decisionRequiresComment(decision) {
        return decision === 'rejected';
    }

    /**
     * Seeded review queue. `windowMs` allows shortening the reservation of
     * #103 so the expiry warning can be observed without waiting two hours.
     */
    const reviews = [
        {
            id: 101,
            entryId: 4012,
            datasetId: 1,
            datasetName: 'WebNLG-es',
            annotatorEmail: 'ana.lopez@lanbench.dev',
            status: 'pending',
            assignedAt: null,
            expiresAt: null,
            windowMs: TWO_HOURS_MS,
            triples: [
                { subject: 'Aarhus_Airport', predicate: 'cityServed', object: 'Aarhus,_Denmark' },
                { subject: 'Aarhus_Airport', predicate: 'elevationAboveTheSeaLevel', object: '25.0' }
            ],
            englishSentences: [
                'Aarhus Airport serves the city of Aarhus, Denmark.',
                'The airport is 25 metres above sea level.'
            ],
            alertDecisions: [
                { sentenceIndex: 0, alertCode: 'NUMBER_AGREEMENT', alertType: 'grammatical', decision: 'dismissed', reason: 'La concordancia es correcta en este registro.' }
            ],
            annotations: [
                { sentenceIndex: 0, sentence: 'El aeropuerto de Aarhus presta servicio a la ciudad de Aarhus, Dinamarca.', origin: 'manual' },
                { sentenceIndex: 1, sentence: 'El aeropuerto se encuentra a 25 metros sobre el nivel del mar.', origin: 'manual' }
            ],
            decisions: [],
            comments: []
        },
        {
            id: 102,
            entryId: 4090,
            datasetId: 1,
            datasetName: 'WebNLG-es',
            annotatorEmail: 'bruno.diaz@lanbench.dev',
            status: 'pending',
            assignedAt: null,
            expiresAt: null,
            windowMs: TWO_HOURS_MS,
            triples: [
                { subject: 'Ayam_penyet', predicate: 'region', object: 'Singapore' },
                { subject: 'Ayam_penyet', predicate: 'country', object: 'Java' }
            ],
            englishSentences: [
                'Ayam penyet is a food found in Singapore and originates from Java.'
            ],
            alertDecisions: [],
            annotations: [
                { sentenceIndex: 0, sentence: 'El ayam penyet es un plato originario de Java que se encuentra en Singapur.', origin: 'manual' }
            ],
            decisions: [],
            comments: []
        },
        {
            id: 103,
            entryId: 7781,
            datasetId: 2,
            datasetName: 'Astronautas-es',
            annotatorEmail: 'carla.ruiz@lanbench.dev',
            status: 'pending',
            assignedAt: null,
            expiresAt: null,
            // Short reservation (6 min) to watch the badge go from OK to warning live.
            windowMs: 6 * 60 * 1000,
            triples: [
                { subject: 'Alan_Bean', predicate: 'occupation', object: 'Test_pilot' },
                { subject: 'Alan_Bean', predicate: 'mission', object: 'Apollo_12' },
                { subject: 'Apollo_12', predicate: 'operator', object: 'NASA' }
            ],
            englishSentences: [
                'Alan Bean was a test pilot and a crew member of Apollo 12, operated by NASA.'
            ],
            alertDecisions: [
                { sentenceIndex: 0, alertCode: 'NAMED_ENTITY', alertType: 'semantic', decision: 'applied', reason: null }
            ],
            annotations: [
                { sentenceIndex: 0, sentence: 'Alan Bean fue piloto de pruebas y tripulante de la misión Apolo 12, operada por la NASA.', origin: 'edited' }
            ],
            decisions: [],
            comments: []
        }
    ];

    /**
     * Resolves a value after a small delay to mimic network latency.
     * @param {*} value - Value to return.
     * @returns {Promise<*>} Promise resolved with the value.
     */
    function delay(value) {
        return new Promise(resolve => setTimeout(() => resolve(value), NETWORK_DELAY_MS));
    }

    /**
     * Shortcut for a successful response.
     * @param {*} data - Response body.
     * @param {number} status - Simulated HTTP status.
     * @returns {Promise<*>} Normalized result.
     */
    function ok(data, status = 200) {
        return delay({ ok: true, status, data });
    }

    /**
     * Shortcut for an error response with a domain code.
     * @param {number} status - Simulated HTTP status.
     * @param {string} code - Domain code (e.g.: `comment_required`).
     * @param {string} message - Human-readable message.
     * @returns {Promise<*>} Normalized result.
     */
    function fail(status, code, message) {
        return delay({ ok: false, status, data: { code, message } });
    }

    /**
     * Deep-clones a serializable value (isolates the store from the consumer).
     * @param {*} value - Value to clone.
     * @returns {*} Independent copy.
     */
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    /**
     * Locates a review by id.
     * @param {number} reviewId - Identifier.
     * @returns {?object} The review, or null.
     */
    function findReview(reviewId) {
        const id = Number(reviewId);
        return reviews.find(r => r.id === id) || null;
    }

    /**
     * Requests the next available review, respecting the scope.
     * @param {?number} datasetId - Dataset to scope by (null = global queue).
     * @returns {Promise<*>} Result with `{ id }` or `no_review_available` error.
     */
    function fetchNextReview(datasetId = null) {
        const scope = Number(datasetId);
        const scoped = Number.isInteger(scope) && scope > 0 ? scope : null;

        const candidate = reviews.find(r =>
            (r.status === 'pending' || r.status === 'released') &&
            (scoped === null || r.datasetId === scoped)
        );

        if (!candidate) {
            return fail(404, 'no_review_available',
                scoped ? `No hay revisiones disponibles en el dataset #${scoped}.` : 'No hay revisiones disponibles en la cola.');
        }

        candidate.status = 'in_progress';
        candidate.assignedAt = new Date().toISOString();
        candidate.expiresAt = new Date(Date.now() + candidate.windowMs).toISOString();
        return ok({ id: candidate.id });
    }

    /**
     * Returns the full context of a review.
     * @param {number} reviewId - Identifier.
     * @returns {Promise<*>} Context or `review_not_found` error.
     */
    function fetchReviewContext(reviewId) {
        const review = findReview(reviewId);
        if (!review)
            return fail(404, 'review_not_found', 'La revisión no existe.');

        return ok(clone({
            review: {
                id: review.id,
                status: review.status,
                annotatorEmail: review.annotatorEmail,
                datasetId: review.datasetId,
                datasetName: review.datasetName,
                assignedAt: review.assignedAt,
                expiresAt: review.expiresAt
            },
            phraseCriteria: PHRASE_CRITERIA,
            reviewCriteria: REVIEW_CRITERIA,
            reviewDecisions: review.decisions,
            annotations: review.annotations,
            reviewComments: review.comments,
            triples: review.triples,
            englishSentences: review.englishSentences,
            alertDecisions: review.alertDecisions
        }));
    }

    /**
     * Records (or re-decides) a criterion, applying the wizard rules.
     * Phrase criteria carry the `sentenceIndex` they belong to; the review-level
     * criterion (`diversity`) is sent with `sentenceIndex: null`.
     * @param {number} reviewId - Identifier.
     * @param {{sentenceIndex:?number,criterionCode:string,decision:string,comment:?string}} payload - Decision.
     * @returns {Promise<*>} Result or domain error.
     */
    function submitDecision(reviewId, payload) {
        const review = findReview(reviewId);
        if (!review)
            return fail(404, 'review_not_found', 'La revisión no existe.');

        const isReviewLevel = payload.sentenceIndex === null || payload.sentenceIndex === undefined;
        const sentenceIndex = isReviewLevel ? null : Number(payload.sentenceIndex);
        const catalog = isReviewLevel ? REVIEW_CRITERIA : PHRASE_CRITERIA;

        const index = catalog.findIndex(c => c.code === payload.criterionCode);
        if (index < 0)
            return fail(400, 'unknown_criterion', 'Criterio desconocido.');

        // Per-phrase wizard guard: earlier criteria of the SAME sentence first.
        if (!isReviewLevel && index > 0) {
            const decidedCodes = new Set(
                review.decisions.filter(d => d.sentenceIndex === sentenceIndex).map(d => d.criterionCode)
            );
            const priorAllDecided = catalog.slice(0, index).every(c => decidedCodes.has(c.code));
            if (!priorAllDecided)
                return fail(409, 'criterion_locked', 'Aún no puedes decidir este criterio: resuelve antes los anteriores de la frase.');
        }

        if (decisionRequiresComment(payload.decision) && !(payload.comment || '').trim())
            return fail(400, 'comment_required', 'Las decisiones “No” requieren un motivo.');

        const existing = review.decisions.find(d =>
            d.sentenceIndex === sentenceIndex && d.criterionCode === payload.criterionCode
        );
        if (existing) {
            existing.decision = payload.decision;
            existing.comment = payload.comment || null;
        } else {
            review.decisions.push({
                sentenceIndex,
                criterionCode: payload.criterionCode,
                decision: payload.decision,
                comment: payload.comment || null
            });
        }

        return ok({
            sentenceIndex,
            criterionCode: payload.criterionCode,
            decision: payload.decision
        });
    }

    /**
     * Persists the correction of a sentence.
     * @param {number} reviewId - Identifier.
     * @param {{sentenceIndex:number,originalSentence:string,correctedSentence:string,comment:string}} payload - Correction.
     * @returns {Promise<*>} Result or `invalid_correction` error.
     */
    function submitCorrection(reviewId, payload) {
        const review = findReview(reviewId);
        if (!review)
            return fail(404, 'review_not_found', 'La revisión no existe.');

        if (!(payload.correctedSentence || '').trim())
            return fail(400, 'invalid_correction', 'El texto corregido es obligatorio.');

        const existing = review.comments.find(c => c.sentenceIndex === payload.sentenceIndex);
        if (existing) {
            existing.originalSentence = payload.originalSentence;
            existing.correctedSentence = payload.correctedSentence;
            existing.comment = payload.comment;
        } else {
            review.comments.push({
                sentenceIndex: payload.sentenceIndex,
                originalSentence: payload.originalSentence,
                correctedSentence: payload.correctedSentence,
                comment: payload.comment
            });
        }

        return ok({ sentenceIndex: payload.sentenceIndex });
    }

    /**
     * Closes the review if every criterion has been decided.
     * @param {number} reviewId - Identifier.
     * @returns {Promise<*>} Result `{ id, status }` or `criteria_incomplete` error.
     */
    function finalizeReview(reviewId) {
        const review = findReview(reviewId);
        if (!review)
            return fail(404, 'review_not_found', 'La revisión no existe.');

        // Diversidad (review-level) only applies with more than one phrase.
        const diversityApplies = review.annotations.length > 1;
        const expected = review.annotations.length * PHRASE_CRITERIA.length
            + (diversityApplies ? REVIEW_CRITERIA.length : 0);
        if (review.decisions.length < expected)
            return fail(409, 'criteria_incomplete', 'Faltan criterios por decidir.');

        const allAccepted = review.decisions.every(d => d.decision === 'accepted');
        const status = allAccepted ? 'completed' : 'disputed';
        review.status = status;
        review.completedAt = new Date().toISOString();

        return ok({ id: review.id, status });
    }

    /**
     * Releases the review and returns it to the queue (keeps what was decided).
     * @param {number} reviewId - Identifier.
     * @returns {Promise<*>} Result `{ id }`.
     */
    function releaseReview(reviewId) {
        const review = findReview(reviewId);
        if (!review)
            return fail(404, 'review_not_found', 'La revisión no existe.');

        review.status = 'released';
        review.assignedAt = null;
        review.expiresAt = null;
        return ok({ id: review.id });
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
