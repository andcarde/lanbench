'use strict';

/**
 * @file Repository for the `Review`, `ReviewDecision` and `ReviewComment`
 * tables.
 *
 * A `Review` represents the temporary assignment of an annotated entry to a
 * reviewer. Each criterion is evaluated with a `ReviewDecision`
 * (insert-or-update) and each per-sentence comment is persisted as a
 * `ReviewComment`.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 * @typedef {import('../types/typedefs').ReviewStatus}     ReviewStatus
 * @typedef {import('../types/typedefs').ReviewDecision}   ReviewDecisionValue
 * @typedef {import('../types/typedefs').ReviewCriterionCode} ReviewCriterionCode
 *
 * @typedef {Object} ReviewRow
 * @property {number} id
 * @property {number} entryId
 * @property {number} reviewerId
 * @property {number} annotatorId
 * @property {ReviewStatus} status
 * @property {number} currentCriterionIndex
 * @property {Date|null} completedAt
 * @property {Date} expiresAt
 *
 * @typedef {Object} ReviewDecisionRow
 * @property {number} reviewId
 * @property {ReviewCriterionCode} criterionCode
 * @property {ReviewDecisionValue} decision
 * @property {string|null} comment
 * @property {Date} decidedAt
 *
 * @typedef {Object} ReviewCommentRow
 * @property {number} reviewId
 * @property {number} sentenceIndex
 * @property {string} originalSentence
 * @property {string} correctedSentence
 * @property {string} comment
 */

const defaultPrisma = require('../prisma/client');
const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_EXPIRED,
    ACTIVE_REVIEW_STATUSES,
    TERMINAL_REVIEW_STATUSES
} = require('../constants/review-status');
const { ENTRY_ANNOTATED } = require('../constants/entry-status');

/**
 * Review states that block an entry from new assignments.
 * @type {ReviewStatus[]}
 */
const ENTRY_REVIEW_BLOCKING_STATUSES = [
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED
];

