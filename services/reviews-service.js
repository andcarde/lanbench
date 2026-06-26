'use strict';

/**
 * @file Reviews service — orchestration of a review's lifecycle.
 *
 * Covers:
 *   - Assignment of the next reviewable entry.
 *   - Per-phrase criteria evaluation (each annotated sentence keeps its own
 *     decision per criterion) plus the review-level `diversity` criterion,
 *     persisted with `upsertDecision`.
 *   - Closure (`completed`/`disputed`) propagating the state to the entry.
 *   - The list of feedback received by the annotator.
 *
 * @typedef {import('../types/typedefs').ReviewStatus}        ReviewStatus
 * @typedef {import('../types/typedefs').ReviewDecision}      ReviewDecisionValue
 * @typedef {import('../types/typedefs').ReviewCriterionCode} ReviewCriterionCode
 *
 * @typedef {Object} ReviewsServiceDeps
 * @property {Record<string, any>} [reviewsRepository]
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [prismaClient]
 * @property {number}              [reviewDurationMs]
 */

const defaultPrisma = require('../prisma/client');
const { createReviewsRepository } = require('../repositories/reviews-repository');
const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { ServiceError } = require('./service-error');
const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_RELEASED
} = require('../constants/review-status');
const {
    REVIEW_DECISION_ACCEPTED,
    isValidReviewDecision,
    decisionRequiresComment
} = require('../constants/review-decision');
const {
    getPhraseCriteria,
    getReviewCriteria,
    getPhraseCriterionCodes,
    getReviewCriterionCodes,
    isPhraseCriterion,
    isReviewCriterion,
    getPhraseCriterionIndex
} = require('../constants/review-criterion');
const {
    ENTRY_ANNOTATED,
    ENTRY_REVIEWED,
    ENTRY_DISPUTED
} = require('../constants/entry-status');

/** Default duration of a review (2 hours). */
const DEFAULT_REVIEW_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Builds the reviews service.
 *
 * @param {ReviewsServiceDeps} [dependencies]
 */
