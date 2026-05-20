'use strict';

/**
 * @file Repository for the `EvaluationCriterion` table.
 *
 * Each criterion describes a quality axis (grammar, coverage, etc.) that
 * reviewers can evaluate. The update always increments the `version` column
 * to detect optimistic changes.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} EvaluationCriterionRow
 * @property {number} id
 * @property {string} code
 * @property {string} label
 * @property {string} description
 * @property {boolean} isActive
 * @property {number} sortOrder
 * @property {number} version
 *
 * @typedef {Omit<EvaluationCriterionRow, 'id'|'version'>} EvaluationCriterionCreateInput
 * @typedef {Partial<Omit<EvaluationCriterionRow, 'id'|'version'>>} EvaluationCriterionUpdateInput
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the `EvaluationCriterion` repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createEvaluationCriteriaRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Lists the available criteria, optionally filtering out inactive ones.
     * Results ordered by `sortOrder`, then by `id`.
     *
     * @param {{ includeInactive?: boolean }} [options]
     * @returns {Promise<EvaluationCriterionRow[]>}
     */
    async function findMany({ includeInactive = true } = {}) {
        return deps.prisma.evaluationCriterion.findMany({
            where: includeInactive ? undefined : { isActive: true },
            orderBy: [
                { sortOrder: 'asc' },
                { id: 'asc' }
            ]
        });
    }

    /**
     * Creates a new criterion. The `version` is managed by Prisma (default 1).
     *
     * @param {EvaluationCriterionCreateInput} data
     * @returns {Promise<EvaluationCriterionRow>}
     */
    async function create(data) {
        return deps.prisma.evaluationCriterion.create({ data });
    }

    /**
     * Updates the criterion identified by `id` and increments the `version`
     * (optimistic control of changes from the UI).
     *
     * @param {number} id
     * @param {EvaluationCriterionUpdateInput} data
     * @returns {Promise<EvaluationCriterionRow>}
     */
    async function update(id, data) {
        return deps.prisma.evaluationCriterion.update({
            where: { id },
            data: {
                ...data,
                version: { increment: 1 }
            }
        });
    }

    return {
        findMany,
        create,
        update
    };
}

module.exports = {
    createEvaluationCriteriaRepository
};
