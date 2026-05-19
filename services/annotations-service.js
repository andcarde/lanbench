'use strict';

/**
 * @file Annotations service — punto unico de validacion y persistencia de
 * anotaciones.
 *
 * Encapsula:
 *   - `checkSentences`: orquesta la validacion LLM/reglas via
 *     {@link createSpanishService} y normaliza los resultados al DTO canonico.
 *   - `saveAnnotation`: persiste las oraciones del usuario, marca la entry
 *     como `annotated` y coordina la transicion de seccion.
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
 */

const { createSpanishService } = require('../domain/spanish/spanish-service');
const {
    mapSavedAnnotationDTO,
    mapSentenceValidationDTOs
} = require('../contracts/dto-mappers');
const { buildValidationAlert } = require('../utils/validation-alert');
const { resolveMessage } = require('../constants/validation-codes');

/**
 * Construye el servicio de anotaciones con sus dependencias inyectables.
 *
 * @param {AnnotationsServiceDeps} [dependencies]
 */
function createAnnotationsService({
    spanishService,
    sectionAssignmentsRepository,
    sectionAssignmentService,
    datasetsRepository,
    continueDatasetService
} = {}) {
    const deps = {
        spanishService: spanishService || createSpanishService(),
        sectionAssignmentsRepository: sectionAssignmentsRepository || null,
        sectionAssignmentService: sectionAssignmentService || null,
        datasetsRepository: datasetsRepository || null,
        continueDatasetService: continueDatasetService || null
    };

    /**
     * Valida un conjunto de oraciones contra el contexto de la entry.
     * Usa `checkBatch` cuando el spanishService lo soporta, o `check` por
     * oracion como fallback. Inyecta alertas de duplicado entre oraciones
     * del mismo envio.
     *
     * @param {string[]} sentences
     * @param {EntryContextDTO|null|undefined} entryContext
     * @returns {Promise<SentenceValidationDTO[]>}
     */
    async function checkSentences(sentences, entryContext) {
        /** @type {any} */
        let normalizedResults;

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
     * Persiste una serie de oraciones y orquesta los efectos posteriores de
     * seccion/sesion.
     *
     * Boundaries:
     *   (a) persistir la anotacion;
     *   (b) avanzar la sesion activa;
     *   (c) completar la asignacion de seccion y los contadores del
     *       dataset cuando aplique.
     *
     * @param {{
     *   userId:number,
     *   datasetId:number,
     *   rdfId:number,
     *   sentences: Array<*>,
     *   rejectionReasons: Array<string|null>,
     *   sectionNumber?: number|null,
     *   isLastEntry?: boolean|null
     * }} input
     * @returns {Promise<SavedAnnotationDTO>}
     */
    async function saveSentences({ userId, datasetId, rdfId, sentences, rejectionReasons, sectionNumber, isLastEntry }) {
        await ensureAssignmentForSection(deps, { userId, datasetId, sectionNumber });

        await persistAnnotation(deps, { userId, datasetId, rdfId, sentences, rejectionReasons });

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
            sentences,
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
 * Verifica que la seccion solicitada coincide con la asignacion activa del
 * usuario en el dataset. Si no hay `sectionAssignmentsRepository` o no se
 * indica `sectionNumber`, no se aplica esta restriccion.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, sectionNumber?: number|null }} input
 * @returns {Promise<void>}
 * @throws {Error} `'Seccion no asignada al usuario.'` si no coincide.
 */
async function ensureAssignmentForSection(deps, { userId, datasetId, sectionNumber }) {
    if (!deps.sectionAssignmentsRepository || !sectionNumber)
        return;

    const assignment = await deps.sectionAssignmentsRepository.findActiveAssignment({ userId, datasetId });
    if (!assignment || assignment.sectionIndex !== sectionNumber)
        throw new Error('Seccion no asignada al usuario.');
}

/**
 * Persiste la anotacion mediante `spanishService.save` y propaga errores de
 * dominio (`result.error`).
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, rdfId:number, sentences: Array<Record<string, any>>, rejectionReasons: Array<string|null> }} input
 * @returns {Promise<void>}
 */
async function persistAnnotation(deps, { userId, datasetId, rdfId, sentences, rejectionReasons }) {
    const result = await deps.spanishService.save({
        userId,
        datasetId,
        rdfId,
        sentences,
        rejectionReasons
    });

    if (result && typeof result === 'object' && result.error)
        throw result.error;
}

/**
 * Avanza la sesion activa cuando el `continueDatasetService` lo soporta.
 * Si la sesion no esta activa (`no_active_session`), devuelve `null` sin
 * propagar el error.
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
 * Decide si la seccion debe marcarse como completada en este turno.
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
 * Completa la asignacion de seccion y los contadores del dataset cuando
 * corresponde. Unico punto que muta `sectionAssignments` + `datasetsRepository`
 * desde este servicio.
 *
 * @param {Record<string, any>} deps
 * @param {{ userId:number, datasetId:number, sectionNumber?: number|null, shouldFinalizeSection: boolean }} input
 * @returns {Promise<boolean>}
 */
async function finalizeSectionIfRequested(deps, { userId, datasetId, sectionNumber, shouldFinalizeSection }) {
    if (!sectionNumber)
        return false;

    let completed = false;

    if (deps.sectionAssignmentService && typeof deps.sectionAssignmentService.completeAssignmentIfSectionDone === 'function') {
        completed = await deps.sectionAssignmentService.completeAssignmentIfSectionDone({
            userId,
            datasetId,
            sectionIndex: sectionNumber
        }).catch(() => false);
    }

    if (shouldFinalizeSection && deps.datasetsRepository && datasetId) {
        await deps.datasetsRepository.markSectionAsAnnotated(datasetId);
        completed = true;
    }

    return completed;
}

/**
 * Normaliza el resultado bruto de `spanishService.check` a la forma esperada
 * por el mapper canonico.
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
 * Construye el contexto auxiliar entregado al spanishService cuando se
 * validan oraciones una a una.
 *
 * @param {Record<string, any>|null} entryContext
 * @param {number} sentenceIndex
 * @returns {Record<string, any>}
 */
function buildSentenceContext(entryContext, sentenceIndex) {
    if (!entryContext)
        return {};

    return {
        eid: entryContext.entryId ?? entryContext.eid,
        category: entryContext.category,
        triples: entryContext.triples,
        referenceSentence: (entryContext.englishSentences || entryContext.sourceSentences || [])[sentenceIndex] || null
    };
}

/**
 * Inyecta una alerta `repeated_sentence` en los resultados cuyas oraciones
 * ya aparecen en `previousSentences` del contexto. La comparacion es
 * case-insensitive y `trim()`-eada.
 *
 * @param {string[]} sentences
 * @param {Array<Record<string, any>>} results - Mutado en sitio (push de alerta).
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
