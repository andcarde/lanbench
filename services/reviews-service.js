'use strict';

/**
 * @file Reviews service — orchestration of a review's lifecycle.
 *
 * Covers:
 *   - Assignment of the next reviewable entry.
 *   - Advancing through criteria (`currentCriterionIndex`) with
 *     `upsertDecision`.
 *   - Closure (`completed`/`disputed`) propagating the state to the entry.
 *   - The list of feedback received by the annotator.
 *
 * @typedef {import('../types/typedefs').ReviewStatus}        ReviewStatus
 * @typedef {import('../types/typedefs').ReviewDecision}      ReviewDecisionValue
 * @typedef {import('../types/typedefs').ReviewCriterionCode} ReviewCriterionCode
 *
 * @typedef {Object} ReviewsServiceDeps
 * @property {Record<string, any>} [reviewsRepository]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [prismaClient]
 * @property {number}              [reviewDurationMs]
 */

const defaultPrisma = require('../prisma/client');
const { createReviewsRepository } = require('../repositories/reviews-repository');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
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
    getOrderedCriteria,
    getOrderedCriterionCodes,
    isValidCriterionCode,
    getCriterionIndex
} = require('../constants/review-criterion');
const {
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
    datasetsRepository,
    prismaClient,
    reviewDurationMs
} = {}) {
    const deps = {
        reviewsRepository: reviewsRepository || createReviewsRepository(),
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
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

        const decisions = await deps.reviewsRepository.findDecisionsByReview({ reviewId });
        const comments = await deps.reviewsRepository.findCommentsByReview({ reviewId });

        return buildReviewContextDTO({ review, entry: entryDetail, decisions, comments });
    }

    /**
     * Records the reviewer's decision for a criterion and advances the progress.
     * @param {*} options - { reviewId, reviewerId, criterionCode, decision, comment }.
     * @returns {Promise<*>} Updated review summary.
     */
    async function submitDecision({ reviewId, reviewerId, criterionCode, decision, comment }) {
        if (!isValidCriterionCode(criterionCode))
            throw new ServiceError('Codigo de criterio invalido.', {
                status: 400,
                code: 'invalid_criterion'
            });

        if (!isValidReviewDecision(decision))
            throw new ServiceError('Decision invalida.', {
                status: 400,
                code: 'invalid_decision'
            });

        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (decisionRequiresComment(decision) && trimmedComment.length === 0)
            throw new ServiceError('Esta decision requiere un comentario explicativo.', {
                status: 400,
                code: 'comment_required'
            });

        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        const requestedIndex = getCriterionIndex(criterionCode);
        if (requestedIndex > review.currentCriterionIndex)
            throw new ServiceError('Debe resolver primero los criterios anteriores.', {
                status: 409,
                code: 'criterion_locked'
            });

        await deps.reviewsRepository.upsertDecision({
            reviewId,
            criterionCode,
            decision,
            comment: trimmedComment.length > 0 ? trimmedComment : null
        });

        const totalCriteria = getOrderedCriterionCodes().length;
        let nextIndex = review.currentCriterionIndex;
        if (requestedIndex === review.currentCriterionIndex && nextIndex < totalCriteria)
            nextIndex = review.currentCriterionIndex + 1;

        const nextStatus = review.status === REVIEW_PENDING ? REVIEW_IN_PROGRESS : review.status;

        const updated = await deps.reviewsRepository.updateReviewProgress({
            reviewId,
            currentCriterionIndex: nextIndex,
            status: nextStatus
        });

        return buildReviewSummary(updated);
    }

    /**
     * Saves a text correction with a comment over an annotated sentence.
     * @param {*} options - { reviewId, reviewerId, sentenceIndex, originalSentence, correctedSentence, comment }.
     * @returns {Promise<Array<*>>} The review's comments after adding the correction.
     */
    async function submitTextCorrection({ reviewId, reviewerId, sentenceIndex, originalSentence, correctedSentence, comment }) {
        const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
        if (trimmedComment.length === 0)
            throw new ServiceError('La correccion exige un comentario.', {
                status: 400,
                code: 'comment_required'
            });

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
     * Closes a review, applying final states to the review, the entry and the annotations.
     * @param {*} options - { reviewId, reviewerId }.
     * @returns {Promise<*>} Updated summary of the closed review.
     */
    async function finalizeReview({ reviewId, reviewerId }) {
        const review = await loadOwnedReview({ reviewId, reviewerId });

        if (isReviewClosed(review.status))
            throw new ServiceError('La revision ya esta cerrada.', {
                status: 409,
                code: 'review_closed'
            });

        const decisions = await deps.reviewsRepository.findDecisionsByReview({ reviewId });
        const decided = new Set(decisions.map((/** @type {*} */ d) => d.criterionCode));
        const allCriteria = getOrderedCriterionCodes();
        const missing = allCriteria.filter((/** @type {*} */ code) => !decided.has(code));

        if (missing.length > 0)
            throw new ServiceError('Faltan criterios por evaluar.', {
                status: 409,
                code: 'criteria_incomplete'
            });

        const allAccepted = decisions.every((/** @type {*} */ d) => d.decision === REVIEW_DECISION_ACCEPTED);
        const finalReviewStatus = allAccepted ? REVIEW_COMPLETED : REVIEW_DISPUTED;
        const finalEntryStatus = allAccepted ? ENTRY_REVIEWED : ENTRY_DISPUTED;
        const completedAt = new Date();

        await deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            await tx.review.update({
                where: { id: reviewId },
                data: { status: finalReviewStatus, completedAt }
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
        });

        const updated = await deps.reviewsRepository.findReviewById(reviewId);
        return buildReviewSummary(updated);
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
        const permit = await deps.datasetsRepository.findPermitForUser({ datasetId, userId: reviewerId });
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
        reviewId: review.id,
        entryId: review.entryId,
        reviewerId: review.reviewerId,
        annotatorId: review.annotatorId,
        status: review.status,
        currentCriterionIndex: review.currentCriterionIndex,
        assignedAt: review.assignedAt instanceof Date ? review.assignedAt.toISOString() : review.assignedAt,
        expiresAt: review.expiresAt instanceof Date ? review.expiresAt.toISOString() : review.expiresAt,
        completedAt: review.completedAt instanceof Date ? review.completedAt.toISOString() : (review.completedAt || null)
    };
}

/**
 * Builds the review-context DTO with triples, sentences, decisions and comments.
 * @param {*} options - { review, entry, decisions, comments }.
 * @returns {*} DTO ready to serve to the client.
 */
function buildReviewContextDTO({ review, entry, decisions, comments }) {
    const triples = entry && Array.isArray(entry.triplesets)
        ? entry.triplesets.flatMap((/** @type {*} */ ts) => (ts.triples || []).map((/** @type {*} */ t) => ({
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
        review: buildReviewSummary(review),
        entry: entry
            ? { id: entry.id, datasetId: entry.datasetId, eid: entry.eid, position: entry.position, status: entry.status }
            : null,
        triples,
        englishSentences,
        annotations,
        alertDecisions,
        criteria: getOrderedCriteria(),
        reviewDecisions: (decisions || []).map((/** @type {*} */ d) => ({
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
