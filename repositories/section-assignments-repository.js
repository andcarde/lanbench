'use strict';

/**
 * @file Repository for the `SectionAssignment` table.
 *
 * Each row represents that a `userId` is assigned (or was assigned) a
 * specific section of a dataset. The state evolves according to
 * `AssignmentStatus` (`active` -> `completed` | `released` | `expired`).
 *
 * @typedef {import('../types/typedefs').PrismaClientLike}    PrismaClientLike
 * @typedef {import('../types/typedefs').AssignmentStatus}    AssignmentStatus
 *
 * @typedef {Object} SectionAssignmentRow
 * @property {number} id
 * @property {number} userId
 * @property {number} datasetId
 * @property {number} sectionIndex
 * @property {Date} expiresAt
 * @property {AssignmentStatus} status
 */

const defaultPrisma = require('../prisma/client');
const {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_EXPIRED
} = require('../constants/assignment-status');

/**
 * Builds the section-assignments repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createSectionAssignmentsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Retrieves the active assignment of `userId` over `datasetId`, or `null`.
     *
     * @param {{ userId:number, datasetId:number }} input
     * @returns {Promise<SectionAssignmentRow|null>}
     */
    async function findActiveAssignment({ userId, datasetId }) {
        return deps.prisma.sectionAssignment.findFirst({
            where: {
                userId,
                datasetId,
                status: ASSIGNMENT_ACTIVE
            }
        });
    }

    /**
     * Retrieves the active assignment occupying a specific section.
     *
     * @param {{ datasetId:number, sectionIndex:number }} input
     * @returns {Promise<SectionAssignmentRow|null>}
     */
    async function findActiveAssignmentForSection({ datasetId, sectionIndex }) {
        return deps.prisma.sectionAssignment.findFirst({
            where: {
                datasetId,
                sectionIndex,
                status: ASSIGNMENT_ACTIVE
            }
        });
    }

    /**
     * Gets the maximum assigned section index in a dataset.
     *
     * @param {number} datasetId
     * @returns {Promise<number>} Maximum index, or `0` if there are no assignments.
     */
    async function findMaxSectionIndex(datasetId) {
        const result = await deps.prisma.sectionAssignment.aggregate({
            where: { datasetId },
            _max: { sectionIndex: true }
        });

        const maxSectionIndex = result?._max
            ? Number(result._max.sectionIndex)
            : 0;

        return Number.isInteger(maxSectionIndex) && maxSectionIndex > 0
            ? maxSectionIndex
            : 0;
    }

    /**
     * Creates an assignment in `active` state with the given expiration date.
     *
     * @param {{ userId:number, datasetId:number, sectionIndex:number, expiresAt:Date }} input
     * @returns {Promise<SectionAssignmentRow>}
     */
    async function createAssignment({ userId, datasetId, sectionIndex, expiresAt }) {
        return deps.prisma.sectionAssignment.create({
            data: {
                userId,
                datasetId,
                sectionIndex,
                expiresAt,
                status: ASSIGNMENT_ACTIVE
            }
        });
    }

    /**
     * Changes the `status` of a specific assignment. Accepts an optional
     * transactional `client` to participate in an already-open transaction.
     *
     * @param {{ assignmentId:number, status:AssignmentStatus }} input
     * @param {PrismaClientLike} [client] - Optional transactional client.
     * @returns {Promise<SectionAssignmentRow>}
     */
    async function updateAssignmentStatus({ assignmentId, status }, client) {
        return (client || deps.prisma).sectionAssignment.update({
            where: { id: assignmentId },
            data: { status }
        });
    }

    /**
     * Updates the `status` of ALL of `userId`'s assignments over `datasetId`
     * that are in `currentStatus`. Useful to release a user's active
     * assignments in bulk.
     *
     * @param {{ userId:number, datasetId:number, currentStatus:AssignmentStatus, newStatus:AssignmentStatus }} input
     * @returns {Promise<{ count:number }>}
     */
    async function updateUserDatasetAssignmentStatus({ userId, datasetId, currentStatus, newStatus }) {
        return deps.prisma.sectionAssignment.updateMany({
            where: { userId, datasetId, status: currentStatus },
            data: { status: newStatus }
        });
    }

    /**
     * Marks as `expired` every active assignment whose `expiresAt` is strictly
     * earlier than `cutoffDate`.
     *
     * @param {Date} cutoffDate
     * @returns {Promise<{ count:number }>}
     */
    async function expireStaleAssignments(cutoffDate) {
        return deps.prisma.sectionAssignment.updateMany({
            where: {
                status: ASSIGNMENT_ACTIVE,
                expiresAt: { lt: cutoffDate }
            },
            data: { status: ASSIGNMENT_EXPIRED }
        });
    }

    return {
        findActiveAssignment,
        findActiveAssignmentForSection,
        findMaxSectionIndex,
        createAssignment,
        updateAssignmentStatus,
        updateUserDatasetAssignmentStatus,
        expireStaleAssignments
    };
}

module.exports = {
    createSectionAssignmentsRepository
};
