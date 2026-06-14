'use strict';

/**
 * @file Continue-dataset service — orchestrates the "continue dataset" flow:
 * resolve the active session, assign the next section to the user and advance
 * the position (`entryNumber`) within the session.
 *
 * Sequential algorithm: the next section to assign is `maxSectionIndex + 1`.
 * Writes to assignments are delegated to
 * `sectionAssignmentService.assignSection`, so there is only one point that
 * creates rows in `section_assignments`.
 *
 * @typedef {Object} ContinueDatasetServiceDeps
 * @property {Record<string, any>} [activeSessionsRepository]
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [sectionAssignmentService]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [datasetsService]
 * @property {Record<string, any>} [datasetLlmCredentialsRepository]
 * @property {number}              [assignmentDurationMs]
 */

const { SECTION_SIZE, resolveSectionSize } = require('../constants/datasets');
const { createActiveSessionsRepository } = require('../repositories/active-sessions-repository');
const { createSectionAssignmentsRepository } = require('../repositories/section-assignments-repository');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createDatasetLlmCredentialsRepository } = require('../repositories/dataset-llm-credentials-repository');
const { createSectionAssignmentService } = require('./section-assignment-service');
const { ServiceError } = require('./service-error');

/** `ActiveSession` mode used by this service (not mixed with `review`). */
const SESSION_MODE_ANNOTATION = 'annotation';
/** Default duration of an assignment before it expires (2 hours). */
const DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Builds the continue-dataset service.
 *
 * @param {ContinueDatasetServiceDeps} [options]
 */
