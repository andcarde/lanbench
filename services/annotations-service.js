'use strict';

/**
 * @file Annotations service — single point of validation and persistence of
 * annotations.
 *
 * It encapsulates:
 *   - `checkSentences`: orchestrates the LLM/rule validation via
 *     {@link createSpanishService} and normalizes the results to the canonical DTO.
 *   - `saveAnnotation`: persists the user's sentences, marks the entry as
 *     `annotated` and coordinates the section transition.
 *
 * @typedef {import('../types/typedefs').SentenceValidationDTO} SentenceValidationDTO
 * @typedef {import('../types/typedefs').SavedAnnotationDTO}    SavedAnnotationDTO
 * @typedef {import('../types/typedefs').EntryContextDTO}       EntryContextDTO
 *
 * @typedef {Object} AnnotationsServiceDeps
 * @property {Record<string, any>} [spanishService]
 * @property {Record<string, any>} [sectionAssignmentsRepository]
 * @property {Record<string, any>} [sectionAssignmentService]
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [continueDatasetService]
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [datasetLlmCredentialsService]
 * @property {Record<string, any>} [logger]
 * @property {Record<string, any>} [prismaClient]
 */

const { createSpanishService } = require('../domain/spanish/spanish-service');
const {
    mapSavedAnnotationDTO,
    mapSentenceValidationDTOs
} = require('../contracts/dto-mappers');
const { buildValidationAlert } = require('../utils/validation-alert');
const { resolveMessage } = require('../constants/validation-codes');
const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetLlmCredentialsService } = require('./dataset-llm-credentials-service');
const { ServiceError } = require('./service-error');
const { toPositiveInteger } = require('../utils/validators');
const defaultPrisma = require('../prisma/client');

/**
 * Builds the annotations service with its injectable dependencies.
 *
 * @param {AnnotationsServiceDeps} [dependencies]
 */
