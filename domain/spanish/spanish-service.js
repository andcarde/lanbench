'use strict';

/**
 * @file Spanish service — composition of the two-pass validation
 * (`rule-checker` + LLM via `ollama-spanish-checker`) and annotation
 * persistence.
 *
 * The `check` flow first applies the local rules (fast and deterministic)
 * and, if the sentence passes them, queries the LLM for the more expensive
 * semantic/grammatical validation.
 *
 * @typedef {Object} SpanishServiceDeps
 * @property {Record<string, any>} [ruleBasedChecker]
 * @property {Record<string, any>} [semanticChecker]
 * @property {Record<string, any>} [annotationsRepository]
 * @property {Record<string, any>} [logger]
 */

const ruleChecker = require('./rule-checker');
const ollamaSpanishChecker = require('./ollama-spanish-checker');
const coverageChecker = require('./coverage-checker');
const alertMerger = require('./alert-merger');
const { createAnnotationsRepository } = require('../../repositories/annotations-repository');
const { ServiceError } = require('../../services/service-error');
const { toPositiveInteger, trimmedOr } = require('../../utils/validators');

/**
 * Builds the Spanish validation/persistence service.
 *
 * @param {SpanishServiceDeps} [dependencies]
 */
function createSpanishService({
    ruleBasedChecker,
    semanticChecker,
    annotationsRepository,
    logger
} = {}) {
    const deps = {
        ruleBasedChecker: ruleBasedChecker || ruleChecker,
        semanticChecker: semanticChecker || ollamaSpanishChecker,
        annotationsRepository: annotationsRepository || createAnnotationsRepository(),
        logger
    };

    /**
     * Validates a sentence against the local rules and, if it passes, against the semantic checker.
     * @param {*} sentence - Candidate sentence.
     * @param {*} [context] - RDF context and references.
     * @returns {Promise<*>} Merged validation result.
     */
    async function check(sentence, context = {}) {
        const baseResult = deps.ruleBasedChecker.check(sentence);
        if (deps.ruleBasedChecker.isImmediateFailure(baseResult))
            return baseResult;

        try {
            return await deps.semanticChecker.check(sentence, context);
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            logSemanticFallback(error, deps.logger);
            return baseResult;
        }
    }

    /**
     * Checks a batch of sentences against the same entry context.
     * @param {Array<*>} sentences - Candidate sentences.
     * @param {*} context - RDF context and references.
     * @returns {Promise<Array<*>>} Results by index.
     */
    async function checkBatch(sentences, context = {}) {
        const normalizedSentences = Array.isArray(sentences) ? sentences : [];
        const baseResults = normalizedSentences.map(sentence => deps.ruleBasedChecker.check(sentence));

        if (!normalizedSentences.length)
            return [];

        // Capability probe: the semantic checker may or may not implement
        // checkBatch. When absent, fall back to per-sentence check() calls.
        if (deps.semanticChecker && typeof deps.semanticChecker.checkBatch === 'function') {
            try {
                const semanticResults = await deps.semanticChecker.checkBatch(normalizedSentences, context);
                const mergedResults = mergeBatchResults(normalizedSentences, baseResults, semanticResults, context);
                return await attachCorrectionProposals({
                    sentences: normalizedSentences,
                    results: mergedResults,
                    context,
                    semanticChecker: deps.semanticChecker,
                    logger: deps.logger
                });
            } catch (caughtError) {
                const error = /** @type {any} */ (caughtError);
                logSemanticFallback(error, deps.logger);
                return baseResults;
            }
        }

        return Promise.all(normalizedSentences.map((sentence, index) => (
            check(sentence, buildSingleSentenceContext(context, index))
        )));
    }

    /**
     * Persists a batch of sentences for an entry, replacing previous rows.
     * @param {{ userId:number, datasetId:number, rdfId:number, sentences:Array<{sentence:string, rejectionReason?:string|null}> }} payload
     * @returns {Promise<{ ok:boolean, datasetId:number, rdfId:number, savedCount:number }>}
     */
    async function save(payload) {
        const normalizedPayload = normalizeSavePayload(payload);

        const persisted = await deps.annotationsRepository.replaceForAccessibleEntry({
            userId: normalizedPayload.userId,
            datasetId: normalizedPayload.datasetId,
            eid: normalizedPayload.rdfId,
            sentences: normalizedPayload.sentences
        });

        if (!persisted) {
            throw new ServiceError('La entry solicitada no existe o no es accesible para el usuario.', {
                status: 404,
                code: 'annotation_entry_not_found'
            });
        }

        return {
            ok: true,
            datasetId: /** @type {number} */ (normalizedPayload.datasetId),
            rdfId: /** @type {number} */ (normalizedPayload.rdfId),
            savedCount: persisted.savedCount
        };
    }

    return {
        check,
        checkBatch,
        save
    };
}

