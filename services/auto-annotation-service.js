'use strict';

/**
 * @file Auto-annotation service (US-33).
 *
 * Orchestrates the asynchronous "Anotar" flow for datasets created with
 * `llm_mode = 'generation'`:
 *
 *   - Validates the request (mode, active credential, sectionsCount).
 *   - Atomically locks the next N globally-non-completed sections as
 *     `SectionAssignment` rows for the requesting user (`prisma.$transaction`).
 *   - Tracks the job in memory and drives a sequential worker that calls the
 *     LLM **per entry**, persists every successful entry through
 *     `spanish-service.save` (the same path the manual flow uses), and closes
 *     the section assignment + dataset counters when each section is done.
 *   - Exposes status / retry / cancel so the frontend can recover from LLM
 *     failures without losing the sections that already completed.
 *
 * State is intentionally in-memory: completed sections survive a server
 * restart because they go through the canonical write path; a running job
 * does not (locks stay until they expire at 2 h, mirroring the manual flow).
 *
 * @typedef {Object} AutoAnnotationServiceDeps
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [datasetLlmCredentialsService]
 * @property {Record<string, any>} [datasetsService]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [sectionAssignmentService]
 * @property {Record<string, any>} [spanishService]
 * @property {Record<string, any>} [annotationsRepository]
 * @property {Record<string, any>} [llmClient]
 * @property {Record<string, any>} [prismaClient]
 * @property {Record<string, any>} [logger]
 * @property {number} [assignmentDurationMs]
 *
 * @typedef {Object} JobSnapshot
 * @property {boolean} hasJob
 * @property {'running'|'failed'|'completed'|'cancelled'} [status]
 * @property {number} [entriesAnnotated]
 * @property {number} [totalEntries]
 * @property {number} [sectionsAnnotated]
 * @property {number} [sectionsRequested]
 * @property {number} [totalSections]
 * @property {number} [currentSection]
 * @property {string|null} [lastError]
 */

const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetLlmCredentialsService } = require('./dataset-llm-credentials-service');
const { createSectionAssignmentsRepository } = require('../repositories/section-assignments-repository');
const { createSectionAssignmentService } = require('./section-assignment-service');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createAnnotationsRepository } = require('../repositories/annotations-repository');
const { createSpanishService } = require('../domain/spanish/spanish-service');
const llmClientModule = require('../utils/llm-client');
const defaultPrisma = require('../prisma/client');
const { resolveSectionSize } = require('../constants/datasets');
const { ServiceError } = require('./service-error');
const {
    ASSIGNMENT_ACTIVE,
    ASSIGNMENT_RELEASED
} = require('../constants/assignment-status');
const { ENTRY_PENDING } = require('../constants/entry-status');

/** Default duration of a section lock (mirrors the manual flow: 2 hours). */
const DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000;
/** Hard upper bound on the requested `sectionsCount` (`maxLength = 3`). */
const MAX_SECTIONS_COUNT = 999;
/** Hard lower bound on the requested `sectionsCount`. */
const MIN_SECTIONS_COUNT = 1;

/**
 * Builds the auto-annotation service.
 *
 * @param {AutoAnnotationServiceDeps} [options]
 */
