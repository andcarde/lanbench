'use strict';

/**
 * @file Catalogue of validation codes with fixed messages and predefined
 * severity.
 *
 * The LLM only returns the code (`code`); the message shown to the user always
 * comes from here — this guarantees a stable UI even if the LLM changes model
 * or tone.
 *
 * severity:
 *   `error`     -> red background, blocks the annotation
 *   `warning`   -> yellow background, allows continuing with a warning
 *   `duplicate` -> purple background, indicates linguistic reuse
 *   `ok`        -> no visible alert
 *
 * `messageTemplate`: base message. If the LLM includes an explanation in the
 * `explanation` field, it is concatenated: `"<messageTemplate>: <explanation>"`.
 *
 * @typedef {Object} ValidationCodeEntry
 * @property {string} severity                     - Severity of the code.
 * @property {string} type                         - Code category (grammar, semantic, ...).
 * @property {string} messageTemplate              - Base message shown to the user.
 */

/**
 * Immutable catalogue of validation codes.
 * @type {Readonly<Record<string, ValidationCodeEntry>>}
 */
const VALIDATION_CODES = Object.freeze({
    ok: {
        severity: 'ok',
        type: 'none',
        messageTemplate: 'Sin errores detectados.'
    },
    spelling_error: {
        severity: 'error',
        type: 'orthography',
        messageTemplate: 'Falta ortográfica'
    },
    grammar_error: {
        severity: 'error',
        type: 'grammar',
        messageTemplate: 'Error sintáctico'
    },
    semantic_mismatch: {
        severity: 'error',
        type: 'semantic',
        messageTemplate: 'Error semántico: la traducción no refleja el significado del triple'
    },
    rdf_error: {
        severity: 'error',
        type: 'coverage',
        messageTemplate: 'Error RDF: la verbalización del triple es incorrecta o incompleta'
    },
    language_not_spanish: {
        severity: 'error',
        type: 'grammar',
        messageTemplate: 'La oración no está escrita en español'
    },
    mixed_language: {
        severity: 'error',
        type: 'grammar',
        messageTemplate: 'La oración mezcla español con otro idioma'
    },
    incomplete_sentence: {
        severity: 'error',
        type: 'coverage',
        messageTemplate: 'La oración está incompleta: no verbaliza el predicado del triple'
    },
    inverted_relation: {
        severity: 'error',
        type: 'semantic',
        messageTemplate: 'La relación RDF se expresa de forma invertida'
    },
    missing_triple: {
        severity: 'error',
        type: 'coverage',
        messageTemplate: 'La oración omite uno o más triples requeridos'
    },
    relation_missing: {
        severity: 'error',
        type: 'coverage',
        messageTemplate: 'La oración no verbaliza la relación del triple'
    },
    relation_inverted: {
        severity: 'error',
        type: 'semantic',
        messageTemplate: 'La relación se expresa de forma invertida respecto al triple'
    },
    imprecise_entity_name: {
        severity: 'warning',
        type: 'semantic',
        messageTemplate: 'Nombre de entidad impreciso respecto al triple'
    },
    vague_translation: {
        severity: 'warning',
        type: 'semantic',
        messageTemplate: 'Traducción vaga o poco precisa'
    },
    accent_error: {
        severity: 'warning',
        type: 'orthography',
        messageTemplate: 'Acento incorrecto'
    },
    missing_comma: {
        severity: 'warning',
        type: 'grammar',
        messageTemplate: 'Falta coma en la oración'
    },
    punctuation_missing: {
        severity: 'warning',
        type: 'grammar',
        messageTemplate: 'Signo de puntuación ausente o incorrecto'
    },
    unnatural_expression: {
        severity: 'warning',
        type: 'grammar',
        messageTemplate: 'Expresión no natural en español'
    },
    repeated_sentence: {
        severity: 'duplicate',
        type: 'diversity',
        messageTemplate: 'Oración repetida: ya existe una oración idéntica o muy similar en esta entrada'
    }
});

/**
 * Full list of valid codes.
 * @type {ReadonlyArray<string>}
 */
const ALL_CODES = Object.freeze(Object.keys(VALIDATION_CODES));

/**
 * Typed view of the catalogue for consumers that need to access it by key.
 * @type {Readonly<Record<string, ValidationCodeEntry>>}
 */
const CODES_LOOKUP = VALIDATION_CODES;

/**
 * Codes whose severity is `'error'`.
 * @type {ReadonlyArray<string>}
 */
const ERROR_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'error')
);

/**
 * Codes whose severity is `'warning'`.
 * @type {ReadonlyArray<string>}
 */
const WARNING_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'warning')
);

/**
 * Codes whose severity is `'duplicate'`.
 * @type {ReadonlyArray<string>}
 */
const DUPLICATE_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'duplicate')
);

/**
 * Resolves the fixed message associated with the code, concatenating the LLM's
 * explanation if present and non-empty.
 *
 * @param {string} code         - Validation code.
 * @param {string|null} explanation - Free-form explanation returned by the LLM.
 * @returns {string} Message ready to display to the user.
 */
function resolveMessage(code, explanation) {
    const entry = CODES_LOOKUP[code];
    if (!entry)
        return typeof explanation === 'string' && explanation.trim().length > 0
            ? explanation.trim()
            : 'Problema de validacion desconocido.';

    const base = entry.messageTemplate;
    const detail = typeof explanation === 'string' ? explanation.trim() : '';
    return detail.length > 0 ? `${base}: ${detail}` : base;
}

/**
 * Returns true if the code is known in the catalogue.
 *
 * @param {string} code
 * @returns {boolean}
 */
function isKnownCode(code) {
    return typeof code === 'string' && Object.hasOwn(VALIDATION_CODES, code);
}

module.exports = {
    VALIDATION_CODES,
    ALL_CODES,
    ERROR_CODES,
    WARNING_CODES,
    DUPLICATE_CODES,
    resolveMessage,
    isKnownCode
};