function createAnnotationsService({
    spanishService,
    sectionAssignmentsRepository,
    sectionAssignmentService,
    datasetsRepository,
    continueDatasetService,
    datasetsPermissionsRepository,
    datasetLlmCredentialsService,
    logger,
    prismaClient
} = {}) {
    const deps = {
        spanishService: spanishService || createSpanishService(),
        sectionAssignmentsRepository: sectionAssignmentsRepository || null,
        sectionAssignmentService: sectionAssignmentService || null,
        datasetsRepository: datasetsRepository || null,
        continueDatasetService: continueDatasetService || null,
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        datasetLlmCredentialsService: datasetLlmCredentialsService || createDatasetLlmCredentialsService(),
        logger: logger || null,
        prismaClient: prismaClient || defaultPrisma
    };

    /**
     * Validates a set of sentences against the entry context. Uses
     * `checkBatch` when the spanishService supports it, or `check` per sentence
     * as a fallback. Injects duplicate alerts among sentences of the same
     * submission.
     *
     * @param {string[]} sentences
     * @param {EntryContextDTO|null|undefined} entryContext
     * @param {{ userId?: number|null, datasetId?: number|null }} [options] - When `datasetId` is given, the dataset's active AI credential is resolved (after validating the user's access) and threaded down to the LLM client (US-31).
     * @returns {Promise<SentenceValidationDTO[]>}
     */
    async function checkSentences(sentences, entryContext, options = {}) {
        const providerConfig = await resolveCheckProviderConfig(deps, options);
        const checkContext = providerConfig
            ? { ...(entryContext || {}), providerConfig }
            : entryContext;

        /** @type {any} */
        let normalizedResults;

        // Capability probe: spanishService may or may not implement checkBatch.
        // When absent, fall back to N individual check() calls.
        if (deps.spanishService && typeof deps.spanishService.checkBatch === 'function') {
            const results = await deps.spanishService.checkBatch(sentences, checkContext || /** @type {*} */ ({}));
            normalizedResults = (Array.isArray(results) ? results : []).map(normalizeCheckResult);
        } else {
            /** @type {any[]} */
            const validations = [];
            for (const [index, sentence] of sentences.entries()) {
                const result = await deps.spanishService.check(
                    sentence,
                    buildSentenceContext(checkContext || null, index)
                );
                validations.push(normalizeCheckResult(result));
            }
            normalizedResults = validations;
        }

        injectDuplicateAlerts(sentences, normalizedResults, checkContext);
        return mapSentenceValidationDTOs(sentences, normalizedResults);
    }

    /**
     * Persists a series of sentences and orchestrates the subsequent
     * section/session effects.
     *
     * Boundaries:
     *   (a) persist the annotation;
     *   (b) advance the active session;
     *   (c) complete the section assignment and the dataset counters when
     *       applicable.
     *
     * @param {{
     *   userId:number,
     *   datasetId:number,
     *   rdfId:number,
     *   sentences: Array<{sentence:string, rejectionReason?:string|null}>,
     *   sectionNumber?: number|null,
     *   isLastEntry?: boolean|null,
     *   timeSpentSeconds?: number
     * }} input
     * @returns {Promise<SavedAnnotationDTO>}
     */
    async function saveSentences({ userId, datasetId, rdfId, sentences, sectionNumber, isLastEntry, timeSpentSeconds = 0 }) {
        await ensureAssignmentForSection(deps, { userId, datasetId, sectionNumber });

        await recordAnnotationTime(deps, { userId, datasetId, timeSpentSeconds });

        await persistAnnotation(deps, { userId, datasetId, rdfId, sentences });

        const sessionAdvance = await advanceActiveSessionIfAvailable(deps, { userId, datasetId });
        const shouldFinalizeSection = decideSectionFinalization(sessionAdvance, isLastEntry);

        const sectionCompleted = await finalizeSectionIfRequested(deps, {
            userId,
            datasetId,
            sectionNumber,
            shouldFinalizeSection
        });

        return mapSavedAnnotationDTO({
            entryId: rdfId,
            datasetId,
            sentences: sentences.map((/** @type {*} */ item) => item.sentence),
            savedAt: new Date().toISOString(),
            sectionCompleted,
            sessionAdvance
        });
    }

    return {
        checkSentences,
        saveSentences
    };
}

/**
 * Verifies that the requested section matches the user's active assignment in
 * the dataset. If there is no `sectionAssignmentsRepository` or no
 * `sectionNumber` is given, this restriction is not applied.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, sectionNumber?: number|null }} input
 * @returns {Promise<void>}
 * @throws {Error} `'Seccion no asignada al usuario.'` if it does not match.
 */
async function ensureAssignmentForSection(deps, { userId, datasetId, sectionNumber }) {
    if (!deps.sectionAssignmentsRepository || !sectionNumber)
        return;

    const assignment = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
    if (!assignment || assignment.sectionIndex !== sectionNumber)
        throw new Error('Seccion no asignada al usuario.');
}

/**
 * Accumulates the time the user spent annotating onto their active section
 * assignment, the source of the annotation-time statistics (US-14, US-21). A
 * no-op when there is no repository or no positive time. Clamped to the
 * assignment reservation window so a bad client value cannot poison the metric.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, timeSpentSeconds:number }} input
 * @returns {Promise<void>}
 */
async function recordAnnotationTime(deps, { userId, datasetId, timeSpentSeconds }) {
    const repository = deps.sectionAssignmentsRepository;
    if (!repository || typeof repository.addTimeToActiveAssignment !== 'function')
        return;

    const seconds = Math.floor(Number(timeSpentSeconds));
    if (!Number.isFinite(seconds) || seconds <= 0)
        return;

    const cap = 2 * 60 * 60; // a single send cannot exceed the 2-hour reservation window
    await repository.addTimeToActiveAssignment({
        userId,
        datasetId,
        seconds: Math.min(seconds, cap)
    });
}

