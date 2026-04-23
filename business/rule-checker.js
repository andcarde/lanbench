'use strict';

const EMPTY_SENTENCE_REASON = 'La oración está vacía.';

function check(sentence) {
    if (typeof sentence !== 'string' || sentence.trim().length === 0) {
        return {
            valid: false,
            reason: EMPTY_SENTENCE_REASON,
            suggestion: 'Escribe una oración antes de validar.'
        };
    }

    const trimmed = sentence.trim();
    const lowerCase = trimmed.toLowerCase();

    if (/\bago\b/i.test(lowerCase)) {
        return {
            valid: false,
            reason: 'Hay un posible error ortográfico en el verbo.',
            suggestion: trimmed.replace(/\bago\b/i, 'hago')
        };
    }

    if (/\buna\s+l[aá]piz\b/i.test(lowerCase)) {
        return {
            valid: false,
            reason: 'Hay una discordancia de género en el sintagma nominal.',
            suggestion: trimmed.replace(/\buna\s+l[aá]piz\b/i, 'un lápiz')
        };
    }

    if (!/[.!?…]$/.test(trimmed)) {
        return {
            valid: false,
            reason: 'Falta un signo de puntuación final.',
            suggestion: `${trimmed}.`
        };
    }

    return {
        valid: true,
        reason: null,
        suggestion: null
    };
}

function isImmediateFailure(result) {
    return result
        && result.valid === false
        && result.reason === EMPTY_SENTENCE_REASON;
}

module.exports = {
    check,
    isImmediateFailure,
    EMPTY_SENTENCE_REASON
};
