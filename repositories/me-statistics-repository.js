'use strict';

/**
 * @file Repository for personal-statistics queries — the data behind
 * `GET /api/me/stats` (US-14). Provides the raw per-user activity that
 * `me-statistics-service` aggregates into global + per-dataset metrics.
 *
 * Annotation time is tracked on `SectionAssignment.timeSpentSeconds` (one
 * accumulator per assigned section); review time on `Review.timeSpentSeconds`.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 */

const defaultPrisma = require('../prisma/client');
const { TERMINAL_REVIEW_STATUSES } = require('../constants/review-status');

/**
 * Builds the personal-statistics repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createMeStatisticsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Distinct entries annotated by the user, with the dataset they belong to.
     * Each row is one annotated entry (sentences of the same entry collapse to
     * a single task), matching the per-entry counting used in US-21.
     *
     * @param {number} userId
     * @returns {Promise<Array<{ datasetId:number, entryId:number }>>}
     */
    async function findAnnotatedEntries(userId) {
        const rows = await deps.prisma.annotation.findMany({
            where: { userId },
            distinct: ['datasetId', 'entryId'],
            select: { datasetId: true, entryId: true }
        });
        return rows.map((/** @type {*} */ r) => ({ datasetId: r.datasetId, entryId: r.entryId }));
    }

    /**
     * Section-assignment time accumulators for the user, per dataset. This is
     * the source of annotation time (US-21 sums it per user/dataset).
     *
     * @param {number} userId
     * @returns {Promise<Array<{ datasetId:number, timeSpentSeconds:number }>>}
     */
    async function findSectionAssignmentTimes(userId) {
        const rows = await deps.prisma.sectionAssignment.findMany({
            where: { userId },
            select: { datasetId: true, timeSpentSeconds: true }
        });
        return rows.map((/** @type {*} */ r) => ({
            datasetId: r.datasetId,
            timeSpentSeconds: r.timeSpentSeconds || 0
        }));
    }

    /**
     * The user's terminal reviews (`completed`/`disputed`), each flattened to
     * its dataset and the time spent on it.
     *
     * @param {number} userId
     * @returns {Promise<Array<{ datasetId:number, timeSpentSeconds:number }>>}
     */
    async function findTerminalReviews(userId) {
        const rows = await deps.prisma.review.findMany({
            where: { reviewerId: userId, status: { in: TERMINAL_REVIEW_STATUSES } },
            select: { timeSpentSeconds: true, entry: { select: { datasetId: true } } }
        });
        return rows.map((/** @type {*} */ r) => ({
            datasetId: r.entry ? r.entry.datasetId : null,
            timeSpentSeconds: r.timeSpentSeconds || 0
        }));
    }

    /**
     * Names for the given dataset ids.
     *
     * @param {number[]} datasetIds
     * @returns {Promise<Array<{ id:number, name:string }>>}
     */
    async function findDatasetsByIds(datasetIds) {
        const ids = [...new Set((datasetIds || []).filter(id => Number.isInteger(id) && id > 0))];
        if (ids.length === 0)
            return [];
        return deps.prisma.dataset.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true }
        });
    }

    return {
        findAnnotatedEntries,
        findSectionAssignmentTimes,
        findTerminalReviews,
        findDatasetsByIds
    };
}

module.exports = {
    createMeStatisticsRepository
};
