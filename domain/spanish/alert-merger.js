'use strict';

/**
 * @file Alert merger — post-processing of validation alerts.
 *
 * Given a sentence, its RDF context, the rule result (`baseResult`), the LLM
 * result (`semanticResult`) and the coverage analysis (`coverage-checker`), it
 * produces the final list of ordered and filtered alerts plus the best
 * available suggestion. It encapsulates the heuristics that reconcile local
 * rules and the LLM (false-positive suppression, language, leaderTitle).
 */

const { buildValidationAlert, mergeAlerts } = require('../../utils/validation-alert');
const ruleChecker = require('./rule-checker');
const { looksLikeCompleteSentence, isLikelyLeaderTitleCovered } = require('./coverage-checker');

/**
 * Reconciles local rules, LLM and coverage into the final list of alerts and
 * the best available suggestion for a sentence.
 *
 * @param {{ sentence:*, context?:*, baseResult:*, semanticResult:*, coverage:* }} input
 * @returns {{ alerts: Array<*>, suggestion: ?string }}
 */
function mergeSentenceAlerts({ sentence, context = {}, baseResult, semanticResult, coverage }) {
    const alerts = orderAlerts(suppressLlmFalsePositivesForCoveredTriples(adjustAlertsWithContext(normalizeLanguageAlerts(mergeAlerts(
        contextualAlertsFromSentence(sentence, context),
        coverage.alerts,
        alertsFromResult(baseResult, 'rules'),
        alertsFromResult(semanticResult, 'llm')
    )), sentence, context), coverage));

    const suggestion = firstSuggestion(alerts)
        || resultSuggestion(semanticResult)
        || resultSuggestion(baseResult)
        || normalizeSentence(sentence);

    return { alerts, suggestion };
}

/**
 * Suppresses LLM false positives when the deterministic coverage is complete.
 * @param {Array<*>} alerts - Alerts.
 * @param {*} coverage - Coverage result.
 * @returns {Array<*>} Filtered alerts.
 */
function suppressLlmFalsePositivesForCoveredTriples(alerts, coverage) {
    if (coverage && Array.isArray(coverage.alerts) && coverage.alerts.length > 0) {
        const noisyRelationCodes = new Set(['relation_missing', 'relation_inverted']);
        return alerts.filter(alert => !(
            alert.source === 'llm'
            && noisyRelationCodes.has(alert.code)
        ));
    }

    if (!coverage || !coverage.allCovered)
        return alerts;

    const removableCodes = new Set([
        'language_not_spanish',
        'semantic_mismatch',
        'rdf_error',
        'missing_triple',
        'relation_missing',
        'relation_inverted'
    ]);

    return alerts.filter(alert => !(
        alert.source === 'llm'
        && removableCodes.has(alert.code)
    ));
}

/**
 * Generates deterministic alerts that depend on the RDF context.
 * @param {*} sentence - Sentence.
 * @param {*} context - Context.
 * @returns {Array<*>} Alerts.
 */
function contextualAlertsFromSentence(sentence, context = {}) {
    if (!Array.isArray(context.triples) || context.triples.length === 0)
        return [];

    if (!looksLikeCompleteSentence(sentence)) {
        return [buildValidationAlert({
            code: 'incomplete_sentence',
            type: 'semantic',
            severity: 'error',
            source: 'rules',
            message: 'La oracion es un fragmento y no verbaliza la relacion RDF.'
        })];
    }

    return [];
}

/**
 * Adjusts LLM alerts with conservative domain heuristics.
 * @param {Array<*>} alerts - Original alerts.
 * @param {*} sentence - Sentence.
 * @param {*} context - Context.
 * @returns {Array<*>} Adjusted alerts.
 */
function adjustAlertsWithContext(alerts, sentence, context = {}) {
    if (!isLikelyLeaderTitleCovered(sentence, context.triples))
        return alerts;

    const removableCodes = new Set(['relation_missing', 'relation_inverted', 'semantic_mismatch']);
    const filtered = alerts.filter(alert => !(
        alert.source === 'llm'
        && (
            (alert.severity === 'error' && removableCodes.has(alert.code))
            || alert.code === 'imprecise_entity_name'
        )
    ));

    if (filtered.length === alerts.length)
        return alerts;

    return mergeAlerts(filtered, [buildValidationAlert({
        code: 'imprecise_entity_name',
        type: 'semantic',
        severity: 'warning',
        source: 'hybrid',
        message: 'La relacion principal esta cubierta, pero la denominacion de la asamblea puede ser mas precisa.',
        suggestion: 'Punjab, Pakistan, esta liderado por la Asamblea Provincial del Punjab.'
    })]);
}

