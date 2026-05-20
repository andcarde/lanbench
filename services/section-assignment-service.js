'use strict';

/**
 * @file Section-assignment service — manages the assignment of a dataset's
 * sections to users.
 *
 * Responsibilities:
 *   - `assignSection`: reserves a specific section for a user, respecting
 *     mutual exclusion over the same section.
 *   - `completeAssignmentIfSectionDone`: closes the assignment when the whole
 *     section is completed.
 *
 * @typedef {Object} SectionAssignmentServiceDeps
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [prismaClient]
 * @property {number}              [assignmentDurationMs]
 */

const { ASSIGNMENT_COMPLETED } = require('../constants/assignment-status');
const { createSectionAssignmentsRepository } = require('../repositories/section-assignments-repository');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const defaultPrisma = require('../prisma/client');

/** Default duration of an assignment (2 hours). */
const DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Builds the section-assignment service.
 *
 * @param {SectionAssignmentServiceDeps} [dependencies]
 */
function createSectionAssignmentService({
    sectionAssignmentsRepository,
    datasetsRepository,
    prismaClient,
    assignmentDurationMs
} = {}) {
    const deps = {
        sectionAssignmentsRepository: sectionAssignmentsRepository || createSectionAssignmentsRepository(),
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        prismaClient: prismaClient || defaultPrisma,
        assignmentDurationMs: assignmentDurationMs ?? DEFAULT_ASSIGNMENT_DURATION_MS
    };

    /**
     * Closes the user's assignment if all entries of the section are already annotated.
     *
     * The decision reads run on the default client; when `tx` (transactional
     * client) is passed, the single write (`updateAssignmentStatus`)
     * participates in that transaction so it is atomic together with the
     * dataset counters.
     *
     * @param {*} [options] - { userId, datasetId, sectionIndex, prismaClient?, tx? }.
     * @returns {Promise<boolean>} True if the assignment was completed.
     */
    async function completeAssignmentIfSectionDone({ userId, datasetId, sectionIndex, prismaClient: prismaOverride, tx } = /** @type {*} */ ({})) {
        const assignment = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
        if (!assignment || assignment.sectionIndex !== sectionIndex)
            return false;

        const entryIds = await deps.datasetsRepository.findEntryIdsBySection({ datasetId, sectionIndex });
        if (entryIds.length === 0)
            return false;

        const annotatedCount = await countAnnotatedEntries({
            userId,
            entryIds,
            prismaClient: prismaOverride || deps.prismaClient
        });
        if (annotatedCount < entryIds.length)
            return false;

        await deps.sectionAssignmentsRepository.updateAssignmentStatus({
            assignmentId: assignment.id,
            status: ASSIGNMENT_COMPLETED
        }, tx);

        return true;
    }

    /**
     * Creates (without a selection algorithm) an assignment for a specific section.
     * Centralizes the single createAssignment write point in the domain.
     * @param {*} options - userId, datasetId, sectionIndex.
     * @returns {Promise<*>} Created assignment.
     */
    async function assignSection({ userId, datasetId, sectionIndex }) {
        const expiresAt = new Date(Date.now() + deps.assignmentDurationMs);
        return deps.sectionAssignmentsRepository.createAssignment({
            userId,
            datasetId,
            sectionIndex,
            expiresAt
        });
    }

    return {
        completeAssignmentIfSectionDone,
        assignSection
    };
}

/**
 * Counts how many distinct entries within the list have been annotated by the user.
 * @param {*} options - { userId, entryIds, prismaClient }.
 * @returns {Promise<number>} Number of annotated entries.
 */
async function countAnnotatedEntries({ userId, entryIds, prismaClient }) {
    if (!prismaClient || entryIds.length === 0)
        return 0;

    const rows = await prismaClient.annotation.findMany({
        where: { entryId: { in: entryIds }, userId },
        distinct: ['entryId'],
        select: { entryId: true }
    });
    return rows.length;
}

module.exports = {
    createSectionAssignmentService
};
