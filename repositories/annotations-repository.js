'use strict';

/**
 * @file Repository for the `Annotation` table.
 *
 * The `Annotation` table stores one row per (`userId`, `datasetId`,
 * `entryId`, `sentenceIndex`). Annotations are replaced in bulk per entry —
 * individual per-sentence patches are never applied.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} AnnotationSentenceInput
 * @property {string} [sentence]               - Sentence text.
 * @property {string|null} [rejectionReason]   - Rejection reason (optional).
 * @property {number} [sentenceIndex]          - Explicit index; if missing, the array index is used.
 *
 * @typedef {Object} AnnotationRow
 * @property {number} datasetId
 * @property {number} userId
 * @property {number} sentenceIndex
 * @property {string} sentence
 * @property {string|null} rejectionReason
 * @property {'manual'} origin
 */

const defaultPrisma = require('../prisma/client');
const { ENTRY_ANNOTATED, ENTRY_PENDING } = require('../constants/entry-status');

/**
 * Builds the `Annotation` repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 * @returns {{
 *   replaceForAccessibleEntry: (input: { userId:number, datasetId:number, eid:number, sentences: AnnotationSentenceInput[] }) => Promise<{ entryId:number, savedCount:number }|null>,
 *   countAnnotatedEntriesByUser: (input: { userId:number, entryIds:number[] }) => Promise<number>
 * }}
 */
function createAnnotationsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Replaces, within a transaction, the existing annotations of an entry,
     * provided the user has permissions over the dataset.
     *
     * Returns `{ entryId, savedCount }` when the operation is applied, or
     * `null` when the entry is not accessible (it does not exist or the user
     * has no permissions).
     *
     * @param {{ userId:number, datasetId:number, eid:number, sentences: AnnotationSentenceInput[] }} input
     * @returns {Promise<{ entryId:number, savedCount:number }|null>}
     */
    async function replaceForAccessibleEntry({ userId, datasetId, eid, sentences }) {
        const rows = buildAnnotationRows({ userId, datasetId, sentences });

        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            const entry = await tx.entry.findFirst({
                where: {
                    datasetId,
                    eid,
                    dataset: {
                        permits: {
                            some: { userId }
                        }
                    }
                },
                select: { id: true }
            });

            if (!entry)
                return null;

            await tx.annotation.deleteMany({
                where: {
                    entryId: entry.id,
                    datasetId,
                    userId
                }
            });

            if (rows.length === 0) {
                // Clearing every sentence reverts the entry to `pending` so it is
                // no longer surfaced as a review candidate (see review queue).
                await setEntryStatus(tx, entry.id, ENTRY_PENDING);
                return {
                    entryId: entry.id,
                    savedCount: 0
                };
            }

            await tx.annotation.createMany({
                data: rows.map(row => ({ ...row, entryId: entry.id }))
            });

            // Saving at least one sentence marks the entry `annotated`, the single
            // production transition that makes it eligible for the review queue
            // (`reviews-repository.findReviewableEntries` filters `status =
            // 'annotated'`). Re-annotating an already reviewed/disputed entry sets
            // it back to `annotated`; the queue still excludes it while a terminal
            // review exists, so this cannot silently re-open a closed review.
            await setEntryStatus(tx, entry.id, ENTRY_ANNOTATED);

            return {
                entryId: entry.id,
                savedCount: rows.length
            };
        });
    }

    /**
     * Counts entries with at least one annotation by the user, restricted to
     * the `entryIds` set.
     *
     * @param {{ userId:number, entryIds:number[] }} options
     * @returns {Promise<number>}
     */
    async function countAnnotatedEntriesByUser({ userId, entryIds }) {
        if (!Array.isArray(entryIds) || entryIds.length === 0)
            return 0;

        const rows = await deps.prisma.annotation.findMany({
            where: { entryId: { in: entryIds }, userId },
            distinct: ['entryId'],
            select: { entryId: true }
        });
        return rows.length;
    }

    return {
        replaceForAccessibleEntry,
        countAnnotatedEntriesByUser
    };
}

/**
 * Updates the lifecycle `status` of an entry inside an open transaction.
 * Kept as a tiny helper so the two transition points (annotated / pending)
 * share one shape and stay easy to find.
 *
 * @param {*} tx - Open Prisma transaction client.
 * @param {number} entryId - Internal entry id.
 * @param {string} status - Target lifecycle status.
 * @returns {Promise<void>}
 */
async function setEntryStatus(tx, entryId, status) {
    await tx.entry.update({
        where: { id: entryId },
        data: { status }
    });
}

/**
 * Builds one `Annotation` row per `sentenceIndex`, discarding entries without
 * text. The function does not touch the DB: it is exported only so that tests
 * can validate the conversion.
 *
 * @param {{ userId:number, datasetId:number, sentences: AnnotationSentenceInput[] }} options
 * @returns {AnnotationRow[]}
 */
function buildAnnotationRows({ userId, datasetId, sentences }) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];

    return normalizedSentences
        .map((entry, index) => {
            const sentenceText = entry && typeof entry.sentence === 'string'
                ? entry.sentence
                : '';
            const rejectionReason = entry && typeof entry.rejectionReason === 'string'
                && entry.rejectionReason.trim().length > 0
                ? entry.rejectionReason.trim()
                : null;
            const sentenceIndex = entry && Number.isInteger(entry.sentenceIndex)
                ? /** @type {number} */ (entry.sentenceIndex)
                : index;

            return {
                datasetId,
                userId,
                sentenceIndex,
                sentence: sentenceText,
                rejectionReason,
                origin: /** @type {'manual'} */ ('manual')
            };
        });
}

module.exports = {
    createAnnotationsRepository,
    buildAnnotationRows
};