function createAutoAnnotationService({
    datasetsPermissionsRepository,
    datasetLlmCredentialsService,
    datasetsService,
    datasetsRepository,
    sectionAssignmentsRepository,
    sectionAssignmentService,
    spanishService,
    annotationsRepository,
    llmClient,
    prismaClient,
    logger,
    assignmentDurationMs
} = {}) {
    const sharedDatasetsRepository = datasetsRepository || createDatasetsRepository();
    const sharedSectionAssignmentsRepository = sectionAssignmentsRepository || createSectionAssignmentsRepository();
    const deps = {
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        datasetLlmCredentialsService: datasetLlmCredentialsService || createDatasetLlmCredentialsService(),
        datasetsService: datasetsService || null,
        datasetsRepository: sharedDatasetsRepository,
        sectionAssignmentsRepository: sharedSectionAssignmentsRepository,
        sectionAssignmentService: sectionAssignmentService || createSectionAssignmentService({
            sectionAssignmentsRepository: sharedSectionAssignmentsRepository,
            datasetsRepository: sharedDatasetsRepository
        }),
        spanishService: spanishService || createSpanishService(),
        annotationsRepository: annotationsRepository || createAnnotationsRepository(),
        llmClient: llmClient || llmClientModule,
        prismaClient: prismaClient || defaultPrisma,
        logger: logger || null,
        assignmentDurationMs: assignmentDurationMs ?? DEFAULT_ASSIGNMENT_DURATION_MS
    };

    /** @type {Map<number, Record<string, any>>} */
    const jobsByDataset = new Map();

    /**
     * Starts an auto-annotation job for `datasetId` on behalf of `userId`.
     * Validates everything before any LLM call, atomically locks the N
     * sections, then schedules the worker (detached) and returns the initial
     * status snapshot.
     *
     * @param {number} userId
     * @param {number} datasetId
     * @param {number} sectionsCount
     * @returns {Promise<JobSnapshot>}
     */
    async function start(userId, datasetId, sectionsCount) {
        assertPositiveInteger(userId, 'userId');
        assertPositiveInteger(datasetId, 'datasetId');
        const n = normalizeSectionsCount(sectionsCount);

        await assertGenerationDatasetAccess(deps, userId, datasetId);
        const providerConfig = await deps.datasetLlmCredentialsService.resolveActiveProviderConfig(datasetId);
        if (!providerConfig) {
            throw new ServiceError('No hay una credencial de IA activa para este dataset.', {
                status: 409,
                code: 'no_active_credential'
            });
        }

        if (jobsByDataset.has(datasetId)) {
            const existing = jobsByDataset.get(datasetId);
            if (existing && (existing.status === 'running' || existing.status === 'failed')) {
                throw new ServiceError('Ya hay una anotación automática en curso para este dataset.', {
                    status: 409,
                    code: 'auto_annotation_in_progress'
                });
            }
        }

        const datasetRow = await deps.prismaClient.dataset.findUnique({
            where: { id: datasetId },
            select: { id: true, totalEntries: true, sectionSize: true }
        });
        if (!datasetRow)
            throw ServiceError.datasetNotFound();

        const sectionSize = resolveSectionSize(datasetRow);
        const totalSections = Math.max(1, Math.ceil(getTotalEntries(datasetRow) / sectionSize));

        await deps.sectionAssignmentsRepository.expireStaleAssignments(new Date());

        // Atomic lock of N sections — either all or none, so the user never
        // observes a half-reserved range.
        const { sectionIndexes, assignmentIds } = await lockNextSections(deps, {
            userId,
            datasetId,
            count: n,
            totalSections
        });

        const totalEntries = await computeTotalEntriesForSections(deps, datasetId, sectionIndexes);
        if (totalEntries === 0) {
            // No entries means we reserved tail sections that fall past the
            // dataset's last entry — release the locks and report.
            await releaseAssignments(deps, assignmentIds);
            throw new ServiceError('Las secciones reservadas no contienen entries.', {
                status: 409,
                code: 'auto_annotation_empty_range'
            });
        }

        const job = {
            datasetId,
            userId,
            sectionIndexes,
            assignmentIds,
            sectionsCompleted: 0,
            currentEntryIndex: 0,
            currentSectionEntries: /** @type {Array<*>} */ ([]),
            partialEntryIds: /** @type {number[]} */ ([]),
            entriesAnnotated: 0,
            totalEntries,
            totalSections,
            providerConfig,
            status: 'running',
            lastError: null
        };
        jobsByDataset.set(datasetId, job);

        scheduleWorker(deps, jobsByDataset, datasetId);
        return snapshotJob(job);
    }

    /**
     * Returns the current snapshot of the job for `datasetId`. Readable by any
     * user holding a `Permit` on the dataset (used by the UI to render
     * `Anotar` vs `En curso` for everyone, not only the starter).
     *
     * @param {number} userId
     * @param {number} datasetId
     * @returns {Promise<JobSnapshot>}
     */
    async function getStatus(userId, datasetId) {
        assertPositiveInteger(userId, 'userId');
        assertPositiveInteger(datasetId, 'datasetId');

        await assertDatasetPermitOrThrow(deps, userId, datasetId);

        const job = jobsByDataset.get(datasetId);
        if (!job)
            return { hasJob: false };

        return snapshotJob(job);
    }

    /**
     * Resumes a `failed` job from the entry where it stopped. Allowed only to
     * the user that started it (other users only see the status).
     *
     * @param {number} userId
     * @param {number} datasetId
     * @returns {Promise<JobSnapshot>}
     */
    async function retry(userId, datasetId) {
        const job = requireOwnedJob(jobsByDataset, userId, datasetId);
        if (job.status !== 'failed') {
            throw new ServiceError('La anotación automática no está en estado de error.', {
                status: 409,
                code: 'auto_annotation_not_failed'
            });
        }

        job.status = 'running';
        job.lastError = null;
        scheduleWorker(deps, jobsByDataset, datasetId);
        return snapshotJob(job);
    }

    /**
     * Cancels a running/failed job: rolls back the entries already persisted
     * for the partially-annotated current section, releases the remaining
     * `SectionAssignment` locks, clears the job. Sections that completed
     * before the cancel stay persisted (definitive).
     *
     * @param {number} userId
     * @param {number} datasetId
     * @returns {Promise<{ ok:true }>}
     */
    async function cancel(userId, datasetId) {
        const job = requireOwnedJob(jobsByDataset, userId, datasetId);

        // Stop the worker from advancing while we roll back. The check is
        // observed at the top of each entry iteration in `runWorkerLoop`.
        job.status = 'cancelled';

        await rollbackPartialSection(deps, job);
        await releasePendingAssignments(deps, job);

        jobsByDataset.delete(datasetId);
        return { ok: true };
    }

    return {
        start,
        getStatus,
        retry,
        cancel,
        // Exposed for tests and integration health checks.
        _peekJob: (datasetId) => jobsByDataset.get(datasetId) || null
    };
}

