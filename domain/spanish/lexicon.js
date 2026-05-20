'use strict';

/**
 * @file Canonical lexicon used by `spanish-service` for semantic heuristics
 * (known triple coverage, complete-sentence detection, entity aliases).
 * Keeping it separate allows adding aliases or verbs without touching the
 * orchestrator (AUDIT-4 §13 / AUDIT-5 §4.6, OCP).
 */

/**
 * Bidirectional aliases per entity. The key is the canonical lowercase form;
 * the value includes the key itself and all its variants (languages, accents,
 * short synonyms).
 *
 * @type {Map<string, string[]>}
 */
const ENTITY_ALIASES = new Map([
    ['spain', ['spain', 'espana', 'españa']],
    ['london', ['london', 'londres']],
    ['paris', ['paris']],
    ['france', ['france', 'francia']],
    ['water', ['water', 'agua']],
    ['atlantic ocean', ['atlantic ocean', 'atlantico', 'atlántico', 'oceano atlantico', 'océano atlántico']],
    ['indian ocean', ['indian ocean', 'indico', 'índico', 'oceano indico', 'océano índico']],
    ['don quixote', ['don quixote', 'don quijote']],
    ['baroque music', ['baroque music', 'musica barroca', 'música barroca', 'barroca']],
    ['princeton new jersey', ['princeton new jersey', 'princeton']],
    ['united states', ['united states', 'estados unidos']],
    ['amazon river', ['amazon river', 'amazonas', 'rio amazonas', 'río amazonas']]
]);

/**
 * Regex per RDF predicate: they detect the verb or connector that covers the
 * relation in the Spanish sentence. Consulted in `evaluateKnownTripleCoverage`.
 *
 * @type {Record<string, RegExp>}
 */
const PREDICATE_RELATION_PATTERNS = {
    country: /\b(esta|estan|situad[ao]s?|ubicad[ao]s?|pertenece|en)\b/i,
    birthPlace: /\b(nacio|nacida|nacido|nacimiento)\b/i,
    established: /\b(establecid[ao]s?|fundad[ao]s?|cread[ao]s?)\b/i,
    director: /\b(dirigid[ao]s?|director[ae]s?)\b/i,
    author: /\b(escrit[ao]s?|autor[ae]s?)\b/i,
    chemicalFormula: /\b(formula|quimic[ao])\b/i,
    mouthPlace: /\b(desemboca|desembocar|fluye|vierte)\b/i,
    founder: /\b(fundad[ao]s?|fundador[ae]s?)\b/i,
    deathPlace: /\b(murio|fallecio|murio|muerte)\b/i,
    artist: /\b(grabad[ao]s?|interpretad[ao]s?|artist[ao])\b/i,
    recordLabel: /\b(publicad[ao]s?|lanzad[ao]s?|discografica|sello)\b/i,
    capital: /\b(capital)\b/i,
    genre: /\b(musica|genero|barroc[ao])\b/i,
    leaderTitle: /\b(gobierna|lidera|dirige|preside|liderad[ao]|liderazgo|ejerce)\b/i
};

/**
 * Set of verbs/connectors that indicate a Spanish sentence has a complete
 * predicate. Consulted by the "complete sentence" heuristic in
 * `spanish-service`.
 *
 * @type {Set<string>}
 */
const COMPLETE_SENTENCE_MARKERS = new Set([
    'es',
    'esta',
    'estan',
    'son',
    'fue',
    'fueron',
    'nacio',
    'murio',
    'tiene',
    'gobierna',
    'lidera',
    'dirige',
    'preside',
    'dirigida',
    'escrito',
    'fundada',
    'desemboca',
    'compuso',
    'grabado',
    'grabada',
    'publicado',
    'publicada',
    'ubicado',
    'ubicada',
    'situado',
    'situada',
    'pertenece',
    'forma',
    'posee',
    'incluye',
    'ejerce',
    'ostenta',
    'ocupa',
    'representa',
    'encabeza',
    'encabezado',
    'encabezada'
]);

module.exports = {
    ENTITY_ALIASES,
    PREDICATE_RELATION_PATTERNS,
    COMPLETE_SENTENCE_MARKERS
};
