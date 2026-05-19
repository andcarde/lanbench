'use strict';

/**
 * @file Repository for the `EvaluationCriterion` table.
 *
 * Cada criterio describe un eje de calidad (gramatica, cobertura, etc.) que
 * los revisores pueden evaluar. La actualizacion incrementa siempre la
 * columna `version` para detectar cambios optimistas.
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
 * Construye el repositorio de `EvaluationCriterion`.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createEvaluationCriteriaRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Lista los criterios disponibles, opcionalmente filtrando los inactivos.
     * Resultados ordenados por `sortOrder`, luego por `id`.
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
     * Crea un nuevo criterio. El `version` lo gestiona Prisma (default 1).
     *
     * @param {EvaluationCriterionCreateInput} data
     * @returns {Promise<EvaluationCriterionRow>}
     */
    async function create(data) {
        return deps.prisma.evaluationCriterion.create({ data });
    }

    /**
     * Actualiza el criterio identificado por `id` y aumenta la `version`
     * (control optimista de cambios desde la UI).
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
