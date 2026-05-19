'use strict';

/**
 * @file Section-assignment service — gestiona la asignacion de secciones de
 * un dataset a usuarios.
 *
 * Responsabilidades:
 *   - `assignSection`: reserva una seccion concreta para un usuario,
 *     respetando exclusion mutua sobre la misma seccion.
 *   - `releaseAssignment`: libera la asignacion del usuario.
 *   - `completeAssignmentIfSectionDone`: cierra la asignacion cuando se
 *     completa toda la seccion.
 *
 * @typedef {Object} SectionAssignmentServiceDeps
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [prismaClient]
 * @property {number}              [assignmentDurationMs]
 */

const { SECTION_SIZE } = require('../constants/datasets');
const {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_RELEASED
} = require('../constants/assignment-status');
const { createSectionAssignmentsRepository } = require('../repositories/section-assignments-repository');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const defaultPrisma = require('../prisma/client');
const { ServiceError } = require('./service-error');

/**
 * Rangos de complejidad usados al elegir secciones (low/medium/high segun
 * el numero de triples por entry).
 * @type {Readonly<Record<'low'|'medium'|'high', { min:number, max:number }>>}
 */
const COMPLEXITY_BANDS = {
    low: { min: 1, max: 2 },
    medium: { min: 3, max: 5 },
    high: { min: 6, max: Infinity }
};

/** Duracion por defecto de una asignacion (2 horas). */
const DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Construye el servicio de asignacion de secciones.
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
     * Asigna al usuario la primera seccion disponible del dataset segun complejidad pedida.
     * @param {*} options - { userId, datasetId, complexity? }.
     * @returns {Promise<*>} Asignacion activa creada o existente.
     */
    async function requestSection({ userId, datasetId, complexity = 'any' }) {
        await deps.sectionAssignmentsRepository.expireStaleAssignments(new Date());

        const existing = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
        if (existing)
            return existing;

        const dataset = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!dataset)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        const totalSections = Math.ceil(dataset.totalEntries / SECTION_SIZE);
        if (totalSections === 0)
            throw new ServiceError('El dataset no tiene entries.', {
                status: 409,
                code: 'dataset_empty'
            });

        const occupiedIndexes = await deps.sectionAssignmentsRepository.findActiveSectionIndexes(datasetId);
        const completedIndexes = typeof deps.sectionAssignmentsRepository.findCompletedSectionIndexes === 'function'
            ? await deps.sectionAssignmentsRepository.findCompletedSectionIndexes(datasetId)
            : new Set();
        const unavailableIndexes = new Set([...occupiedIndexes, ...completedIndexes]);

        /** @type {any} */

        let targetSectionIndex = null;

        if (complexity === 'any') {
            for (let i = 1; i <= totalSections; i++) {
                if (!unavailableIndexes.has(i)) {
                    targetSectionIndex = i;
                    break;
                }
            }
        } else {
            const entrySizes = await deps.datasetsRepository.findEntrySizesByDataset(datasetId);
            for (let i = 1; i <= totalSections; i++) {
                if (unavailableIndexes.has(i))
                    continue;

                const startIdx = (i - 1) * SECTION_SIZE;
                const sectionSizes = entrySizes.slice(startIdx, startIdx + SECTION_SIZE);
                if (sectionMatchesComplexity(sectionSizes, complexity)) {
                    targetSectionIndex = i;
                    break;
                }
            }

            if (targetSectionIndex === null) {
                for (let i = 1; i <= totalSections; i++) {
                    if (!unavailableIndexes.has(i)) {
                        targetSectionIndex = i;
                        break;
                    }
                }
            }
        }

        if (targetSectionIndex === null) {
            if (completedIndexes.size >= totalSections)
                throw new ServiceError('Todas las entries del dataset han sido completadas.', {
                    status: 409,
                    code: 'dataset_complete'
                });

            throw new ServiceError('No hay secciones disponibles en este dataset.', {
                status: 409,
                code: 'no_sections_available'
            });
        }

        const expiresAt = new Date(Date.now() + deps.assignmentDurationMs);
        return deps.sectionAssignmentsRepository.createAssignment({
            userId,
            datasetId,
            sectionIndex: targetSectionIndex,
            expiresAt
        });
    }

    /**
     * Marca la asignacion activa del usuario sobre el dataset como liberada.
     * @param {*} options - { userId, datasetId }.
     * @returns {Promise<void>}
     */
    async function releaseSection({ userId, datasetId }) {
        await deps.sectionAssignmentsRepository.updateUserDatasetAssignmentStatus({
            userId,
            datasetId,
            currentStatus: ASSIGNMENT_ACTIVE,
            newStatus: ASSIGNMENT_RELEASED
        });
    }

    /**
     * Devuelve la asignacion activa del usuario sobre el dataset tras purgar expiradas.
     * @param {*} options - { userId, datasetId }.
     * @returns {Promise<*>} Asignacion activa o null si no existe.
     */
    async function resumeSection({ userId, datasetId }) {
        await deps.sectionAssignmentsRepository.expireStaleAssignments(new Date());
        return deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
    }

    /**
     * Cierra la asignacion del usuario si todas las entries de la seccion ya estan anotadas.
     * @param {*} [options] - { userId, datasetId, sectionIndex, prismaClient? }.
     * @returns {Promise<boolean>} True si la asignacion se completo.
     */
    async function completeAssignmentIfSectionDone({ userId, datasetId, sectionIndex, prismaClient: prismaOverride } = /** @type {*} */ ({})) {
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
        });

        return true;
    }

    /**
     * Crea (sin algoritmo de seleccion) una asignacion para una seccion concreta.
     * Centraliza el unico punto de escritura de createAssignment en el dominio.
     * @param {*} options - userId, datasetId, sectionIndex.
     * @returns {Promise<*>} Asignacion creada.
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
        requestSection,
        releaseSection,
        resumeSection,
        completeAssignmentIfSectionDone,
        assignSection
    };
}

/**
 * Cuenta cuantas entries distintas dentro de la lista han sido anotadas por el usuario.
 * @param {*} options - { userId, entryIds, prismaClient }.
 * @returns {Promise<number>} Numero de entries anotadas.
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

/**
 * Indica si una seccion encaja con la complejidad pedida segun los tamanos de sus entries.
 * @param {*} sizes - Tamanos en triples de las entries.
 * @param {*} complexity - Etiqueta de complejidad pedida ("simple" | "complex" | "any").
 * @returns {boolean} True si la seccion encaja.
 */
function sectionMatchesComplexity(sizes, complexity) {
    if (!sizes || sizes.length === 0)
        return false;

    const band = (/** @type {Record<string, {min:number,max:number}>} */ (COMPLEXITY_BANDS))[complexity];
    if (!band)
        return false;

    const counts = { match: 0, total: sizes.length };
    for (const s of sizes) {
        if (s >= band.min && s <= band.max)
            counts.match++;
    }

    return counts.match > counts.total / 2;
}

module.exports = {
    createSectionAssignmentService,
    sectionMatchesComplexity
};
