'use strict';

/**
 * @file Catalogo de codigos de validacion con mensajes fijos y severidad
 * predefinida.
 *
 * El LLM solo devuelve el codigo (`code`); el mensaje mostrado al usuario
 * proviene siempre de aqui — esto garantiza una UI estable aunque el LLM
 * cambie de modelo o de tono.
 *
 * severity:
 *   `error`     -> fondo rojo, bloquea la anotacion
 *   `warning`   -> fondo amarillo, permite continuar con aviso
 *   `duplicate` -> fondo morado, indica reutilizacion linguistica
 *   `ok`        -> sin alerta visible
 *
 * `messageTemplate`: mensaje base. Si el LLM incluye una explicacion en el
 * campo `explanation`, se concatena: `"<messageTemplate>: <explanation>"`.
 *
 * @typedef {Object} ValidationCodeEntry
 * @property {string} severity                     - Severidad del codigo.
 * @property {string} type                         - Categoria del codigo (grammar, semantic, ...).
 * @property {string} messageTemplate              - Mensaje base mostrado al usuario.
 */

/**
 * Catalogo inmutable de codigos de validacion.
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
 * Lista completa de codigos validos.
 * @type {ReadonlyArray<string>}
 */
const ALL_CODES = Object.freeze(Object.keys(VALIDATION_CODES));

/**
 * Vista tipada del catalogo para consumidores que necesitan acceder por clave.
 * @type {Readonly<Record<string, ValidationCodeEntry>>}
 */
const CODES_LOOKUP = VALIDATION_CODES;

/**
 * Codigos cuya severidad es `'error'`.
 * @type {ReadonlyArray<string>}
 */
const ERROR_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'error')
);

/**
 * Codigos cuya severidad es `'warning'`.
 * @type {ReadonlyArray<string>}
 */
const WARNING_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'warning')
);

/**
 * Codigos cuya severidad es `'duplicate'`.
 * @type {ReadonlyArray<string>}
 */
const DUPLICATE_CODES = Object.freeze(
    ALL_CODES.filter(code => CODES_LOOKUP[code].severity === 'duplicate')
);

/**
 * Resuelve el mensaje fijo asociado al codigo, concatenando la explicacion
 * del LLM si esta presente y no vacia.
 *
 * @param {string} code         - Codigo de validacion.
 * @param {string|null} explanation - Explicacion libre devuelta por el LLM.
 * @returns {string} Mensaje listo para mostrar al usuario.
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
 * Devuelve true si el codigo es conocido en el catalogo.
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