/**
 * Validates dataset access and that `llm_mode === 'generation'`.
 *
 * @param {Record<string, any>} deps
 * @param {number} userId
 * @param {number} datasetId
 * @returns {Promise<Record<string, any>>} The permit (with the dataset embedded).
 */
async function assertGenerationDatasetAccess(deps, userId, datasetId) {
    const permit = await deps.datasetsPermissionsRepository.findPermitForUser({ datasetId, userId });
    if (!permit)
        throw ServiceError.datasetNotFound();

    const llmMode = permit?.dataset?.llmMode || 'none';
    if (llmMode !== 'generation') {
        throw new ServiceError('La anotación automática solo aplica a datasets con "Generación por IA".', {
            status: 409,
            code: 'llm_mode_not_generation'
        });
    }
    return permit;
}

/**
 * Asserts the user holds any `Permit` on the dataset; throws `404
 * dataset_not_found` otherwise (no information about existence is leaked).
 *
 * @param {Record<string, any>} deps
 * @param {number} userId
 * @param {number} datasetId
 * @returns {Promise<void>}
 */
async function assertDatasetPermitOrThrow(deps, userId, datasetId) {
    const permit = await deps.datasetsPermissionsRepository.findPermitForUser({ datasetId, userId });
    if (!permit)
        throw ServiceError.datasetNotFound();
}

/**
 * Reads the dataset's total entry count from a permit's embedded dataset row.
 * Falls back to `0` when the field is missing (defensive).
 *
 * @param {Record<string, any>|null|undefined} dataset
 * @returns {number}
 */
function getTotalEntries(dataset) {
    const value = Number(dataset?.totalEntries);
    return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * Validates and normalises `sectionsCount` to an integer in [1, 999].
 *
 * @param {*} value
 * @returns {number}
 */
function normalizeSectionsCount(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < MIN_SECTIONS_COUNT || n > MAX_SECTIONS_COUNT) {
        throw new ServiceError(`El número de secciones debe estar entre ${MIN_SECTIONS_COUNT} y ${MAX_SECTIONS_COUNT}.`, {
            status: 400,
            code: 'invalid_sections_count'
        });
    }
    return n;
}

/**
 * Atomically reserves N consecutive next sections after `maxSectionIndex`
 * (same rule as the **continue** flow case 5) — either all locks succeed or
 * the whole transaction rolls back.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, count:number, totalSections:number }} input
 * @returns {Promise<{ sectionIndexes:number[], assignmentIds:number[] }>}
 */
