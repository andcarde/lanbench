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
    ['amazon river', ['amazon river', 'amazonas', 'rio amazonas', 'río amazonas']],
    // Countries / cities. The deterministic coverage check compares the English
    // RDF entity against a *Spanish* sentence, so the canonical Spanish form must
    // be an alias or every translated name reads as a "missing triple" false
    // positive (see scripts/eval-correction-quality.js).
    ['italy', ['italy', 'italia']],
    ['rome', ['rome', 'roma']],
    ['japan', ['japan', 'japon', 'japón']],
    ['tokyo', ['tokyo', 'tokio']],
    ['germany', ['germany', 'alemania']],
    ['berlin', ['berlin', 'berlín']],
    ['mexico', ['mexico', 'méxico']],
    ['mexico city', ['mexico city', 'ciudad de mexico', 'ciudad de méxico']],
    ['portugal', ['portugal']],
    ['lisbon', ['lisbon', 'lisboa']],
    ['netherlands', ['netherlands', 'paises bajos', 'países bajos', 'holanda']],
    ['united kingdom', ['united kingdom', 'reino unido']],
    ['amsterdam', ['amsterdam', 'ámsterdam']],
    ['barcelona', ['barcelona']],
    ['lyon', ['lyon']],
    // Food / ingredients.
    ['spaghetti', ['spaghetti', 'espaguetis', 'espagueti']],
    ['rice', ['rice', 'arroz']],
    ['beef', ['beef', 'carne de res', 'carne de vacuno', 'ternera']],
    ['hamburger', ['hamburger', 'hamburguesa']]
]);

/**
 * Regex per RDF predicate: they detect the verb or connector that covers the
 * relation in the Spanish sentence. Consulted in `evaluateKnownTripleCoverage`.
 *
 * @type {Record<string, RegExp>}
 */
const PREDICATE_RELATION_PATTERNS = {
    country: /\b(esta|estan|situad[ao]s?|ubicad[ao]s?|pertenece|en|provien[ae]n?|proceden?|originari[ao]s?)\b/i,
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
    leaderTitle: /\b(gob(?:ierna|ernad[ao]s?)|lider(?:a|ad[ao]s?|azgo)|dirig(?:e|id[ao]s?)|presid(?:e|id[ao]s?)|ejerce)\b/i
};

/**
 * Set of verbs/connectors that indicate a Spanish sentence has a complete
 * predicate. Consulted by the "complete sentence" heuristic in
 * `spanish-service`.
 *
 * @type {Set<string>}
 */
// NOTE: tokens are matched after `normalizeForMatching` (lowercased, accents
// stripped, ñ→n), so they MUST be written without diacritics. A sentence is
// considered complete (not a fragment) when it contains any of these verbal
// markers; an over-narrow list produces `incomplete_sentence` false positives on
// perfectly valid sentences (see scripts/eval-correction-quality.js).
const COMPLETE_SENTENCE_MARKERS = new Set([
    'es',
    'esta',
    'estan',
    'son',
    'fue',
    'fueron',
    'era',
    'eran',
    'nacio',
    'murio',
    'fallecio',
    'tiene',
    'tienen',
    'gobierna',
    'lidera',
    'dirige',
    'dirigido',
    'preside',
    'dirigida',
    'escrito',
    'escrita',
    'fundada',
    'fundado',
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
    'encabezada',
    // Common verbs that previously fell through to a false `incomplete_sentence`.
    'recibio',
    'recibe',
    'reciben',
    'recibieron',
    'gano',
    'gana',
    'ganan',
    'ganaron',
    'obtuvo',
    'obtiene',
    'lleva',
    'llevan',
    'contiene',
    'contienen',
    'mide',
    'miden',
    'proviene',
    'provienen',
    'procede',
    'proceden',
    'realiza',
    'realizan',
    'encuentra',
    'disenado',
    'disenada',
    'produce',
    'produjo',
    'alberga',
    'cuenta',
    'viene',
    'vienen',
    'presenta',
    'aparece',
    'existe',
    'mantiene',
    'comprende',
    'consiste'
]);

module.exports = {
    ENTITY_ALIASES,
    PREDICATE_RELATION_PATTERNS,
    COMPLETE_SENTENCE_MARKERS
};
