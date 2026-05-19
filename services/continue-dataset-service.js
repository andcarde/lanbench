'use strict';

/**
 * @file Continue-dataset service — orquesta el flujo "continuar dataset":
 * resolver la sesion activa, asignar la siguiente seccion al usuario y
 * avanzar la posicion (`entryNumber`) dentro de la sesion.
 *
 * Algoritmo secuencial: la siguiente seccion a asignar es
 * `maxSectionIndex + 1`. Las escrituras sobre asignaciones se delegan en
 * `sectionAssignmentService.assignSection`, asi solo existe un punto que
 * crea filas en `section_assignments`.
 *
 * @typedef {Object} ContinueDatasetServiceDeps
 * @property {Record<string, any>} [activeSessionsRepository]
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [sectionAssignmentService]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [datasetsService]
 * @property {number}              [assignmentDurationMs]
 */

const { SECTION_SIZE } = require('../constants/datasets');
const { createActiveSessionsRepository } = require('../repositories/active-sessions-repository');
const { createSectionAssignmentsRepository } = require('../repositories/section-assignments-repository');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createSectionAssignmentService } = require('./section-assignment-service');
const { ServiceError } = require('./service-error');

/** Modo `ActiveSession` usado por este servicio (no se mezcla con `review`). */
const SESSION_MODE_ANNOTATION = 'annotation';
/** Duracion por defecto de una asignacion antes de expirar (2 horas). */
const DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Construye el servicio de continuacion de dataset.
 *
 * @param {ContinueDatasetServiceDeps} [options]
 */
