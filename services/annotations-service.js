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
 * @property {Record<string, any>} [prismaClient]
 */

const { createSpanishService } = require('../domain/spanish/spanish-service');
const {
    mapSavedAnnotationDTO,
    mapSentenceValidationDTOs
} = require('../contracts/dto-mappers');
const { buildValidationAlert } = require('../utils/validation-alert');
const { resolveMessage } = require('../constants/validation-codes');
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
    prismaClient
} = {}) {
    const deps = {
        spanishService: spanishService || createSpanishService(),
        sectionAssignmentsRepository: sectionAssignmentsRepository || null,
        sectionAssignmentService: sectionAssignmentService || null,
        datasetsRepository: datasetsRepository || null,
        continueDatasetService: continueDatasetService || null,
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
     * @returns {Promise<SentenceValidationDTO[]>}
     */
    async function checkSentences(sentences, entryContext) {
        /** @type {any} */
        let normalizedResults;

        // Capability probe: spanishService may or may not implement checkBatch.
        // When absent, fall back to N individual check() calls.
        if (deps.spanishService && typeof deps.spanishService.checkBatch === 'function') {
            const results = await deps.spanishService.checkBatch(sentences, entryContext || /** @type {*} */ ({}));
            normalizedResults = (Array.isArray(results) ? results : []).map(normalizeCheckResult);
        } else {
            /** @type {any[]} */
            const validations = [];
            for (const [index, sentence] of sentences.entries()) {
                const result = await deps.spanishService.check(
                    sentence,
                    buildSentenceContext(entryContext || null, index)
                );
                validations.push(normalizeCheckResult(result));
            }
            normalizedResults = validations;
        }

        injectDuplicateAlerts(sentences, normalizedResults, entryContext);
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
     *   isLastEntry?: boolean|null
     * }} input
     * @returns {Promise<SavedAnnotationDTO>}
     */
    async function saveSentences({ userId, datasetId, rdfId, sentences, sectionNumber, isLastEntry }) {
        await ensureAssignmentForSection(deps, { userId, datasetId, sectionNumber });

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

    return {
        entryId: entryContext.entryId,
        category: entryContext.category,
        triples: entryContext.triples,
        referenceSentence: (entryContext.englishSentences || [])[sentenceIndex] || null
    };
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