async function lockNextSections(deps, { userId, datasetId, count, totalSections }) {
    const expiresAt = new Date(Date.now() + deps.assignmentDurationMs);

    return deps.prismaClient.$transaction(async (/** @type {*} */ tx) => {
        const aggregate = await tx.sectionAssignment.aggregate({
            where: { datasetId },
            _max: { sectionIndex: true }
        });
        const maxAssigned = aggregate?._max?.sectionIndex
            ? Number(aggregate._max.sectionIndex)
            : 0;

        const firstIndex = maxAssigned + 1;
        const lastIndex = firstIndex + count - 1;

        if (lastIndex > totalSections) {
            throw new ServiceError('No hay suficientes secciones disponibles para anotar automáticamente.', {
                status: 409,
                code: 'auto_annotation_not_enough_sections'
            });
        }

        const sectionIndexes = [];
        const assignmentIds = [];
        for (let sectionIndex = firstIndex; sectionIndex <= lastIndex; sectionIndex++) {
            const created = await tx.sectionAssignment.create({
                data: {
                    userId,
                    datasetId,
                    sectionIndex,
                    expiresAt,
                    status: ASSIGNMENT_ACTIVE
                }
            });
            sectionIndexes.push(sectionIndex);
            assignmentIds.push(created.id);
        }

        return { sectionIndexes, assignmentIds };
    });
}

/**
 * Sum of entries across the given sections (using each section's persisted
 * window in the dataset).
 *
 * @param {Record<string, any>} deps
 * @param {number} datasetId
 * @param {number[]} sectionIndexes
 * @returns {Promise<number>}
 */
async function computeTotalEntriesForSections(deps, datasetId, sectionIndexes) {
    let total = 0;
    for (const sectionIndex of sectionIndexes) {
        const ids = await deps.datasetsRepository.findEntryIdsBySection({ datasetId, sectionIndex });
        total += Array.isArray(ids) ? ids.length : 0;
    }
    return total;
}

/**
 * Releases the given assignments by id (used on rollback when the job cannot
 * start). Best-effort: a failure here is logged and swallowed because the
 * caller is already failing for an unrelated reason.
 *
 * @param {Record<string, any>} deps
 * @param {number[]} assignmentIds
 * @returns {Promise<void>}
 */
async function releaseAssignments(deps, assignmentIds) {
    if (!Array.isArray(assignmentIds) || assignmentIds.length === 0)
        return;
    try {
        await deps.prismaClient.sectionAssignment.updateMany({
            where: { id: { in: assignmentIds } },
            data: { status: ASSIGNMENT_RELEASED }
        });
    } catch (caughtError) {
        logWarn(deps, caughtError, 'No se pudieron liberar las asignaciones tras un fallo de arranque');
    }
}

/**
 * Schedules the worker loop to run after the current tick. The start endpoint
 * must not await the worker — the user gets the lock confirmation and the
 * background job runs detached.
 *
 * @param {Record<string, any>} deps
 * @param {Map<number, Record<string, any>>} jobs
 * @param {number} datasetId
 * @returns {void}
 */
function scheduleWorker(deps, jobs, datasetId) {
    setImmediate(() => {
        runWorkerLoop(deps, jobs, datasetId).catch((caughtError) => {
            logWarn(deps, caughtError, 'El worker de auto-anotación terminó con un error inesperado');
            const job = jobs.get(datasetId);
            if (job && job.status === 'running') {
                job.status = 'failed';
                job.lastError = describeError(caughtError);
            }
        });
    });
}

/**
 * Sequential worker: walks every remaining section, asks the LLM for each
 * entry (one prompt → one parse → one persist), then finalises the section
 * exactly like the manual flow does.
 *
 * @param {Record<string, any>} deps
 * @param {Map<number, Record<string, any>>} jobs
 * @param {number} datasetId
 * @returns {Promise<void>}
 */