function createContinueDatasetService({
    activeSessionsRepository,
    sectionAssignmentsRepository,
    sectionAssignmentService,
    datasetsRepository,
    datasetsService,
    assignmentDurationMs
} = {}) {
    const sharedSectionAssignmentsRepository =
        sectionAssignmentsRepository || createSectionAssignmentsRepository();
    const sharedDatasetsRepository =
        datasetsRepository || createDatasetsRepository();
    const resolvedAssignmentDurationMs = assignmentDurationMs ?? DEFAULT_ASSIGNMENT_DURATION_MS;

    const deps = {
        activeSessionsRepository: activeSessionsRepository || createActiveSessionsRepository(),
        sectionAssignmentsRepository: sharedSectionAssignmentsRepository,
        datasetsRepository: sharedDatasetsRepository,
        datasetsService: datasetsService || null,
        sectionAssignmentService: sectionAssignmentService || createSectionAssignmentService({
            sectionAssignmentsRepository: sharedSectionAssignmentsRepository,
            datasetsRepository: sharedDatasetsRepository,
            assignmentDurationMs: resolvedAssignmentDurationMs
        })
    };

    /**
     * Evalúa los 5 casos del botón continuar para un dataset y usuario dados.
     * @param {number} userId - Usuario que pulsa continuar.
     * @param {number} datasetId - Dataset seleccionado.
     * @returns {Promise<*>} Resultado del caso detectado.
     */
    async function continueDataset(userId, datasetId) {
        if (typeof deps.sectionAssignmentsRepository.expireStaleAssignments === 'function')
            await deps.sectionAssignmentsRepository.expireStaleAssignments(new Date());

        const dataset = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!dataset)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        const totalSections = Math.ceil(dataset.totalEntries / SECTION_SIZE);
        if (totalSections === 0)
            throw new ServiceError('El dataset no tiene entries.', {
                status: 409,
                code: 'dataset_empty'
            });

        if (dataset.sectionsPending === 0 && dataset.sectionsInReview === 0)
            return { caseNumber: 1 };

        if (dataset.sectionsPending === 0 && dataset.sectionsInReview > 0)
            return { caseNumber: 2 };

        const session = await deps.activeSessionsRepository.findSession({
            datasetId,
            userId,
            mode: SESSION_MODE_ANNOTATION
        });

        if (session) {
            const entryData = await findEntryByPosition(deps.datasetsRepository, datasetId, session.entryNumber);
            return {
                caseNumber: 4,
                sectionNumber: session.sectionNumber,
                entryPosition: session.entryNumber,
                entryId: entryData ? entryData.eid : null,
                entryIndexInSection: session.entryNumber % SECTION_SIZE
            };
        }

        const existingAssignment = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
        if (existingAssignment) {
            const sectionNumber = existingAssignment.sectionIndex;
            const entryPosition = getSectionStartPosition(sectionNumber);
            await deps.activeSessionsRepository.upsertSession({
                datasetId,
                userId,
                mode: SESSION_MODE_ANNOTATION,
                sectionNumber,
                entryNumber: entryPosition
            });

            const entryData = await findEntryByPosition(deps.datasetsRepository, datasetId, entryPosition);
            return {
                caseNumber: 4,
                sectionNumber,
                entryPosition,
                entryId: entryData ? entryData.eid : null,
                entryIndexInSection: 0
            };
        }

        const maxSectionIndex = await findMaxSectionIndex(deps.sectionAssignmentsRepository, datasetId);
        const nextSectionIndex = maxSectionIndex + 1;
        const nextSectionStartPosition = getSectionStartPosition(nextSectionIndex);

        if (nextSectionStartPosition >= dataset.totalEntries)
            return { caseNumber: 3 };

        await deps.sectionAssignmentService.assignSection({
            userId,
            datasetId,
            sectionIndex: nextSectionIndex
        });

        await deps.activeSessionsRepository.upsertSession({
            datasetId,
            userId,
            mode: SESSION_MODE_ANNOTATION,
            sectionNumber: nextSectionIndex,
            entryNumber: nextSectionStartPosition
        });

        const firstEntry = await findEntryByPosition(deps.datasetsRepository, datasetId, nextSectionStartPosition);
        return {
            caseNumber: 5,
            sectionNumber: nextSectionIndex,
            entryPosition: nextSectionStartPosition,
            entryId: firstEntry ? firstEntry.eid : null,
            entryIndexInSection: 0
        };
    }

    /**
     * Avanza la sesión activa al siguiente entry de la sección.
     * @param {number} userId - Usuario actual.
     * @param {number} datasetId - Dataset actual.
     * @returns {Promise<*>} Resultado del avance.
     */
    async function advanceSession(userId, datasetId) {
        const session = await deps.activeSessionsRepository.findSession({
            datasetId,
            userId,
            mode: SESSION_MODE_ANNOTATION
        });

        if (!session)
            throw new ServiceError('No hay sesión activa para este usuario en este dataset.', {
                status: 409,
                code: 'no_active_session'
            });

        const dataset = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!dataset)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        const sectionEnd = session.sectionNumber * SECTION_SIZE;
        const nextPosition = session.entryNumber + 1;

        if (nextPosition >= sectionEnd || nextPosition >= dataset.totalEntries) {
            await deps.activeSessionsRepository.deleteSession({
                datasetId,
                userId,
                mode: SESSION_MODE_ANNOTATION
            });

            const maxSectionIndex = await findMaxSectionIndex(deps.sectionAssignmentsRepository, datasetId);
            const nextSectionStartPosition = maxSectionIndex * SECTION_SIZE;
            const moreSectionsAvailable = nextSectionStartPosition < dataset.totalEntries;

            return {
                sectionDone: true,
                sectionNumber: session.sectionNumber,
                moreSectionsAvailable
            };
        }

        await deps.activeSessionsRepository.upsertSession({
            datasetId,
            userId,
            mode: SESSION_MODE_ANNOTATION,
            sectionNumber: session.sectionNumber,
            entryNumber: nextPosition
        });

        const nextEntry = await findEntryByPosition(deps.datasetsRepository, datasetId, nextPosition);
        return {
            sectionDone: false,
            sectionNumber: session.sectionNumber,
            entryPosition: nextPosition,
            entryId: nextEntry ? nextEntry.eid : null,
            entryIndexInSection: nextPosition % SECTION_SIZE
        };
    }

    /**
     * Devuelve la entry apuntada por la sesion activa con su contexto de seccion.
     * @param {number} userId - Usuario actual.
     * @param {number} datasetId - Dataset actual.
     * @returns {Promise<*>} Payload de la entry actual.
     */
    async function getNextEntry(userId, datasetId) {
        if (!deps.datasetsService)
            throw new ServiceError('datasetsService no disponible para resolver la entry.', {
                status: 500,
                code: 'missing_datasets_service'
            });

        const session = await deps.activeSessionsRepository.findSession({
            datasetId,
            userId,
            mode: SESSION_MODE_ANNOTATION
        });

        if (!session)
            throw new ServiceError('No hay sesión activa para este usuario en este dataset.', {
                status: 409,
                code: 'no_active_session'
            });

        const sectionPayload = await deps.datasetsService.getAccessibleDatasetSection(
            userId,
            datasetId,
            session.sectionNumber
        );

        const entries = Array.isArray(sectionPayload?.entries) ? sectionPayload.entries : [];
        const entryIndexInSection = session.entryNumber % SECTION_SIZE;
        const entry = entries[entryIndexInSection];

        if (!entry)
            throw new ServiceError('No se encontró la entry de la sesión activa.', {
                status: 404,
                code: 'entry_not_found'
            });

        const totalEntriesInSection = entries.length;

        return {
            datasetId: sectionPayload.datasetId,
            datasetName: sectionPayload.datasetName,
            totalSections: sectionPayload.totalSections,
            sectionNumber: sectionPayload.sectionIndex,
            sectionSize: sectionPayload.sectionSize,
            totalEntriesInSection,
            entryIndexInSection,
            isLastEntryInSection: entryIndexInSection === totalEntriesInSection - 1,
            entry
        };
    }

    return {
        continueDataset,
        advanceSession,
        getNextEntry,
        SESSION_MODE_ANNOTATION
    };
}

/**
 * Calcula la posicion global inicial de una seccion 1-indexed.
 * @param {number} sectionNumber - Numero de seccion.
 * @returns {number} Posicion 0-indexed.
 */
function getSectionStartPosition(sectionNumber) {
    return (sectionNumber - 1) * SECTION_SIZE;
}

/**
 * Obtiene el índice de sección más alto asignado para un dataset.
 * @param {*} repo - Repositorio de asignaciones.
 * @param {number} datasetId - Identificador del dataset.
 * @returns {Promise<number>} Índice máximo asignado (0 si ninguno).
 */
async function findMaxSectionIndex(repo, datasetId) {
    const max = await repo.findMaxSectionIndex(datasetId);
    return typeof max === 'number' && max > 0 ? max : 0;
}

/**
 * Obtiene un entry por su posición 0-indexed en el dataset.
 * @param {*} repo - Repositorio de datasets.
 * @param {number} datasetId - Identificador del dataset.
 * @param {number} position - Posición 0-indexed del entry.
 * @returns {Promise<*>} Fila del entry o null.
 */
async function findEntryByPosition(repo, datasetId, position) {
    if (typeof repo.findEntryByPosition !== 'function')
        return null;
    return repo.findEntryByPosition({ datasetId, position });
}

module.exports = {
    createContinueDatasetService
};
