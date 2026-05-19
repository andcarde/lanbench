'use strict';

/**
 * @file Repository for the `SectionAssignment` table.
 *
 * Cada fila representa que un `userId` tiene asignada (o tuvo) una seccion
 * concreta de un dataset. El estado evoluciona segun `AssignmentStatus`
 * (`active` -> `completed` | `released` | `expired`).
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
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_EXPIRED
} = require('../constants/assignment-status');

/**
 * Construye el repositorio de asignaciones de seccion.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createSectionAssignmentsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Recupera la asignacion activa de `userId` sobre `datasetId`, o `null`.
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
     * Recupera la asignacion activa que ocupa una seccion concreta.
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
     * Devuelve los indices de seccion actualmente activos en un dataset
     * (asignados a algun usuario).
     *
     * @param {number} datasetId
     * @returns {Promise<Set<number>>}
     */
    async function findActiveSectionIndexes(datasetId) {
        const rows = await deps.prisma.sectionAssignment.findMany({
            where: {
                datasetId,
                status: ASSIGNMENT_ACTIVE
            },
            select: { sectionIndex: true }
        });
        return new Set(rows.map((/** @type {{ sectionIndex:number }} */ r) => r.sectionIndex));
    }

    /**
     * Devuelve los indices de seccion ya completados en un dataset.
     *
     * @param {number} datasetId
     * @returns {Promise<Set<number>>}
     */
    async function findCompletedSectionIndexes(datasetId) {
        const rows = await deps.prisma.sectionAssignment.findMany({
            where: {
                datasetId,
                status: ASSIGNMENT_COMPLETED
            },
            select: { sectionIndex: true }
        });
        return new Set(rows.map((/** @type {{ sectionIndex:number }} */ r) => r.sectionIndex));
    }

    /**
     * Obtiene el indice maximo de seccion asignada en un dataset.
     *
     * @param {number} datasetId
     * @returns {Promise<number>} Indice maximo o `0` si no hay asignaciones.
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
     * Crea una asignacion en estado `active` con la fecha de expiracion dada.
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
     * Cambia el `status` de una asignacion concreta.
     *
     * @param {{ assignmentId:number, status:AssignmentStatus }} input
     * @returns {Promise<SectionAssignmentRow>}
     */
    async function updateAssignmentStatus({ assignmentId, status }) {
        return deps.prisma.sectionAssignment.update({
            where: { id: assignmentId },
            data: { status }
        });
    }

    /**
     * Actualiza el `status` de TODAS las asignaciones de `userId` sobre
     * `datasetId` que esten en `currentStatus`. Util para liberar las
     * asignaciones activas de un usuario en bloque.
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
     * Marca como `expired` toda asignacion activa cuyo `expiresAt` sea
     * estrictamente anterior a `cutoffDate`.
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
        findActiveSectionIndexes,
        findCompletedSectionIndexes,
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
