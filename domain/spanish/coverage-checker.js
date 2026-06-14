'use strict';

/**
 * @file Coverage checker — deterministic linguistic analysis of whether a
 * Spanish sentence verbalizes the entry's RDF triples.
 *
 * It isolates from the orchestrator (`spanish-service`) all the coverage
 * heuristics: text normalization/tokenization, entity aliases (via `lexicon`),
 * complete-sentence detection and coverage per known predicate. It has no
 * state or I/O; it is pure and deterministic.
 */

const { buildValidationAlert } = require('../../utils/validation-alert');
const {
    ENTITY_ALIASES,
    PREDICATE_RELATION_PATTERNS,
    COMPLETE_SENTENCE_MARKERS
} = require('./lexicon');

/**
 * Evaluates deterministic coverage for frequent predicates.
 * @param {*} sentence - Sentence.
 * @param {*} triples - Triples.
 * @returns {*} Coverage result.
 */
function evaluateKnownTripleCoverage(sentence, triples) {
    const patterns = /** @type {Record<string, RegExp>} */ (PREDICATE_RELATION_PATTERNS);
    const normalizedTriples = Array.isArray(triples)
        ? triples.filter((/** @type {*} */ triple) => triple && patterns[triple.predicate])
        : [];

    /** @type {{ knownCount: number; coveredCount: number; allCovered: boolean; alerts: any[]; }} */
    const result = {
        knownCount: normalizedTriples.length,
        coveredCount: 0,
        allCovered: false,
        alerts: []
    };

    if (!normalizedTriples.length || typeof sentence !== 'string')
        return result;

    const normalizedSentence = normalizeForMatching(sentence);

    normalizedTriples.forEach((/** @type {*} */ triple) => {
        const subjectPresent = entityMentioned(normalizedSentence, triple.subject);
        const objectPresent = entityMentioned(normalizedSentence, triple.object);
        const relationPresent = patterns[triple.predicate].test(normalizedSentence);

        if (subjectPresent && objectPresent && relationPresent) {
            result.coveredCount += 1;
            return;
        }

        result.alerts.push(buildValidationAlert({
            code: objectPresent ? 'relation_missing' : 'missing_triple',
            type: 'coverage',
            severity: 'error',
            source: 'hybrid',
            message: `Falta informacion del triple ${triple.subject} | ${triple.predicate} | ${triple.object}.`,
            metadata: {
                triple: {
                    subject: triple.subject,
                    predicate: triple.predicate,
                    object: triple.object
                },
                subjectPresent,
                objectPresent,
                relationPresent
            }
        }));
    });

    result.allCovered = result.knownCount > 0 && result.coveredCount === result.knownCount;
    return result;
}

/**
 * Checks whether an entity appears in the sentence.
 * @param {string} normalizedSentence - Normalized sentence.
 * @param {*} entity - RDF entity.
 * @returns {boolean} True if it appears.
 */
function entityMentioned(normalizedSentence, entity) {
    const aliases = aliasesForEntity(entity);
    return aliases.some(alias => containsAlias(normalizedSentence, alias));
}

/**
 * Generates normalized aliases for an entity.
 * @param {*} entity - Entity.
 * @returns {Array<string>} Aliases.
 */
function aliasesForEntity(entity) {
    const normalized = normalizeEntityName(entity);
    const aliases = new Set([normalized]);

    const entityAliases = ENTITY_ALIASES.get(normalized);
    if (entityAliases) {
        for (const alias of entityAliases)
            aliases.add(normalizeForMatching(alias));
    }

    for (const token of tokenizeTriplePart(entity)) {
        if (token.length > 3)
            aliases.add(token);
    }

    return Array.from(aliases).filter(Boolean);
}

/**
 * Checks an alias by word or phrase, avoiding accidental substrings.
 * @param {string} normalizedSentence - Normalized sentence.
 * @param {string} alias - Normalized alias.
 * @returns {boolean} True if it appears.
 */
function containsAlias(normalizedSentence, alias) {
    if (!alias)
        return false;

    if (alias.includes(' '))
        return normalizedSentence.includes(alias);

    return new RegExp(`(^|[^a-z0-9ñ])${escapeRegExp(alias)}([^a-z0-9ñ]|$)`, 'i')
        .test(normalizedSentence);
}

/**
 * Escapes text for regular expressions.
 * @param {string} value - Value.
 * @returns {string} Escaped value.
 */
function escapeRegExp(value) {
    return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Normalizes an entity name.
 * @param {*} entity - Entity.
 * @returns {string} Normalized name.
 */
function normalizeEntityName(entity) {
    return normalizeForMatching(entity)
        .replaceAll(/[^a-z0-9ñ]+/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

/**
 * Checks whether a sentence looks complete enough to verbalize triples.
 * @param {*} sentence - Sentence.
 * @returns {boolean} True if it contains a minimal verbal signal.
 */
function looksLikeCompleteSentence(sentence) {
    if (typeof sentence !== 'string' || sentence.trim().length === 0)
        return false;

    return tokenizeWordsForMatching(sentence).some(token => COMPLETE_SENTENCE_MARKERS.has(token));
}

/**
 * Detects likely leaderTitle coverage in the active voice.
 * @param {*} sentence - Sentence.
 * @param {*} triples - Triples.
 * @returns {boolean} True if it looks covered.
 */
function isLikelyLeaderTitleCovered(sentence, triples) {
    if (typeof sentence !== 'string' || !Array.isArray(triples))
        return false;

    const normalizedSentence = normalizeForMatching(sentence);
    if (!/\b(gobierna|lidera|dirige|dirigid[ao]s?|preside|presidid[ao]s?|liderazgo|ejerce)\b/i.test(normalizedSentence))
        return false;

    return triples.some(triple => {
        if (triple?.predicate !== 'leaderTitle')
            return false;

        const subjectTokens = tokenizeTriplePart(triple.subject);
        const hasSubject = subjectTokens.some(token => normalizedSentence.includes(token));
        const hasAssembly = /\basamblea\b/.test(normalizedSentence)
            || /\bassembly\b/.test(normalizedSentence)
            || tokenizeTriplePart(triple.object).some(token => normalizedSentence.includes(token));

        return hasSubject && hasAssembly;
    });
}

/**
 * Tokenizes a triple part.
 * @param {*} value - Value.
 * @returns {Array<string>} Tokens.
 */
function tokenizeTriplePart(value) {
    return normalizeForMatching(value)
        .split(/[^a-z0-9ñ]+/)
        .map(token => token.trim())
        .filter(token => token.length > 2);
}

/**
 * Tokenizes normalized text, keeping short words.
 * @param {*} value - Value.
 * @returns {Array<string>} Tokens.
 */
function tokenizeWordsForMatching(value) {
    return normalizeForMatching(value)
        .split(/[^a-z0-9ñ]+/)
        .map(token => token.trim())
        .filter(Boolean);
}

/**
 * Normalizes text for simple comparisons.
 * @param {*} value - Value.
 * @returns {string} Normalized text.
 */
function normalizeForMatching(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replaceAll(/[̀-ͯ]/g, '')
        .replaceAll(/[_()]/g, ' ');
}

module.exports = {
    evaluateKnownTripleCoverage,
    looksLikeCompleteSentence,
    isLikelyLeaderTitleCovered
};