function createContinueDatasetService({
    activeSessionsRepository,
    sectionAssignmentsRepository,
    sectionAssignmentService,
    datasetsRepository,
    datasetsService,
    datasetLlmCredentialsRepository,
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
        datasetLlmCredentialsRepository: datasetLlmCredentialsRepository || createDatasetLlmCredentialsRepository(),
        sectionAssignmentService: sectionAssignmentService || createSectionAssignmentService({
            sectionAssignmentsRepository: sharedSectionAssignmentsRepository,
            datasetsRepository: sharedDatasetsRepository,
            assignmentDurationMs: resolvedAssignmentDurationMs
        })
    };

    /**
     * Evaluates the 5 cases of the continue button for a given dataset and user.
     * @param {number} userId - User who clicks continue.
     * @param {number} datasetId - Selected dataset.
     * @returns {Promise<*>} Result of the detected case.
     */
    async function continueDataset(userId, datasetId) {
        await deps.sectionAssignmentsRepository.expireStaleAssignments(new Date());

        const dataset = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!dataset)
            throw ServiceError.datasetNotFound();

        assertNotGenerationMode(dataset);
        await assertActiveCredentialIfCorrection(dataset, datasetId);

        const sectionSize = resolveSectionSize(dataset);
        const totalSections = Math.ceil(dataset.totalEntries / sectionSize);
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
                entryIndexInSection: session.entryNumber % sectionSize
            };
        }

        const existingAssignment = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
        if (existingAssignment) {
            const sectionNumber = existingAssignment.sectionIndex;
            const entryPosition = getSectionStartPosition(sectionNumber, sectionSize);
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
        const nextSectionStartPosition = getSectionStartPosition(nextSectionIndex, sectionSize);

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
     * Advances the active session to the next entry of the section.
     * @param {number} userId - Current user.
     * @param {number} datasetId - Current dataset.
     * @returns {Promise<*>} Result of the advance.
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
            throw ServiceError.datasetNotFound();

        const sectionSize = resolveSectionSize(dataset);
        const sectionEnd = session.sectionNumber * sectionSize;
        const nextPosition = session.entryNumber + 1;

        if (nextPosition >= sectionEnd || nextPosition >= dataset.totalEntries) {
            await deps.activeSessionsRepository.deleteSession({
                datasetId,
                userId,
                mode: SESSION_MODE_ANNOTATION
            });

            const maxSectionIndex = await findMaxSectionIndex(deps.sectionAssignmentsRepository, datasetId);
            const nextSectionIndex = maxSectionIndex + 1;
            const nextSectionStartPosition = getSectionStartPosition(nextSectionIndex, sectionSize);
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
            entryIndexInSection: nextPosition % sectionSize
        };
    }

    /**
     * Returns the entry pointed to by the active session with its section context.
     * @param {number} userId - Current user.
     * @param {number} datasetId - Current dataset.
     * @returns {Promise<*>} Payload of the current entry.
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
        const sectionSize = resolveSectionSize({ sectionSize: sectionPayload?.sectionSize });
        const entryIndexInSection = session.entryNumber % sectionSize;
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

    /**
     * Backend guard for datasets in `llmMode === 'generation'`: manual
     * annotation is not allowed because those entries are produced by the LLM
     * (US-33). Blocks both reserving a section and resuming an existing
     * session, which together prevents the annotation page from entering the
     * editing flow.
     *
     * @param {Record<string, any>} dataset - Dataset row already authorized.
     * @returns {void}
     */
    function assertNotGenerationMode(dataset) {
        const llmMode = typeof dataset?.llmMode === 'string' ? dataset.llmMode : 'none';
        if (llmMode !== 'generation')
            return;

        throw new ServiceError(
            'Este dataset se anota automáticamente por IA; la anotación manual no está disponible.',
            { status: 409, code: 'llm_generation_blocks_annotation' }
        );
    }

    /**
     * Backend enforcement for datasets in `llmMode === 'correction'`: refuses
     * to advance the annotation flow when there is no active LLM credential
     * configured in Administración. Other modes (`generation`, `none`) are not
     * gated here.
     *
     * @param {Record<string, any>} dataset - Dataset row already authorized.
     * @param {number} datasetId - Same id, kept for the repository call.
     * @returns {Promise<void>}
     */
    async function assertActiveCredentialIfCorrection(dataset, datasetId) {
        const llmMode = typeof dataset?.llmMode === 'string' ? dataset.llmMode : 'none';
        if (llmMode !== 'correction')
            return;

        const repo = deps.datasetLlmCredentialsRepository;
        if (!repo || typeof repo.findActiveByDataset !== 'function')
            return;

        const active = await repo.findActiveByDataset(datasetId);
        if (!active) {
            throw new ServiceError(
                'Configura una credencial de IA activa en Administración antes de anotar este dataset.',
                { status: 409, code: 'llm_credential_required' }
            );
        }
    }

    return {
        continueDataset,
        advanceSession,
        getNextEntry,
        SESSION_MODE_ANNOTATION
    };
}

/**
 * Computes the initial global position of a 1-indexed section.
 * @param {number} sectionNumber - Section number.
 * @param {number} [sectionSize] - Per-dataset section size (defaults to SECTION_SIZE).
 * @returns {number} 0-indexed position.
 */
function getSectionStartPosition(sectionNumber, sectionSize = SECTION_SIZE) {
    return (sectionNumber - 1) * sectionSize;
}

/**
 * Gets the highest section index assigned for a dataset.
 * @param {*} repo - Assignments repository.
 * @param {number} datasetId - Dataset identifier.
 * @returns {Promise<number>} Highest assigned index (0 if none).
 */
async function findMaxSectionIndex(repo, datasetId) {
    const max = await repo.findMaxSectionIndex(datasetId);
    return typeof max === 'number' && max > 0 ? max : 0;
}

/**
 * Gets an entry by its 0-indexed position in the dataset.
 * @param {*} repo - Datasets repository.
 * @param {number} datasetId - Dataset identifier.
 * @param {number} position - 0-indexed position of the entry.
 * @returns {Promise<*>} Entry row, or null.
 */
async function findEntryByPosition(repo, datasetId, position) {
    if (typeof repo.findEntryByPosition !== 'function')
        return null;
    return repo.findEntryByPosition({ datasetId, position });
}

module.exports = {
    createContinueDatasetService
};