function createReviewsService({
    reviewsRepository,
    datasetsPermissionsRepository,
    prismaClient,
    reviewDurationMs
} = {}) {
    const deps = {
        reviewsRepository: reviewsRepository || createReviewsRepository(),
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        prisma: prismaClient || defaultPrisma,
        reviewDurationMs: reviewDurationMs ?? DEFAULT_REVIEW_DURATION_MS
    };

    /**
     * Reserves an entry pending review for the reviewer, or returns the active one.
     * @param {*} options - { reviewerId, datasetId? }.
     * @returns {Promise<*>} Summary of the active or newly created review.
     */
    async function requestNextReview({ reviewerId, datasetId = null }) {
        const reviewDatasetId = normalizeOptionalDatasetId(datasetId);
        if (reviewDatasetId)
            await requireDatasetReviewerPermission({ reviewerId, datasetId: reviewDatasetId });

        await deps.reviewsRepository.expireStaleReviews(new Date());

        const existing = await deps.reviewsRepository.findActiveReviewByReviewer({
            reviewerId,
            datasetId: reviewDatasetId
        });
        if (existing)
            return buildReviewSummary(existing);

        const candidates = await deps.reviewsRepository.findReviewableEntries({
            reviewerId,
            datasetId: reviewDatasetId,
            limit: 1
        });
        if (!candidates || candidates.length === 0)
            throw new ServiceError('No hay entries pendientes de revision.', {
                status: 404,
                code: 'no_review_available'
            });

        const entry = candidates[0];
        const annotatorId = entry.annotations && entry.annotations.length > 0
            ? entry.annotations[0].userId
            : null;

        if (!annotatorId)
            throw new ServiceError('La entry no tiene anotador identificable.', {
                status: 409,
                code: 'annotator_missing'
            });

        const expiresAt = new Date(Date.now() + deps.reviewDurationMs);
        const created = await deps.reviewsRepository.createReview({
            entryId: entry.id,
            reviewerId,
            annotatorId,
            expiresAt
        });

        return buildReviewSummary(created);
    }

    /**
     * Retrieves the full context of a review (entry, decisions, comments).
     * @param {*} options - { reviewId, reviewerId }.
     * @returns {Promise<*>} DTO with the review context.
     */
    async function getReviewContext({ reviewId, reviewerId }) {
        const review = await loadOwnedReview({ reviewId, reviewerId });

        const entryDetail = await deps.prisma.entry.findUnique({
            where: { id: review.entryId },
            include: {
                dataset: { select: { id: true, name: true } },
                triplesets: {
                    orderBy: [{ type: 'asc' }, { position: 'asc' }],
                    include: { triples: { orderBy: { position: 'asc' } } }
                },
                lexes: { orderBy: { position: 'asc' } },
                annotations: {
                    where: { userId: review.annotatorId },
                    orderBy: { sentenceIndex: 'asc' }
                },
                alertDecisions: {
                    where: { userId: review.annotatorId },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        const annotatorEmail = await resolveAnnotatorEmail(review.annotatorId);
        const decisions = await deps.reviewsRepository.findDecisionsByReview({ reviewId });
        const comments = await deps.reviewsRepository.findCommentsByReview({ reviewId });

        return buildReviewContextDTO({ review, entry: entryDetail, decisions, comments, annotatorEmail });
    }

    /**
     * Records the reviewer's decision for a criterion of a phrase, or for the
     * review-level criterion when `sentenceIndex` is `null`.
     *
     * Per-phrase wizard guard: a phrase criterion stays locked until every
     * earlier criterion of the SAME phrase has been decided. Re-deciding an
     * already-resolved criterion is allowed (the decision is overwritten).
     *
     * @param {*} options - { reviewId, reviewerId, sentenceIndex, criterionCode, decision, comment }.
     * @returns {Promise<*>} Updated review summary.
     */
    async function submitDecision({ reviewId, reviewerId, sentenceIndex = null, criterionCode, decision, comment }) {
        const isReviewLevel = sentenceIndex === null || sentenceIndex === undefined;
        const normalizedIndex = isReviewLevel ? null : Number(sentenceIndex);
        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

        assertValidDecisionInput({ isReviewLevel, normalizedIndex, criterionCode, decision, trimmedComment });

        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        if (!isReviewLevel)
            await assertPhraseWizardOrder({ reviewId, sentenceIndex: normalizedIndex, criterionCode });

        await deps.reviewsRepository.upsertDecision({
            reviewId,
            sentenceIndex: normalizedIndex,
            criterionCode,
            decision,
            comment: trimmedComment.length > 0 ? trimmedComment : null
        });

        const nextStatus = review.status === REVIEW_PENDING ? REVIEW_IN_PROGRESS : review.status;
        const updated = nextStatus !== review.status
            ? await deps.reviewsRepository.updateReviewStatus({ reviewId, status: nextStatus })
            : review;

        return buildReviewSummary(updated);
    }

    /**
     * Per-phrase wizard guard: a phrase criterion can only be decided once every
     * earlier criterion of the SAME phrase has been decided. No-op for the first
     * criterion of a phrase. Throws `criterion_locked` otherwise.
     * @param {*} options - { reviewId, sentenceIndex, criterionCode }.
     * @returns {Promise<void>}
     */
    async function assertPhraseWizardOrder({ reviewId, sentenceIndex, criterionCode }) {
        const requestedIndex = getPhraseCriterionIndex(criterionCode);
        if (requestedIndex <= 0)
            return;

        const decisions = await deps.reviewsRepository.findDecisionsByReview({ reviewId });
        const decidedForSentence = new Set(
            decisions
                .filter((/** @type {*} */ d) => d.sentenceIndex === sentenceIndex)
                .map((/** @type {*} */ d) => d.criterionCode)
        );
        const prior = getPhraseCriterionCodes().slice(0, requestedIndex);
        if (!prior.every(code => decidedForSentence.has(code)))
            throw new ServiceError('Debe resolver primero los criterios anteriores de la frase.', {
                status: 409,
                code: 'criterion_locked'
            });
    }

    /**
     * Saves a text correction with a comment over an annotated sentence.
     * @param {*} options - { reviewId, reviewerId, sentenceIndex, originalSentence, correctedSentence, comment }.
     * @returns {Promise<Array<*>>} The review's comments after adding the correction.
     */
    async function submitTextCorrection({ reviewId, reviewerId, sentenceIndex, originalSentence, correctedSentence, comment }) {
        // The justification for a correction lives in the rejected criterion's
        // "Motivo"; the correction itself does not require its own comment.
        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

        const trimmedCorrection = typeof correctedSentence === 'string' ? correctedSentence.trim() : '';
        if (trimmedCorrection.length === 0)
            throw new ServiceError('Texto corregido vacio.', {
                status: 400,
                code: 'invalid_correction'
            });

        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        await deps.reviewsRepository.createComment({
            reviewId,
            sentenceIndex: Number.isInteger(sentenceIndex) ? sentenceIndex : 0,
            originalSentence: typeof originalSentence === 'string' ? originalSentence : null,
            correctedSentence: trimmedCorrection,
            comment: trimmedComment
        });

        return deps.reviewsRepository.findCommentsByReview({ reviewId });
    }

    /**
     * Closes a review, applying final states to the review, the entry and the
     * annotations, and recording the time the reviewer spent on it.
     *
     * Branches on `Dataset.hasAdditionalReviews` (§4.6):
     *   - `false` → single-round path: entry → `reviewed`/`disputed`.
     *   - `true`  → consensus path: a clean round only closes the entry when
     *               the previous terminal round on the same entry was also
     *               clean (two consecutive clean rounds). Otherwise the entry
     *               returns to `annotated` and is re-queued. A non-clean round
     *               additionally mutates `Annotation.sentence` for the
     *               corrected sentences so the next reviewer sees the
     *               corrections.
     *
     * @param {*} options - { reviewId, reviewerId, timeSpentSeconds }.
     * @returns {Promise<*>} Updated summary of the closed review.
     */
    async function finalizeReview({ reviewId, reviewerId, timeSpentSeconds = 0 }) {
        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        const decisions = await deps.reviewsRepository.findDecisionsByReview({ reviewId });
        const sentenceIndexes = await deps.reviewsRepository.findAnnotatedSentenceIndexes({
            entryId: review.entryId,
            annotatorId: review.annotatorId
        });

        const missing = collectMissingDecisions({ decisions, sentenceIndexes });
        if (missing.length > 0)
            throw new ServiceError('Faltan criterios por evaluar.', {
                status: 409,
                code: 'criteria_incomplete'
            });

        const comments = await deps.reviewsRepository.findCommentsByReview({ reviewId });
        const allAccepted = decisions.length > 0
            && decisions.every((/** @type {*} */ d) => d.decision === REVIEW_DECISION_ACCEPTED);
        // A round is "clean" when the reviewer accepted everything AND did not
        // submit any text correction. The latter is the actual change vector
        // for multi-round chains, so a comment-less all-accepted close is what
        // we count as agreement with the previous round.
        const isCleanRound = allAccepted && comments.length === 0;

        const hasAdditional = await resolveDatasetHasAdditionalReviews(review.entryId);

        let finalReviewStatus;
        let finalEntryStatus;
        if (!hasAdditional) {
            finalReviewStatus = allAccepted ? REVIEW_COMPLETED : REVIEW_DISPUTED;
            finalEntryStatus = allAccepted ? ENTRY_REVIEWED : ENTRY_DISPUTED;
        } else {
            const previous = await deps.reviewsRepository.findPreviousTerminalReview({
                entryId: review.entryId,
                beforeRoundIndex: review.roundIndex
            });

            if (isCleanRound) {
                // A clean round closes successfully on its own; whether the
                // chain terminates depends on whether the previous round was
                // also clean.
                finalReviewStatus = REVIEW_COMPLETED;
                finalEntryStatus = previous && previous.cleanRound === true
                    ? ENTRY_REVIEWED
                    : ENTRY_ANNOTATED;
            } else {
                // Non-clean round always re-queues the entry; status reflects
                // the disagreement (mirrors the single-round disputed path).
                finalReviewStatus = REVIEW_DISPUTED;
                finalEntryStatus = ENTRY_ANNOTATED;
            }
        }

        const completedAt = new Date();
        // Trust the client's elapsed time but clamp it to the reservation window
        // so a spoofed or buggy value cannot poison the average-time metrics.
        const recordedSeconds = clampSeconds(timeSpentSeconds, Math.floor(deps.reviewDurationMs / 1000));

        await deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            await tx.review.update({
                where: { id: reviewId },
                data: {
                    status: finalReviewStatus,
                    cleanRound: isCleanRound,
                    completedAt,
                    timeSpentSeconds: recordedSeconds
                }
            });
            await tx.entry.update({
                where: { id: review.entryId },
                data: { status: finalEntryStatus }
            });
            if (!allAccepted && tx.annotation && typeof tx.annotation.updateMany === 'function') {
                await tx.annotation.updateMany({
                    where: {
                        entryId: review.entryId,
                        userId: review.annotatorId
                    },
                    data: { isAcceptedFirstTry: false }
                });
            }
            // §4.6.3: apply this round's corrections to the canonical
            // `Annotation.sentence` so the next reviewer sees the corrected
            // text. The pre-correction text remains preserved in
            // `ReviewComment.originalSentence` for chain reconstruction.
            if (hasAdditional && comments.length > 0
                && tx.annotation && typeof tx.annotation.updateMany === 'function')
                for (const comment of comments)
                    await tx.annotation.updateMany({
                        where: {
                            entryId: review.entryId,
                            userId: review.annotatorId,
                            sentenceIndex: comment.sentenceIndex
                        },
                        data: { sentence: comment.correctedSentence }
                    });
        });

        const updated = await deps.reviewsRepository.findReviewById(reviewId);
        return buildReviewSummary(updated);
    }

    /**
     * Resolves whether the entry's dataset has the multi-round flag on. Uses
     * the Prisma client directly so the service does not need a new repo
     * dependency. Returns `false` when the relation cannot be reached (test
     * stubs, missing entry), preserving the single-round path as a safe
     * default.
     * @param {number} entryId - Entry id.
     * @returns {Promise<boolean>} `true` when the dataset opted in.
     */
    async function resolveDatasetHasAdditionalReviews(entryId) {
        const entryModel = deps.prisma && deps.prisma.entry;
        if (!entryModel || typeof entryModel.findUnique !== 'function')
            return false;
        const entry = await entryModel.findUnique({
            where: { id: entryId },
            select: { dataset: { select: { hasAdditionalReviews: true } } }
        });
        return Boolean(entry && entry.dataset && entry.dataset.hasAdditionalReviews);
    }

    /**
     * Releases an assigned review without closing it so it returns to the pending pool.
     * @param {*} options - { reviewId, reviewerId }.
     * @returns {Promise<void>}
     */
    async function releaseReview({ reviewId, reviewerId }) {
        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        await deps.reviewsRepository.updateReviewStatus({
            reviewId,
            status: REVIEW_RELEASED
        });
    }

    /**
     * Retrieves the completed feedback addressed to a specific annotator.
     * @param {*} options - { annotatorId, datasetId?, limit? }.
     * @returns {Promise<Array<*>>} Already-mapped feedback entries.
     */
    async function getFeedbackForAnnotator({ annotatorId, datasetId = null, limit = 50 }) {
        const reviews = await deps.reviewsRepository.findCompletedReviewsForAnnotator({
            annotatorId,
            datasetId,
            limit
        });

        return reviews.map(buildFeedbackEntry);
    }

    /**
     * Resolves the annotator's email for display in the review context. Returns
     * `null` when the user model is not reachable (e.g. injected stubs).
     * @param {number} annotatorId - Annotator identifier.
     * @returns {Promise<?string>} Email, or null.
     */
    async function resolveAnnotatorEmail(annotatorId) {
        const userModel = deps.prisma && deps.prisma.user;
        if (!userModel || typeof userModel.findUnique !== 'function')
            return null;
        const annotator = await userModel.findUnique({
            where: { id: annotatorId },
            select: { email: true }
        });
        return annotator ? annotator.email : null;
    }

    /**
     * Loads a review, requiring that it belongs to the given reviewer.
     * @param {*} options - { reviewId, reviewerId }.
     * @returns {Promise<*>} Review row.
     */
    async function loadOwnedReview({ reviewId, reviewerId }) {
        const review = await deps.reviewsRepository.findReviewById(reviewId);
        if (!review || review.reviewerId !== reviewerId)
            throw new ServiceError('Revision no asignada al usuario.', {
                status: 403,
                code: 'review_not_assigned'
            });
        return review;
    }

    /**
     * Requires that the user be a reviewer of the requested dataset.
     * @param {*} options - Identifiers.
     */
    async function requireDatasetReviewerPermission({ reviewerId, datasetId }) {
        const permit = await deps.datasetsPermissionsRepository.findPermitForUser({ datasetId, userId: reviewerId });
        if (!permit?.isReviewer) {
            throw new ServiceError('No tienes permisos de revision sobre este dataset.', {
                status: 403,
                code: 'dataset_reviewer_required'
            });
        }
    }

    return {
        requestNextReview,
        getReviewContext,
        submitDecision,
        submitTextCorrection,
        finalizeReview,
        releaseReview,
        getFeedbackForAnnotator
    };
}

/**
 * Normalizes the optional dataset used to scope a review.
 * @param {*} value - Received value.
 * @returns {?number} Valid dataset, or null.
 */
function normalizeOptionalDatasetId(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Indicates whether the received status corresponds to an already-closed review.
 * @param {*} status - Current review status.
 * @returns {boolean} True if it is closed or released.
 */
function isReviewClosed(status) {
    return status === REVIEW_COMPLETED
        || status === REVIEW_DISPUTED
        || status === REVIEW_RELEASED;
}

/**
 * Builds the lightweight summary used by the API responses.
 * @param {*} review - Review row, or null.
 * @returns {?*} Serializable summary, or null.
 */
function buildReviewSummary(review) {
    if (!review)
        return null;

    return {
        id: review.id,
        reviewId: review.id,
        entryId: review.entryId,
        reviewerId: review.reviewerId,
        annotatorId: review.annotatorId,
        status: review.status,
        assignedAt: review.assignedAt instanceof Date ? review.assignedAt.toISOString() : review.assignedAt,
        expiresAt: review.expiresAt instanceof Date ? review.expiresAt.toISOString() : review.expiresAt,
        completedAt: review.completedAt instanceof Date ? review.completedAt.toISOString() : (review.completedAt || null)
    };
}

/**
 * Clamps a client-supplied elapsed time to a non-negative integer no larger
 * than `maxSeconds`. Guards the average-time metrics against bad input.
 * @param {*} value - Raw seconds from the client.
 * @param {number} maxSeconds - Upper bound (the reservation window).
 * @returns {number} Sanitized seconds.
 */
function clampSeconds(value, maxSeconds) {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n <= 0)
        return 0;
    return Math.min(n, maxSeconds);
}

/**
 * Validates the shape of a decision before it touches the store. Throws a
 * `ServiceError` with the matching domain code on the first violation.
 * @param {*} options - { isReviewLevel, normalizedIndex, criterionCode, decision, trimmedComment }.
 * @returns {void}
 */
function assertValidDecisionInput({ isReviewLevel, normalizedIndex, criterionCode, decision, trimmedComment }) {
    if (!isReviewLevel && (!Number.isInteger(normalizedIndex) || normalizedIndex < 0))
        throw new ServiceError('Indice de frase invalido.', {
            status: 400,
            code: 'invalid_sentence_index'
        });

    const criterionMatchesScope = isReviewLevel
        ? isReviewCriterion(criterionCode)
        : isPhraseCriterion(criterionCode);
    if (!criterionMatchesScope)
        throw new ServiceError('Codigo de criterio invalido para el ambito indicado.', {
            status: 400,
            code: 'invalid_criterion'
        });

    if (!isValidReviewDecision(decision))
        throw new ServiceError('Decision invalida.', {
            status: 400,
            code: 'invalid_decision'
        });

    if (decisionRequiresComment(decision) && trimmedComment.length === 0)
        throw new ServiceError('Esta decision requiere un comentario explicativo.', {
            status: 400,
            code: 'comment_required'
        });
}

/**
 * Stable key for a decision within a review: the phrase index (or `R` for the
 * review-level scope) combined with the criterion code.
 * @param {?number} sentenceIndex - Phrase index, or null for review-level.
 * @param {string} criterionCode - Criterion code.
 * @returns {string} Composite key.
 */
function decisionKey(sentenceIndex, criterionCode) {
    const scope = sentenceIndex === null || sentenceIndex === undefined ? 'R' : sentenceIndex;
    return `${scope}|${criterionCode}`;
}

/**
 * Computes the criteria still missing for a review to be finalizable: every
 * phrase must have all per-phrase criteria decided, and — only when there is
 * more than one phrase — the review-level criteria must be decided too.
 * @param {*} options - { decisions, sentenceIndexes }.
 * @returns {Array<{sentenceIndex:?number, criterionCode:string}>} Missing pairs.
 */
function collectMissingDecisions({ decisions, sentenceIndexes }) {
    const decided = new Set((decisions || []).map((/** @type {*} */ d) => decisionKey(d.sentenceIndex, d.criterionCode)));
    const phraseCodes = getPhraseCriterionCodes();
    const reviewCodes = getReviewCriterionCodes();
    const indexes = Array.isArray(sentenceIndexes) ? sentenceIndexes : [];

    /** @type {Array<{sentenceIndex:?number, criterionCode:string}>} */
    const missing = [];
    for (const sentenceIndex of indexes)
        for (const criterionCode of phraseCodes)
            if (!decided.has(decisionKey(sentenceIndex, criterionCode)))
                missing.push({ sentenceIndex, criterionCode });

    if (indexes.length > 1)
        for (const criterionCode of reviewCodes)
            if (!decided.has(decisionKey(null, criterionCode)))
                missing.push({ sentenceIndex: null, criterionCode });

    return missing;
}

/**
 * Builds the review-context DTO consumed by the reviewer UI.
 *
 * Shape (see `prototypes/reviewer-update` and TECHNICAL-DESIGN.md §4.2):
 *   - `review`: lightweight header (id, status, annotator email, dataset, dates).
 *   - `phraseCriteria` / `reviewCriteria`: the two criteria catalogues.
 *   - `reviewDecisions`: flat list where `sentenceIndex === null` marks a
 *     review-level decision and a number marks a per-phrase one.
 *   - `annotations`, `reviewComments`, `triples`, `englishSentences`,
 *     `alertDecisions`: the entry context the reviewer needs.
 *
 * @param {*} options - { review, entry, decisions, comments, annotatorEmail }.
 * @returns {*} DTO ready to serve to the client.
 */
function buildReviewContextDTO({ review, entry, decisions, comments, annotatorEmail = null }) {
    const triples = entry && Array.isArray(entry.triplesets)
        ? entry.triplesets
            .filter((/** @type {*} */ ts) => ts && ts.type === 'modified')
            .flatMap((/** @type {*} */ ts) => (ts.triples || []).map((/** @type {*} */ t) => ({
            subject: t.subject,
            predicate: t.predicate,
            object: t.object,
            triplesetType: ts.type
        })))
        : [];

    const englishSentences = entry && Array.isArray(entry.lexes)
        ? entry.lexes.filter((/** @type {*} */ l) => (l.lang || '').toLowerCase().startsWith('en')).map((/** @type {*} */ l) => l.text)
        : [];

    const annotations = entry && Array.isArray(entry.annotations)
        ? entry.annotations.map((/** @type {*} */ a) => ({
            sentenceIndex: a.sentenceIndex,
            sentence: a.sentence,
            origin: a.origin,
            rejectionReason: a.rejectionReason
        }))
        : [];

    const alertDecisions = entry && Array.isArray(entry.alertDecisions)
        ? entry.alertDecisions.map((/** @type {*} */ d) => ({
            sentenceIndex: d.sentenceIndex,
            alertCode: d.alertCode,
            alertType: d.alertType,
            decision: d.decision,
            reason: d.reason,
            suggestion: d.suggestion,
            appliedSentence: d.appliedSentence
        }))
        : [];

    return {
        review: {
            id: review.id,
            status: review.status,
            annotatorEmail: annotatorEmail || null,
            datasetId: entry ? entry.datasetId : null,
            datasetName: entry && entry.dataset ? entry.dataset.name : null,
            assignedAt: review.assignedAt instanceof Date ? review.assignedAt.toISOString() : (review.assignedAt || null),
            expiresAt: review.expiresAt instanceof Date ? review.expiresAt.toISOString() : (review.expiresAt || null)
        },
        entry: entry
            ? { id: entry.id, datasetId: entry.datasetId, eid: entry.eid, position: entry.position, status: entry.status }
            : null,
        phraseCriteria: getPhraseCriteria(),
        reviewCriteria: getReviewCriteria(),
        triples,
        englishSentences,
        annotations,
        alertDecisions,
        reviewDecisions: (decisions || []).map((/** @type {*} */ d) => ({
            sentenceIndex: d.sentenceIndex === undefined ? null : d.sentenceIndex,
            criterionCode: d.criterionCode,
            decision: d.decision,
            comment: d.comment,
            decidedAt: d.decidedAt instanceof Date ? d.decidedAt.toISOString() : d.decidedAt
        })),
        reviewComments: (comments || []).map((/** @type {*} */ c) => ({
            sentenceIndex: c.sentenceIndex,
            originalSentence: c.originalSentence,
            correctedSentence: c.correctedSentence,
            comment: c.comment,
            createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt
        }))
    };
}

/**
 * Builds an already-mapped feedback entry to show to the annotator.
 * @param {*} review - Completed review with decisions and comments.
 * @returns {*} Serializable feedback entry.
 */
function buildFeedbackEntry(review) {
    const decisions = Array.isArray(review.decisions) ? review.decisions : [];
    const failedCriteria = decisions
        .filter((/** @type {*} */ d) => d.decision !== REVIEW_DECISION_ACCEPTED)
        .map((/** @type {*} */ d) => ({ criterionCode: d.criterionCode, decision: d.decision, comment: d.comment }));

    const comments = Array.isArray(review.comments) ? review.comments : [];

    return {
        id: review.id,
        entryId: review.entryId,
        datasetId: review.entry ? review.entry.datasetId : null,
        eid: review.entry ? review.entry.eid : null,
        status: review.status,
        completedAt: review.completedAt instanceof Date
            ? review.completedAt.toISOString()
            : (review.completedAt || null),
        failedCriteria,
        corrections: comments.map((/** @type {*} */ c) => ({
            sentenceIndex: c.sentenceIndex,
            originalSentence: c.originalSentence,
            correctedSentence: c.correctedSentence,
            comment: c.comment
        }))
    };
}

module.exports = {
    createReviewsService,
    buildReviewContextDTO,
    buildFeedbackEntry
};