/**
 * Logs semantic checker failures when degrading to local rules.
 * @param {*} error - Caught error.
 * @param {*} logger - Optional logger.
 * @returns {void}
 */
function logSemanticFallback(error, logger) {
    if (!logger || typeof logger.warn !== 'function')
        return;

    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Semantic checker failed; using rule-based fallback.');
}

/**
 * Merges local rules with per-batch semantic validations.
 * @param {Array<*>} sentences - Original sentences.
 * @param {Array<*>} baseResults - Rule results.
 * @param {Array<*>} semanticResults - Semantic results.
 * @returns {Array<*>} Merged results.
 */
function mergeBatchResults(sentences, baseResults, semanticResults, /** @type {*} */ context = {}) {
    return sentences.map((sentence, index) => {
        const baseResult = baseResults[index] || { valid: true, reason: null, suggestion: null };
        const semanticResult = Array.isArray(semanticResults) && semanticResults[index]
            ? semanticResults[index]
            : null;
        const coverage = coverageChecker.evaluateKnownTripleCoverage(sentence, context.triples);
        const { alerts, suggestion } = alertMerger.mergeSentenceAlerts({
            sentence,
            context,
            baseResult,
            semanticResult,
            coverage
        });

        if (!semanticResult && !alerts.length)
            return baseResult;

        if (!alerts.length) {
            return {
                valid: true,
                reason: null,
                suggestion: null
            };
        }

        return {
            valid: false,
            reason: alerts[0].message,
            suggestion,
            alerts
        };
    });
}

/**
 * Adds LLM-generated correction proposals for semantic rejections.
 * @param {*} options - Validation data.
 * @returns {Promise<Array<*>>} Results with a proposal where applicable.
 */
async function attachCorrectionProposals({
    sentences,
    results,
    context,
    semanticChecker,
    logger
}) {
    if (!semanticChecker || typeof semanticChecker.proposeCorrectionsBatch !== 'function')
        return results;

    const proposalTargets = results.map((/** @type {*} */ result) => (
        shouldRequestLlmProposal(result)
            ? result
            : { ...result, valid: true }
    ));

    if (!proposalTargets.some((/** @type {*} */ result) => result.valid === false))
        return results;

    try {
        const proposals = await semanticChecker.proposeCorrectionsBatch(sentences, context, proposalTargets);
        return results.map((/** @type {*} */ result, /** @type {*} */ index) => {
            const proposal = normalizeProposal(proposals && proposals[index]);
            return proposal ? { ...result, proposal } : result;
        });
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        logSemanticFallback(error, logger);
        return results;
    }
}

/**
 * Decides whether a rejected validation comes from Ollama and needs a proposal.
 * @param {*} result - Merged result.
 * @returns {boolean} True if a proposal should be requested.
 */
function shouldRequestLlmProposal(result) {
    if (!result || result.valid !== false || !Array.isArray(result.alerts))
        return false;

    return result.alerts.some((/** @type {*} */ alert) => (
        alert
        && alert.source === 'llm'
        && alert.code !== 'llm_missing_validation'
        && (alert.severity === 'error' || alert.severity === 'warning')
    ));
}

/**
 * Normalizes a proposal to attach it to the result.
 * @param {*} value - Value returned by the LLM.
 * @returns {?string} Proposal.
 */
function normalizeProposal(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds context for checkers that validate only one sentence.
 * @param {*} context - Entry context.
 * @param {number} sentenceIndex - Index.
 * @returns {*} Individual context.
 */
function buildSingleSentenceContext(context, sentenceIndex) {
    const safeContext = context || {};
    const englishSentences = Array.isArray(safeContext.englishSentences)
        ? safeContext.englishSentences
        : [];

    return {
        ...safeContext,
        referenceSentence: englishSentences[sentenceIndex] || safeContext.referenceSentence || null
    };
}

/**
 * Normalizes the save payload to the canonical format. Expects the canonical
 * shape `sentences: [{ sentence, rejectionReason? }]`.
 *
 * @param {{ userId?:*, datasetId?:*, rdfId?:*, sentences:Array<{sentence?:*, rejectionReason?:*}> }} payload
 * @returns {{ userId:?number, datasetId:?number, rdfId:?number, sentences:Array<{sentenceIndex:number, sentence:string, rejectionReason:?string}> }}
 */
function normalizeSavePayload(payload) {
    const items = payload && Array.isArray(payload.sentences) ? payload.sentences : [];

    return {
        userId: toPositiveInteger(payload?.userId),
        datasetId: toPositiveInteger(payload?.datasetId),
        rdfId: toPositiveInteger(payload?.rdfId),
        sentences: items.map((/** @type {*} */ item, /** @type {*} */ index) => ({
            sentenceIndex: index,
            sentence: typeof item?.sentence === 'string' ? item.sentence : '',
            rejectionReason: trimmedOr(item?.rejectionReason)
        }))
    };
}

module.exports = {
    createSpanishService
};
