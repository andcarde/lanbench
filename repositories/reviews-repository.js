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
 * @property {number|null} sentenceIndex
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
 * Review states that block an entry from a new assignment.
 *
 * Only **active** reviews (pending / in_progress) block: terminal reviews
 * (`completed`/`disputed`) no longer block on their own — whether a terminal
 * chain is reopened or not is decided by the entry's own `status` (see §4.6:
 * `status = 'annotated'` is the re-queueable state for multi-round chains;
 * once the chain terminates, `Entry.status` flips to `reviewed`/`disputed` and
 * `findReviewableEntries` excludes the entry by status).
 *
 * @type {ReviewStatus[]}
 */
const ENTRY_REVIEW_BLOCKING_STATUSES = [
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS
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

        const candidates = await deps.prisma.entry.findMany({
            where: {
                ...datasetFilter,
                status: ENTRY_ANNOTATED,
                // Only datasets whose admin enabled review surface candidates
                // (TECHNICAL-DESIGN §4.2: a Review is created when an annotated
                // entry of a review-enabled dataset enters the workflow).
                dataset: { isReviewEnabled: true },
                annotations: {
                    none: { userId: reviewerId }
                },
                // An entry with an *active* review is busy; once a review
                // terminates (completed/disputed) the entry is reopened by
                // `finalizeReview` only when the chain has not converged
                // (§4.6), so checking the active set is enough here.
                reviews: {
                    none: {
                        status: { in: ENTRY_REVIEW_BLOCKING_STATUSES }
                    }
                }
            },
            orderBy: [{ datasetId: 'asc' }, { position: 'asc' }],
            // Over-fetch because the anti-immediate-repeat filter (§4.6.4) is
            // applied after the query: we discard entries whose latest
            // terminal review was performed by the requesting reviewer.
            take: Math.max(limit * 3, limit),
            include: {
                annotations: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: { userId: true }
                },
                reviews: {
                    where: { status: { in: /** @type {ReviewStatus[]} */ ([REVIEW_COMPLETED, REVIEW_DISPUTED]) } },
                    orderBy: { roundIndex: 'desc' },
                    take: 1,
                    select: { reviewerId: true, roundIndex: true, cleanRound: true }
                }
            }
        });

        const filtered = (candidates || []).filter((/** @type {*} */ entry) => {
            const lastTerminal = entry.reviews && entry.reviews[0];
            // Anti-immediate-repeat: the previous round's reviewer cannot
            // validate their own work.
            return !lastTerminal || lastTerminal.reviewerId !== reviewerId;
        });

        return filtered.slice(0, limit);
    }

    /**
     * Creates a review in `pending` state with `currentCriterionIndex = 0`.
     *
     * Computes `roundIndex` as `max(roundIndex of prior reviews on the entry) + 1`
     * (0 if no prior review exists). This is the surrogate for §4.6's
     * "round number" — used by the histogram and by `findPreviousTerminalReview`
     * to look up the previous round during finalization.
     *
     * @param {{ entryId:number, reviewerId:number, annotatorId:number, expiresAt:Date }} input
     * @returns {Promise<ReviewRow>}
     */
    async function createReview({ entryId, reviewerId, annotatorId, expiresAt }) {
        const last = await deps.prisma.review.findFirst({
            where: { entryId },
            orderBy: { roundIndex: 'desc' },
            select: { roundIndex: true }
        });
        const nextRoundIndex = last && Number.isInteger(last.roundIndex)
            ? last.roundIndex + 1
            : 0;

        return deps.prisma.review.create({
            data: {
                entryId,
                reviewerId,
                annotatorId,
                status: REVIEW_PENDING,
                currentCriterionIndex: 0,
                roundIndex: nextRoundIndex,
                expiresAt
            }
        });
    }

    /**
     * Returns the previous terminal review of `entryId` strictly before
     * `beforeRoundIndex` (i.e. the latest round in `[0, beforeRoundIndex)`
     * whose status is `completed`/`disputed`). Used by `finalizeReview` to
     * implement the two-clean termination rule of §4.6.
     *
     * @param {{ entryId:number, beforeRoundIndex:number }} input
     * @returns {Promise<ReviewRow|null>}
     */
    async function findPreviousTerminalReview({ entryId, beforeRoundIndex }) {
        return deps.prisma.review.findFirst({
            where: {
                entryId,
                roundIndex: { lt: beforeRoundIndex },
                status: { in: /** @type {ReviewStatus[]} */ ([REVIEW_COMPLETED, REVIEW_DISPUTED]) }
            },
            orderBy: { roundIndex: 'desc' }
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
     * Inserts or updates the decision for a `(reviewId, sentenceIndex,
     * criterionCode)` triple, refreshing `decidedAt` when it already existed.
     *
     * `sentenceIndex` is the annotated sentence the decision belongs to, or
     * `null` for a review-level criterion (`diversity`). Because MariaDB treats
     * NULLs as distinct in a UNIQUE index, the uniqueness of a review-level
     * decision cannot rely on the `@@unique` constraint; this method therefore
     * resolves the existing row explicitly (find-then-write) instead of
     * Prisma's `upsert`.
     *
     * @param {{ reviewId:number, sentenceIndex?:number|null, criterionCode:ReviewCriterionCode, decision:ReviewDecisionValue, comment?:string|null }} input
     * @returns {Promise<ReviewDecisionRow>}
     */
    async function upsertDecision({ reviewId, sentenceIndex = null, criterionCode, decision, comment = null }) {
        const normalizedIndex = Number.isInteger(sentenceIndex) ? sentenceIndex : null;

        const existing = await deps.prisma.reviewDecision.findFirst({
            where: { reviewId, sentenceIndex: normalizedIndex, criterionCode }
        });

        if (existing) {
            return deps.prisma.reviewDecision.update({
                where: { id: existing.id },
                data: { decision, comment, decidedAt: new Date() }
            });
        }

        return deps.prisma.reviewDecision.create({
            data: {
                reviewId,
                sentenceIndex: normalizedIndex,
                criterionCode,
                decision,
                comment
            }
        });
    }

    /**
     * Lists all decisions of a review ordered by sentence and decision instant.
     *
     * @param {{ reviewId:number }} input
     * @returns {Promise<ReviewDecisionRow[]>}
     */
    async function findDecisionsByReview({ reviewId }) {
        return deps.prisma.reviewDecision.findMany({
            where: { reviewId },
            orderBy: [{ sentenceIndex: 'asc' }, { decidedAt: 'asc' }]
        });
    }

    /**
     * Returns the ordered list of `sentenceIndex` values annotated by
     * `annotatorId` on the given entry. Used by the finalize gate to know how
     * many phrases must be fully evaluated.
     *
     * @param {{ entryId:number, annotatorId:number }} input
     * @returns {Promise<number[]>}
     */
    async function findAnnotatedSentenceIndexes({ entryId, annotatorId }) {
        const rows = await deps.prisma.annotation.findMany({
            where: { entryId, userId: annotatorId },
            orderBy: { sentenceIndex: 'asc' },
            select: { sentenceIndex: true }
        });
        return rows.map((/** @type {*} */ r) => r.sentenceIndex);
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
        findAnnotatedSentenceIndexes,
        createComment,
        findCommentsByReview,
        findCompletedReviewsForAnnotator,
        findPreviousTerminalReview
    };
}

module.exports = {
    createReviewsRepository
};