/**
 * Builds the reviews repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createReviewsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Returns the reviewer's active review, optionally scoped to a dataset,
     * or `null` if they have none.
     *
     * @param {{ reviewerId:number, datasetId?: number|null }} input
     * @returns {Promise<ReviewRow|null>}
     */
    async function findActiveReviewByReviewer({ reviewerId, datasetId = null }) {
        const entryFilter = datasetId
            ? { entry: { datasetId } }
            : {};

        return deps.prisma.review.findFirst({
            where: {
                reviewerId,
                status: { in: ACTIVE_REVIEW_STATUSES },
                ...entryFilter
            }
        });
    }

    /**
     * Retrieves a review by its id.
     *
     * @param {number} reviewId
     * @returns {Promise<ReviewRow|null>}
     */
    async function findReviewById(reviewId) {
        return deps.prisma.review.findUnique({
            where: { id: reviewId }
        });
    }

    /**
     * Lists entries in `annotated` state that are candidates to be reviewed by
     * `reviewerId`, excluding those the reviewer annotated themselves and
     * those that already have an in-progress/closed review.
     *
     * @param {{ reviewerId:number, datasetId?: number|null, limit?: number }} input
     * @returns {Promise<Array<Record<string, any>>>}
     */
    async function findReviewableEntries({ reviewerId, datasetId = null, limit = 1 }) {
        const datasetFilter = datasetId ? { datasetId } : {};

        return deps.prisma.entry.findMany({
            where: {
                ...datasetFilter,
                status: ENTRY_ANNOTATED,
                annotations: {
                    none: { userId: reviewerId }
                },
                reviews: {
                    none: {
                        status: { in: ENTRY_REVIEW_BLOCKING_STATUSES }
                    }
                }
            },
            orderBy: [{ datasetId: 'asc' }, { position: 'asc' }],
            take: limit,
            include: {
                annotations: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { userId: true }
                }
            }
        });
    }

    /**
     * Creates a review in `pending` state with `currentCriterionIndex = 0`.
     *
     * @param {{ entryId:number, reviewerId:number, annotatorId:number, expiresAt:Date }} input
     * @returns {Promise<ReviewRow>}
     */
    async function createReview({ entryId, reviewerId, annotatorId, expiresAt }) {
        return deps.prisma.review.create({
            data: {
                entryId,
                reviewerId,
                annotatorId,
                status: REVIEW_PENDING,
                currentCriterionIndex: 0,
                expiresAt
            }
        });
    }

    /**
     * Updates a review's `status`, optionally setting `completedAt`.
     *
     * @param {{ reviewId:number, status:ReviewStatus, completedAt?: Date|null }} input
     * @returns {Promise<ReviewRow>}
     */
    async function updateReviewStatus({ reviewId, status, completedAt = null }) {
        /** @type {Record<string, any>} */
        const data = { status };
        if (completedAt !== null && completedAt !== undefined)
            data.completedAt = completedAt;

        return deps.prisma.review.update({
            where: { id: reviewId },
            data
        });
    }

    /**
     * Advances `currentCriterionIndex` and, optionally, the `status`.
     *
     * @param {{ reviewId:number, currentCriterionIndex:number, status?: ReviewStatus }} input
     * @returns {Promise<ReviewRow>}
     */
    async function updateReviewProgress({ reviewId, currentCriterionIndex, status }) {
        /** @type {Record<string, any>} */
        const data = { currentCriterionIndex };
        if (status) data.status = status;

        return deps.prisma.review.update({
            where: { id: reviewId },
            data
        });
    }

    /**
     * Moves to `expired` all active reviews whose `expiresAt` is strictly
     * earlier than `cutoffDate`.
     *
     * @param {Date} cutoffDate
     * @returns {Promise<{ count:number }>}
     */
    async function expireStaleReviews(cutoffDate) {
        return deps.prisma.review.updateMany({
            where: {
                status: { in: ACTIVE_REVIEW_STATUSES },
                expiresAt: { lt: cutoffDate }
            },
            data: { status: REVIEW_EXPIRED }
        });
    }

    /**
     * Inserts or updates a `(reviewId, criterionCode)` decision, refreshing
     * `decidedAt` to the current instant when it already existed.
     *
     * @param {{ reviewId:number, criterionCode:ReviewCriterionCode, decision:ReviewDecisionValue, comment?:string|null }} input
     * @returns {Promise<ReviewDecisionRow>}
     */
    async function upsertDecision({ reviewId, criterionCode, decision, comment = null }) {
        return deps.prisma.reviewDecision.upsert({
            where: {
                reviewId_criterionCode: { reviewId, criterionCode }
            },
            update: {
                decision,
                comment,
                decidedAt: new Date()
            },
            create: {
                reviewId,
                criterionCode,
                decision,
                comment
            }
        });
    }

    /**
     * Lists all decisions of a review ordered by `decidedAt`.
     *
     * @param {{ reviewId:number }} input
     * @returns {Promise<ReviewDecisionRow[]>}
     */
    async function findDecisionsByReview({ reviewId }) {
        return deps.prisma.reviewDecision.findMany({
            where: { reviewId },
            orderBy: { decidedAt: 'asc' }
        });
    }

    /**
     * Persists a per-sentence comment associated with a review.
     *
     * @param {{ reviewId:number, sentenceIndex:number, originalSentence:string, correctedSentence:string, comment:string }} input
     * @returns {Promise<ReviewCommentRow>}
     */
    async function createComment({ reviewId, sentenceIndex, originalSentence, correctedSentence, comment }) {
        return deps.prisma.reviewComment.create({
            data: {
                reviewId,
                sentenceIndex,
                originalSentence,
                correctedSentence,
                comment
            }
        });
    }

    /**
     * Lists a review's comments ordered by `sentenceIndex`.
     *
     * @param {{ reviewId:number }} input
     * @returns {Promise<ReviewCommentRow[]>}
     */
    async function findCommentsByReview({ reviewId }) {
        return deps.prisma.reviewComment.findMany({
            where: { reviewId },
            orderBy: { sentenceIndex: 'asc' }
        });
    }

    /**
     * Lists the terminal reviews (`completed`/`disputed`) whose `annotatorId`
     * matches. Useful to show the annotator the feedback received.
     *
     * @param {{ annotatorId:number, datasetId?: number|null, limit?: number }} input
     * @returns {Promise<Array<Record<string, any>>>}
     */
    async function findCompletedReviewsForAnnotator({ annotatorId, datasetId = null, limit = 50 }) {
        const entryFilter = datasetId
            ? { entry: { datasetId } }
            : {};

        return deps.prisma.review.findMany({
            where: {
                annotatorId,
                status: { in: TERMINAL_REVIEW_STATUSES },
                ...entryFilter
            },
            orderBy: { completedAt: 'desc' },
            take: limit,
            include: {
                entry: { select: { id: true, datasetId: true, eid: true, position: true } },
                decisions: true,
                comments: { orderBy: { sentenceIndex: 'asc' } }
            }
        });
    }

    return {
        findActiveReviewByReviewer,
        findReviewById,
        findReviewableEntries,
        createReview,
        updateReviewStatus,
        updateReviewProgress,
        expireStaleReviews,
        upsertDecision,
        findDecisionsByReview,
        createComment,
        findCommentsByReview,
        findCompletedReviewsForAnnotator
    };
}

module.exports = {
    createReviewsRepository
};