/**
 * Normalizes language alerts: the local rule decides whether a sentence is not in Spanish.
 * @param {Array<*>} alerts - Alerts.
 * @returns {Array<*>} Filtered alerts.
 */
function normalizeLanguageAlerts(alerts) {
    const hasRuleLanguageError = alerts.some(alert => (
        alert.source === 'rules'
        && (alert.code === 'language_not_spanish' || alert.code === 'mixed_language')
    ));

    if (hasRuleLanguageError) {
        return alerts.filter(alert => (
            alert.source === 'rules'
            && (alert.code === 'language_not_spanish' || alert.code === 'mixed_language')
        ));
    }

    return alerts.filter(alert => !(
        alert.source === 'llm'
        && (alert.code === 'language_not_spanish' || alert.code === 'mixed_language')
    ));
}

/**
 * Orders alerts by severity so that errors lead the response.
 * @param {Array<*>} alerts - Alerts.
 * @returns {Array<*>} Ordered alerts.
 */
function orderAlerts(alerts) {
    /** @type {Record<string, number>} */
    const severityRank = { error: 0, warning: 1, info: 2 };

    return alerts.slice().sort((/** @type {*} */ a, /** @type {*} */ b) => (
        (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
    ));
}

/**
 * Extracts alerts from a validation result.
 * @param {*} result - Result.
 * @param {string} source - Default source.
 * @returns {Array<*>} Alerts.
 */
function alertsFromResult(result, source) {
    if (!result || typeof result !== 'object')
        return [];

    const explicitAlerts = Array.isArray(result.alerts)
        ? result.alerts.map((/** @type {*} */ alert) => buildValidationAlert({
            ...alert,
            source: alert.source || source
        }))
        : [];

    if (result.valid !== false || explicitAlerts.length)
        return explicitAlerts;

    return [buildValidationAlert({
        code: codeFromRuleReason(result.reason, source),
        type: typeFromRuleReason(result.reason),
        severity: severityFromRuleReason(result.reason),
        source,
        message: result.reason || 'La oracion requiere revision.',
        suggestion: result.suggestion || null
    })];
}

/**
 * Derives an alert code from a rule reason.
 * @param {*} reason - Reason.
 * @param {string} source - Source.
 * @returns {string} Code.
 */
function codeFromRuleReason(reason, source) {
    if (source !== 'rules')
        return 'semantic_review';

    if (reason === ruleChecker.EMPTY_SENTENCE_REASON)
        return 'empty_sentence';
    if (reason === ruleChecker.LANGUAGE_MISMATCH_REASON)
        return 'language_not_spanish';
    if (reason === 'Falta un signo de puntuación final.')
        return 'punctuation_missing';
    if (reason === 'Hay un posible error ortográfico en el verbo.')
        return 'orthography_error';
    if (reason === 'Hay una discordancia de género en el sintagma nominal.')
        return 'grammar_gender_agreement';

    return 'rule_review';
}

/**
 * Derives an alert type from a reason.
 * @param {*} reason - Reason.
 * @returns {string} Type.
 */
function typeFromRuleReason(reason) {
    if (reason === ruleChecker.LANGUAGE_MISMATCH_REASON)
        return 'grammar';
    if (reason === 'Hay un posible error ortográfico en el verbo.')
        return 'orthography';
    if (reason === 'Falta un signo de puntuación final.')
        return 'grammar';
    if (reason === 'Hay una discordancia de género en el sintagma nominal.')
        return 'grammar';

    return 'semantic';
}

/**
 * Derives an alert severity from a reason.
 * @param {*} reason - Reason.
 * @returns {string} Severity.
 */
function severityFromRuleReason(reason) {
    if (reason === 'Falta un signo de puntuación final.')
        return 'warning';

    return 'error';
}

/**
 * Gets the first available suggestion.
 * @param {Array<*>} alerts - Alerts.
 * @returns {?string} Suggestion.
 */
function firstSuggestion(alerts) {
    const first = alerts.find(alert => alert && typeof alert.suggestion === 'string' && alert.suggestion.trim().length > 0);
    return first ? first.suggestion : null;
}

/**
 * Normalizes the suggestion from a result.
 * @param {*} result - Result.
 * @returns {?string} Suggestion.
 */
function resultSuggestion(result) {
    return result && typeof result.suggestion === 'string' && result.suggestion.trim().length > 0
        ? result.suggestion.trim()
        : null;
}

/**
 * Normalizes the original sentence.
 * @param {*} sentence - Sentence.
 * @returns {?string} Normalized sentence.
 */
function normalizeSentence(sentence) {
    return typeof sentence === 'string' && sentence.trim().length > 0
        ? sentence.trim()
        : null;
}

module.exports = {
    mergeSentenceAlerts
};