async function runWorkerLoop(deps, jobs, datasetId) {
    const job = jobs.get(datasetId);
    if (!job)
        return;

    while (job.status === 'running' && job.sectionsCompleted < job.sectionIndexes.length) {
        const sectionPos = job.sectionsCompleted;
        const sectionIndex = job.sectionIndexes[sectionPos];

        try {
            if (!job.currentSectionEntries || job.currentSectionEntries.length === 0) {
                const section = await deps.datasetsService.getAccessibleDatasetSection(
                    job.userId,
                    datasetId,
                    sectionIndex
                );
                job.currentSectionEntries = Array.isArray(section?.entries) ? section.entries : [];
                job.currentEntryIndex = 0;
                job.partialEntryIds = [];
            }

            while (job.status === 'running' && job.currentEntryIndex < job.currentSectionEntries.length) {
                const entry = job.currentSectionEntries[job.currentEntryIndex];
                const sentences = await generateSentencesForEntry(deps, job, entry);
                await persistEntryAnnotation(deps, job, entry, sentences, sectionIndex);

                job.partialEntryIds.push(entry.entryId);
                job.entriesAnnotated += 1;
                job.currentEntryIndex += 1;
            }

            if (job.status !== 'running')
                return;

            const assignmentId = job.assignmentIds[sectionPos];
            await finaliseSection(deps, job, sectionIndex, assignmentId);
            job.sectionsCompleted += 1;
            job.currentSectionEntries = [];
            job.currentEntryIndex = 0;
            job.partialEntryIds = [];
        } catch (caughtError) {
            if (job.status !== 'running')
                return;
            job.status = 'failed';
            job.lastError = describeError(caughtError);
            logWarn(deps, caughtError, `Fallo durante la auto-anotación del dataset ${datasetId}, sección ${sectionIndex}`);
            return;
        }
    }

    if (job.status === 'running')
        job.status = 'completed';
}

/**
 * Asks the LLM to verbalise one entry into Spanish sentences. The number of
 * requested sentences matches `englishSentences.length` (or 1 when the entry
 * has no English reference).
 *
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} job
 * @param {Record<string, any>} entry
 * @returns {Promise<string[]>}
 */
async function generateSentencesForEntry(deps, job, entry) {
    const englishSentences = Array.isArray(entry?.englishSentences) ? entry.englishSentences : [];
    const expectedCount = Math.max(1, englishSentences.length);

    const response = await deps.llmClient.generateJson({
        system: buildGenerationSystemPrompt(expectedCount),
        prompt: buildGenerationUserPrompt(entry, expectedCount),
        providerConfig: job.providerConfig
    });

    const sentences = extractSentencesFromResponse(response, expectedCount);
    if (sentences.length === 0)
        throw new Error('El modelo no devolvió ninguna oración utilizable.');

    return sentences;
}

/**
 * Persists the entry's generated sentences through `spanishService.save`,
 * the same write path the manual flow uses (`replaceForAccessibleEntry`).
 *
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} job
 * @param {Record<string, any>} entry
 * @param {string[]} sentences
 * @param {number} sectionIndex
 * @returns {Promise<void>}
 */
async function persistEntryAnnotation(deps, job, entry, sentences, sectionIndex) {
    const payload = {
        userId: job.userId,
        datasetId: job.datasetId,
        rdfId: entry.entryId,
        sentences: sentences.map((sentence) => ({ sentence }))
    };

    const result = await deps.spanishService.save(payload);
    if (result && result.error)
        throw result.error;
    if (!result || result.ok !== true)
        throw new Error(`No se pudo persistir la entry ${entry.entryId} de la sección ${sectionIndex}.`);
}

/**
 * Closes the current section: marks the specific section assignment as
 * `completed` and advances the dataset's section counters. The auto flow
 * cannot reuse `completeAssignmentIfSectionDone` because that helper picks
 * "the user's first active assignment", which is ambiguous when the user
 * holds N parallel locks (auto-annotation locks every section up front).
 * The job remembers the exact `assignmentId` per section, so we close it
 * directly.
 *
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} job
 * @param {number} sectionIndex
 * @param {number} assignmentId
 * @returns {Promise<void>}
 */
async function finaliseSection(deps, job, sectionIndex, assignmentId) {
    await deps.prismaClient.$transaction(async (/** @type {*} */ tx) => {
        await deps.sectionAssignmentsRepository.updateAssignmentStatus(
            { assignmentId, status: 'completed' },
            tx
        );
        await deps.datasetsRepository.markSectionAsAnnotated(job.datasetId, tx);
    });
}

/**
 * Rolls back the entries already persisted for the **current** (partially
 * annotated) section: deletes the user's annotations for those entries and
 * resets the entries to `pending`, matching `replaceForAccessibleEntry`'s
 * "no sentences left" branch. Sections completed before the failure stay
 * untouched.
 *
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} job
 * @returns {Promise<void>}
 */