/**
 * Persists the annotation via `spanishService.save` and propagates domain
 * errors (`result.error`).
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, rdfId:number, sentences: Array<{sentence:string, rejectionReason?:string|null}> }} input
 * @returns {Promise<void>}
 */
async function persistAnnotation(deps, { userId, datasetId, rdfId, sentences }) {
    const result = await deps.spanishService.save({
        userId,
        datasetId,
        rdfId,
        sentences
    });

    if (result && typeof result === 'object' && result.error)
        throw result.error;
}

/**
 * Advances the active session when the `continueDatasetService` supports it.
 * If the session is not active (`no_active_session`), returns `null` without
 * propagating the error.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number }} input
 * @returns {Promise<Record<string, any>|null>}
 */
async function advanceActiveSessionIfAvailable(deps, { userId, datasetId }) {
    const service = deps.continueDatasetService;
    if (!service || typeof service.advanceSession !== 'function')
        return null;

    try {
        return await service.advanceSession(userId, datasetId);
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        if (error && error.code === 'no_active_session')
            return null;
        throw error;
    }
}

/**
 * Decides whether the section should be marked as completed in this turn.
 *
 * @param {Record<string, any>|null} sessionAdvance
 * @param {boolean|null|undefined} isLastEntry
 * @returns {boolean}
 */
function decideSectionFinalization(sessionAdvance, isLastEntry) {
    if (sessionAdvance)
        return Boolean(sessionAdvance.sectionDone);
    return Boolean(isLastEntry);
}

/**
 * Completes the section assignment and the dataset counters when appropriate.
 * The only point that mutates `sectionAssignments` + `datasetsRepository` from
 * this service.
 *
 * Both writes (closing the assignment + updating the dataset's denormalized
 * counters) run inside a single `prisma.$transaction` so they cannot be
 * applied partially: either both commit or both roll back. A failure is
 * propagated (no longer silenced with `.catch`) so the transaction rolls back.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, sectionNumber?: number|null, shouldFinalizeSection: boolean }} input
 * @returns {Promise<boolean>}
 */
async function finalizeSectionIfRequested(deps, { userId, datasetId, sectionNumber, shouldFinalizeSection }) {
    if (!sectionNumber)
        return false;

    return deps.prismaClient.$transaction(async (/** @type {*} */ tx) => {
        let completed = false;

        if (deps.sectionAssignmentService) {
            completed = await deps.sectionAssignmentService.completeAssignmentIfSectionDone({
                userId,
                datasetId,
                sectionIndex: sectionNumber,
                tx
            });
        }

        if (shouldFinalizeSection && deps.datasetsRepository && datasetId) {
            await deps.datasetsRepository.markSectionAsAnnotated(datasetId, tx);
            completed = true;
        }

        return completed;
    });
}

/**
 * Normalizes the raw result of `spanishService.check` to the shape expected
 * by the canonical mapper.
 *
 * @param {Record<string, any>|null|undefined} result
 * @returns {Record<string, any>}
 */
function normalizeCheckResult(result) {
    if (!result || typeof result !== 'object')
        return { valid: true, reason: null, suggestion: null };

    return {
        valid: Boolean(result.valid),
        reason: result.reason || null,
        suggestion: result.suggestion || null,
        proposal: result.proposal || null,
        alerts: Array.isArray(result.alerts) ? result.alerts : []
    };
}

/**
 * Builds the auxiliary context handed to the spanishService when sentences are
 * validated one by one.
 *
 * @param {Record<string, any>|null} entryContext
 * @param {number} sentenceIndex
 * @returns {Record<string, any>}
 */
function buildSentenceContext(entryContext, sentenceIndex) {
    if (!entryContext)
        return {};

    /** @type {Record<string, any>} */
    const context = {
        entryId: entryContext.entryId,
        category: entryContext.category,
        triples: entryContext.triples,
        referenceSentence: (entryContext.englishSentences || [])[sentenceIndex] || null
    };

    if (entryContext.providerConfig)
        context.providerConfig = entryContext.providerConfig;

    return context;
}

