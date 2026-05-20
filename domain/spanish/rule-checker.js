'use strict';

/**
 * @file Rule checker — fast, deterministic validations on a sentence before
 * (or instead of) querying the LLM.
 *
 * Covers two main cases: empty sentences and sentences clearly written in
 * another language (heuristic over English words and mixing with Spanish).
 */

const EMPTY_SENTENCE_REASON = 'La oración está vacía.';
const LANGUAGE_MISMATCH_REASON =
    'La oración debe estar escrita en español, no en inglés ni mezclando idiomas.';
const HARD_ENGLISH_WORDS = new Set(['is', 'was', 'were', 'has', 'have', 'had']);
const ENGLISH_SIGNAL_WORDS = new Set([
    'the',
    'is',
    'was',
    'were',
    'has',
    'have',
    'had',
    'led',
    'founded',
    'written',
    'directed',
    'located',
    'born',
    'died',
    'flows',
    'recorded',
    'released',
    'by',
    'of',
    'from',
    'into',
    'with',
    'and',
]);

/**
 * Registry of declarative rules applied in order over the normalized sentence.
 * Each rule decides based on `{ trimmed, lowerCase }` and produces a failure
 * object `{ reason, suggestion }` or `null` when the sentence passes it.
 *
 * Adding a new rule just means pushing a descriptor to this array; `check()`
 * is not modified.
 *
 * @type {Array<{
 *   code: string,
 *   detect: (context: { trimmed: string, lowerCase: string }) => ({ reason: string, suggestion: string|null }|null)
 * }>}
 */
const RULES = [
    {
        code: 'language_mismatch',
        detect({ trimmed }) {
            return looksEnglishOrMixed(trimmed)
                ? { reason: LANGUAGE_MISMATCH_REASON, suggestion: null }
                : null;
        },
    },
    {
        code: 'spelling_ago',
        detect({ trimmed, lowerCase }) {
            return /\bago\b/i.test(lowerCase)
                ? {
                    reason: 'Hay un posible error ortográfico en el verbo.',
                    suggestion: trimmed.replace(/\bago\b/i, 'hago'),
                }
                : null;
        },
    },
    {
        code: 'gender_mismatch_lapiz',
        detect({ trimmed, lowerCase }) {
            return /\buna\s+l[aá]piz\b/i.test(lowerCase)
                ? {
                    reason: 'Hay una discordancia de género en el sintagma nominal.',
                    suggestion: trimmed.replace(/\buna\s+l[aá]piz\b/i, 'un lápiz'),
                }
                : null;
        },
    },
    {
        code: 'missing_final_punctuation',
        detect({ trimmed }) {
            return /[.!?…]$/.test(trimmed)
                ? null
                : { reason: 'Falta un signo de puntuación final.', suggestion: `${trimmed}.` };
        },
    },
];

/**
 * Applies the local validation rules to a candidate sentence.
 * @param {*} sentence - Candidate sentence.
 * @returns {{ valid:boolean, reason:?string, suggestion:?string }} Validation result.
 */
function check(sentence) {
    if (typeof sentence !== 'string' || sentence.trim().length === 0) {
        return {
            valid: false,
            reason: EMPTY_SENTENCE_REASON,
            suggestion: 'Escribe una oración antes de validar.',
        };
    }

    const trimmed = sentence.trim();
    const context = { trimmed, lowerCase: trimmed.toLowerCase() };

    for (const rule of RULES) {
        const failure = rule.detect(context);
        if (failure)
            return { valid: false, reason: failure.reason, suggestion: failure.suggestion };
    }

    return { valid: true, reason: null, suggestion: null };
}

/**
 * Detects sentences that are clearly English or mixed.
 * @param {string} sentence - Sentence.
 * @returns {boolean} True if it looks English or mixed.
 */
function looksEnglishOrMixed(sentence) {
    const lowerCase = sentence.toLowerCase();
    const words = lowerCase.split(/[^a-z]+/).filter(Boolean);
    const hardEnglishFound = words.some((word) => HARD_ENGLISH_WORDS.has(word));
    const englishSignalCount = words.filter((word) =>
        ENGLISH_SIGNAL_WORDS.has(word)
    ).length;

    return hardEnglishFound || englishSignalCount >= 2;
}

/**
 * Indicates whether a validation result should short-circuit the pipeline without querying the LLM.
 * @param {*} result - Local validation result.
 * @returns {boolean} True if the local rule fails due to an empty sentence.
 */
function isImmediateFailure(result) {
    return result?.valid === false && result?.reason === EMPTY_SENTENCE_REASON;
}

module.exports = {
    check,
    isImmediateFailure,
    EMPTY_SENTENCE_REASON,
    LANGUAGE_MISMATCH_REASON,
    RULES
};