async function rollbackPartialSection(deps, job) {
    const eids = Array.isArray(job.partialEntryIds) ? job.partialEntryIds : [];
    if (eids.length === 0)
        return;

    try {
        await deps.prismaClient.$transaction(async (/** @type {*} */ tx) => {
            const entries = await tx.entry.findMany({
                where: { datasetId: job.datasetId, eid: { in: eids } },
                select: { id: true }
            });
            const internalIds = entries.map((/** @type {*} */ row) => row.id);
            if (internalIds.length === 0)
                return;

            await tx.annotation.deleteMany({
                where: {
                    entryId: { in: internalIds },
                    datasetId: job.datasetId,
                    userId: job.userId
                }
            });
            await tx.entry.updateMany({
                where: { id: { in: internalIds } },
                data: { status: ENTRY_PENDING }
            });

            // Account for the partial-section counters: `markSectionAsAnnotated`
            // was never called for this section, so no counter update is needed
            // here. We just need to ensure the entries no longer look annotated.
        });
        job.entriesAnnotated = Math.max(0, job.entriesAnnotated - eids.length);
    } catch (caughtError) {
        logWarn(deps, caughtError, `No se pudieron deshacer las anotaciones parciales del dataset ${job.datasetId}`);
    }
}

/**
 * Releases every assignment of `job` that has not been marked as completed
 * yet (i.e. the current partial section + every section still pending). The
 * sections that completed before the cancel have already moved to
 * `completed`, so they are untouched.
 *
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} job
 * @returns {Promise<void>}
 */
async function releasePendingAssignments(deps, job) {
    const ids = Array.isArray(job.assignmentIds) ? job.assignmentIds : [];
    if (ids.length === 0)
        return;

    try {
        await deps.prismaClient.sectionAssignment.updateMany({
            where: {
                id: { in: ids },
                status: ASSIGNMENT_ACTIVE
            },
            data: { status: ASSIGNMENT_RELEASED }
        });
    } catch (caughtError) {
        logWarn(deps, caughtError, `No se pudieron liberar las asignaciones pendientes del dataset ${job.datasetId}`);
    }
}

/**
 * Returns the `running`/`failed` job owned by `userId`, throwing the
 * canonical service errors when no job exists or when another user owns it.
 *
 * @param {Map<number, Record<string, any>>} jobs
 * @param {number} userId
 * @param {number} datasetId
 * @returns {Record<string, any>}
 */
function requireOwnedJob(jobs, userId, datasetId) {
    const job = jobs.get(datasetId);
    if (!job) {
        throw new ServiceError('No hay anotación automática en curso para este dataset.', {
            status: 404,
            code: 'auto_annotation_not_found'
        });
    }
    if (job.userId !== userId) {
        throw new ServiceError('Solo el usuario que inició la anotación puede modificarla.', {
            status: 403,
            code: 'auto_annotation_not_owner'
        });
    }
    return job;
}

/**
 * Builds the user-facing snapshot of a job (no internals, no providerConfig,
 * no entry payloads).
 *
 * @param {Record<string, any>} job
 * @returns {JobSnapshot}
 */
function snapshotJob(job) {
    const sectionsRequested = Array.isArray(job.sectionIndexes) ? job.sectionIndexes.length : 0;
    const currentSection = job.sectionsCompleted < sectionsRequested
        ? job.sectionIndexes[job.sectionsCompleted]
        : (sectionsRequested > 0 ? job.sectionIndexes[sectionsRequested - 1] : null);

    return {
        hasJob: true,
        status: job.status,
        entriesAnnotated: job.entriesAnnotated,
        totalEntries: job.totalEntries,
        sectionsAnnotated: job.sectionsCompleted,
        sectionsRequested,
        totalSections: job.totalSections,
        currentSection,
        lastError: job.lastError || null
    };
}

/**
 * System prompt for the per-entry generation call.
 *
 * @param {number} expectedCount
 * @returns {string}
 */
