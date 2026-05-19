'use strict';

/**
 * @file Repository for the `Review`, `ReviewDecision` and `ReviewComment`
 * tables.
 *
 * Una `Review` representa la asignacion temporal de una entry anotada a un
 * revisor. Cada criterio se evalua con un `ReviewDecision` (insert-or-update)
 * y cada comentario por oracion se persiste como `ReviewComment`.
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
 * Estados de revision que bloquean a una entry para nuevas asignaciones.
 * @type {ReviewStatus[]}
 */
const ENTRY_REVIEW_BLOCKING_STATUSES = [
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED
];

/**
 * Construye el repositorio de revisiones.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createReviewsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Devuelve la review activa del revisor, opcionalmente acotada a un
     * dataset, o `null` si no tiene ninguna.
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
     * Recupera una review por su id.
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
     * Lista entries con estado `annotated` candidatas a ser revisadas por
     * `reviewerId`, excluyendo aquellas que el propio reviewer haya
     * anotado y las que ya tengan una review en curso/cerrada.
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
     * Crea una review en estado `pending` con `currentCriterionIndex = 0`.
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
     * Actualiza el `status` de una review, fijando opcionalmente `completedAt`.
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
     * Avanza `currentCriterionIndex` y, opcionalmente, el `status`.
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
     * Pasa a `expired` todas las reviews activas cuyo `expiresAt` sea
     * estrictamente anterior a `cutoffDate`.
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
     * Inserta o actualiza una decision `(reviewId, criterionCode)`, refrescando
     * `decidedAt` al instante actual cuando ya existia.
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
     * Lista todas las decisiones de una review ordenadas por `decidedAt`.
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
     * Persiste un comentario por oracion asociado a una review.
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
     * Lista los comentarios de una review ordenados por `sentenceIndex`.
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
     * Lista las reviews terminales (`completed`/`disputed`) cuyo `annotatorId`
     * coincide. Util para mostrar al anotador el feedback recibido.
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