/**
 * Resolves the dataset's active AI `providerConfig` for a `/check` call (US-31).
 * Returns `null` when no `datasetId` is given (legacy global behaviour) or when
 * the dataset has no active credential. When a `datasetId` is given, the user's
 * access is validated first so a foreign dataset's key is never used.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId?: number|null, datasetId?: number|null }} options
 * @returns {Promise<Record<string, any>|null>}
 */
async function resolveCheckProviderConfig(deps, options) {
    const datasetId = toPositiveInteger(options?.datasetId);
    if (!datasetId)
        return null;

    const userId = toPositiveInteger(options?.userId);
    if (!userId)
        throw new ServiceError('Sesión no válida.', { status: 401, code: 'unauthenticated' });

    await assertDatasetAccess(deps, { userId, datasetId });

    const service = deps.datasetLlmCredentialsService;
    if (!service || typeof service.resolveActiveProviderConfig !== 'function')
        return null;

    try {
        return await service.resolveActiveProviderConfig(datasetId);
    } catch (caughtError) {
        // Degrade to the global provider if the credential cannot be resolved
        // (e.g. credentials table not yet migrated, or a decrypt failure)
        // instead of breaking the annotation /check flow. The admin "check"
        // action surfaces such errors explicitly; here annotation must not stop.
        logProviderConfigFallback(deps, caughtError);
        return null;
    }
}

/**
 * Logs (when a logger is available) that the active credential could not be
 * resolved and the global provider is being used instead.
 *
 * @param {Record<string, any>} deps
 * @param {*} error - Caught error.
 * @returns {void}
 */
function logProviderConfigFallback(deps, error) {
    if (!deps.logger || typeof deps.logger.warn !== 'function')
        return;

    const message = error instanceof Error ? error.message : String(error);
    deps.logger.warn({ error: message }, 'Could not resolve dataset AI credential; using the global provider.');
}

/**
 * Validates that the user has any `Permit` over the dataset before its
 * credential is read/used. Throws `404 dataset_not_found` otherwise (no leak
 * about dataset existence). A no-op if no permissions repository is available.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number }} input
 * @returns {Promise<void>}
 */
async function assertDatasetAccess(deps, { userId, datasetId }) {
    const repo = deps.datasetsPermissionsRepository;
    if (!repo || typeof repo.findPermitForUser !== 'function')
        return;

    const permit = await repo.findPermitForUser({ datasetId, userId });
    if (!permit)
        throw ServiceError.datasetNotFound();
}

/**
 * Injects a `repeated_sentence` alert into the results whose sentences already
 * appear in the context's `previousSentences`. The comparison is
 * case-insensitive and `trim()`-ed.
 *
 * @param {string[]} sentences
 * @param {Array<Record<string, any>>} results - Mutated in place (alert push).
 * @param {Record<string, any>|null|undefined} entryContext
 * @returns {void}
 */
function injectDuplicateAlerts(sentences, results, entryContext) {
    const previous = Array.isArray(entryContext?.previousSentences)
        ? entryContext.previousSentences
        : [];

    if (previous.length === 0)
        return;

    const normalizedPrevious = new Set(
        previous
            .filter((/** @type {*} */ sentence) => typeof sentence === 'string')
            .map((/** @type {*} */ sentence) => sentence.trim().toLowerCase())
            .filter(Boolean)
    );

    sentences.forEach((sentence, index) => {
        const normalized = typeof sentence === 'string' ? sentence.trim().toLowerCase() : '';
        if (!normalized || !normalizedPrevious.has(normalized))
            return;

        const result = results[index];
        if (!result)
            return;

        result.alerts = Array.isArray(result.alerts) ? result.alerts : [];
        result.alerts.push(buildValidationAlert({
            code: 'repeated_sentence',
            type: 'diversity',
            severity: 'duplicate',
            source: 'rules',
            message: resolveMessage('repeated_sentence', null)
        }));
    });
}

module.exports = {
    createAnnotationsService,
    injectDuplicateAlerts
};