function buildGenerationSystemPrompt(expectedCount) {
    return [
        'Eres un anotador experto que genera oraciones en español a partir de triples RDF.',
        'Recibirás un entry RDF (triples y oraciones de referencia en inglés) y debes producir oraciones en español naturales, completas y fieles a los triples.',
        'Cada oración debe verbalizar TODOS los triples del entry; no inventes hechos no presentes.',
        'No mezcles idiomas, no devuelvas explicaciones, no devuelvas listas numeradas.',
        `Debes devolver exactamente ${expectedCount} oración(es) en el campo "sentences".`,
        'Responde SOLO en JSON con este formato exacto:',
        '{"sentences":["...","..."]}'
    ].join('\n');
}

/**
 * User prompt for the per-entry generation call.
 *
 * @param {Record<string, any>} entry
 * @param {number} expectedCount
 * @returns {string}
 */
function buildGenerationUserPrompt(entry, expectedCount) {
    const triples = Array.isArray(entry?.triples) ? entry.triples : [];
    const englishSentences = Array.isArray(entry?.englishSentences) ? entry.englishSentences : [];
    const category = typeof entry?.category === 'string' ? entry.category.trim() : '';
    const entryId = entry?.entryId ?? null;

    const lines = [];
    if (entryId !== null)
        lines.push(`Entry ID: ${entryId}`);
    if (category)
        lines.push(`Categoría: ${category}`);

    lines.push('Triples RDF:');
    if (triples.length === 0) {
        lines.push('(sin triples)');
    } else {
        triples.forEach((triple, index) => {
            lines.push(`${index + 1}. ${triple.subject} | ${triple.predicate} | ${triple.object}`);
        });
    }

    if (englishSentences.length > 0) {
        lines.push('Oraciones de referencia en inglés:');
        englishSentences.forEach((sentence, index) => {
            lines.push(`${index + 1}. ${sentence}`);
        });
    }

    lines.push(`Devuelve exactamente ${expectedCount} oración(es) en español, una por elemento del array "sentences", verbalizando todos los triples anteriores.`);
    return lines.join('\n');
}

/**
 * Extracts the `sentences` array from the LLM response, normalising and
 * trimming. Tolerates `{ sentences: [...] }`, `[ ... ]` and `{ outputs_es: [...] }`.
 *
 * @param {*} response
 * @param {number} expectedCount
 * @returns {string[]}
 */
function extractSentencesFromResponse(response, expectedCount) {
    const candidate = pickArray(response);
    const sentences = candidate
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);

    if (sentences.length === 0)
        return [];

    // Tolerate models that return more sentences than asked for — keep up to
    // `expectedCount` so the persisted shape stays predictable.
    return sentences.slice(0, expectedCount);
}

/**
 * Heuristic for the candidate array of sentences in an LLM response.
 *
 * @param {*} response
 * @returns {Array<*>}
 */
function pickArray(response) {
    if (Array.isArray(response))
        return response;
    if (response && typeof response === 'object') {
        if (Array.isArray(response.sentences))
            return response.sentences;
        if (Array.isArray(response.outputs_es))
            return response.outputs_es;
        if (Array.isArray(response.outputs))
            return response.outputs;
    }
    return [];
}

/**
 * Defensive integer check used by the entry points.
 *
 * @param {*} value
 * @param {string} fieldName
 * @returns {void}
 */
function assertPositiveInteger(value, fieldName) {
    if (!Number.isInteger(value) || value <= 0)
        throw new ServiceError(`El campo ${fieldName} es inválido.`, { status: 400, code: 'invalid_payload' });
}

/**
 * Produces a human-readable description of any thrown value.
 *
 * @param {*} error
 * @returns {string}
 */
function describeError(error) {
    if (!error)
        return 'Error desconocido.';
    if (error instanceof Error && typeof error.message === 'string' && error.message.trim().length > 0)
        return error.message;
    return String(error);
}

/**
 * Logs a warning when a logger is available; otherwise silent.
 *
 * @param {Record<string, any>} deps
 * @param {*} error
 * @param {string} message
 * @returns {void}
 */
function logWarn(deps, error, message) {
    if (!deps.logger || typeof deps.logger.warn !== 'function')
        return;
    const description = describeError(error);
    deps.logger.warn({ error: description }, message);
}

module.exports = {
    createAutoAnnotationService,
    // Exported for unit tests.
    buildGenerationSystemPrompt,
    buildGenerationUserPrompt,
    extractSentencesFromResponse
};
