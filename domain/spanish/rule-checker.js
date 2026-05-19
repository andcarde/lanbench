'use strict';

/**
 * @file Rule checker — validaciones rapidas y deterministas sobre una
 * oracion antes (o en lugar) de consultar al LLM.
 *
 * Cubre dos casos principales: oraciones vacias y oraciones claramente
 * escritas en otro idioma (heuristica sobre palabras inglesas y mezcla
 * con espanol).
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
 * Registro de reglas declarativas aplicadas en orden sobre la oración normalizada.
 * Cada regla decide sobre `{ trimmed, lowerCase }` y produce un objeto de
 * fallo `{ reason, suggestion }` o `null` cuando la oración la supera.
 *
 * Añadir una regla nueva consiste en empujar un descriptor a este array; no se
 * modifica `check()`.
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
 * Aplica las reglas locales de validacion sobre una oracion candidata.
 * @param {*} sentence - Oracion candidata.
 * @returns {{ valid:boolean, reason:?string, suggestion:?string }} Resultado de la validacion.
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
 * Detecta frases claramente inglesas o mezcladas.
 * @param {string} sentence - Oracion.
 * @returns {boolean} True si parece ingles o mezcla.
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
 * Indica si un resultado de validacion debe cortar el pipeline sin consultar al LLM.
 * @param {*} result - Resultado de validacion local.
 * @returns {boolean} True si la regla local falla por oracion vacia.
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
