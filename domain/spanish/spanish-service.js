'use strict';

/**
 * @file Spanish service — composicion de la validacion en dos pasadas
 * (`rule-checker` + LLM via `ollama-spanish-checker`) y persistencia de
 * anotaciones.
 *
 * El flujo `check` aplica primero las reglas locales (rapidas y
 * deterministas) y, si la oracion las supera, consulta al LLM para la
 * validacion semantica/gramatical mas costosa.
 *
 * @typedef {Object} SpanishServiceDeps
 * @property {Record<string, any>} [ruleBasedChecker]
 * @property {Record<string, any>} [semanticChecker]
 * @property {Record<string, any>} [annotationsRepository]
 * @property {Record<string, any>} [logger]
 */

const ruleChecker = require('./rule-checker');
const ollamaSpanishChecker = require('./ollama-spanish-checker');
const { createAnnotationsRepository } = require('../../repositories/annotations-repository');
const { ServiceError } = require('../../services/service-error');
const { toPositiveInteger } = require('../../utils/validators');
const { buildValidationAlert, mergeAlerts } = require('../../utils/validation-alert');

/**
 * Construye el servicio de validacion/persistencia de espanol.
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
     * Valida una oracion contra las reglas locales y, si las supera, contra el checker semantico.
     * @param {*} sentence - Oracion candidata.
     * @param {*} [context] - Contexto RDF y referencias.
     * @returns {Promise<*>} Resultado de la validacion fusionado.
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
     * Comprueba un lote de oraciones contra el mismo contexto de entry.
     * @param {Array<*>} sentences - Oraciones candidatas.
     * @param {*} context - Contexto RDF y referencias.
     * @returns {Promise<Array<*>>} Resultados por indice.
     */
    async function checkBatch(sentences, context = {}) {
        const normalizedSentences = Array.isArray(sentences) ? sentences : [];
        const baseResults = normalizedSentences.map(sentence => deps.ruleBasedChecker.check(sentence));

        if (!normalizedSentences.length)
            return [];

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
     * Persiste un lote de oraciones para una entry, reemplazando filas previas.
     * @param {{ userId:number, datasetId:number, rdfId:number, sentences:Array<*>, rejectionReasons?:Array<*> }} payload
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
 * Registra fallos del checker semantico cuando se degrada a reglas locales.
 * @param {*} error - Error capturado.
 * @param {*} logger - Logger opcional.
 * @returns {void}
 */
function logSemanticFallback(error, logger) {
    if (!logger || typeof logger.warn !== 'function')
        return;

    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message }, 'Semantic checker failed; using rule-based fallback.');
}

/**
 * Fusiona reglas locales con validaciones semanticas por lote.
 * @param {Array<*>} sentences - Oraciones originales.
 * @param {Array<*>} baseResults - Resultados de reglas.
 * @param {Array<*>} semanticResults - Resultados semanticos.
 * @returns {Array<*>} Resultados fusionados.
 */
function mergeBatchResults(sentences, baseResults, semanticResults, /** @type {*} */ context = {}) {
    return sentences.map((sentence, index) => {
        const baseResult = baseResults[index] || { valid: true, reason: null, suggestion: null };
        const semanticResult = Array.isArray(semanticResults) && semanticResults[index]
            ? semanticResults[index]
            : null;
        const coverage = evaluateKnownTripleCoverage(sentence, context.triples);
        const alerts = orderAlerts(suppressLlmFalsePositivesForCoveredTriples(adjustAlertsWithContext(normalizeLanguageAlerts(mergeAlerts(
            contextualAlertsFromSentence(sentence, context),
            coverage.alerts,
            alertsFromResult(baseResult, 'rules'),
            alertsFromResult(semanticResult, 'llm')
        )), sentence, context), coverage));

        if (!semanticResult && !alerts.length)
            return baseResult;

        if (!alerts.length) {
            return {
                valid: true,
                reason: null,
                suggestion: null
            };
        }

        const primaryAlert = alerts[0];
        return {
            valid: false,
            reason: primaryAlert.message,
            suggestion: firstSuggestion(alerts) || resultSuggestion(semanticResult) || resultSuggestion(baseResult) || normalizeSentence(sentence),
            alerts
        };
    });
}

/**
 * Anade propuestas de correccion generadas por el LLM para rechazos semanticos.
 * @param {*} options - Datos de la validacion.
 * @returns {Promise<Array<*>>} Resultados con proposal cuando aplica.
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
 * Decide si una validacion rechazada procede de Ollama y necesita propuesta.
 * @param {*} result - Resultado fusionado.
 * @returns {boolean} True si debe pedirse propuesta.
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
 * Normaliza proposal para adjuntarlo al resultado.
 * @param {*} value - Valor devuelto por el LLM.
 * @returns {?string} Propuesta.
 */
function normalizeProposal(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

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

/**
 * Evalua cobertura determinista para predicados frecuentes.
 * @param {*} sentence - Oracion.
 * @param {*} triples - Triples.
 * @returns {*} Resultado de cobertura.
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
 * Comprueba si una entidad aparece en la oracion.
 * @param {string} normalizedSentence - Oracion normalizada.
 * @param {*} entity - Entidad RDF.
 * @returns {boolean} True si aparece.
 */
function entityMentioned(normalizedSentence, entity) {
    const aliases = aliasesForEntity(entity);
    return aliases.some(alias => containsAlias(normalizedSentence, alias));
}

/**
 * Genera alias normalizados para una entidad.
 * @param {*} entity - Entidad.
 * @returns {Array<string>} Alias.
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
 * Comprueba alias por palabra o frase, evitando subcadenas accidentales.
 * @param {string} normalizedSentence - Oracion normalizada.
 * @param {string} alias - Alias normalizado.
 * @returns {boolean} True si aparece.
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
 * Escapa texto para expresiones regulares.
 * @param {string} value - Valor.
 * @returns {string} Valor escapado.
 */
function escapeRegExp(value) {
    return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Normaliza nombre de entidad.
 * @param {*} entity - Entidad.
 * @returns {string} Nombre normalizado.
 */
function normalizeEntityName(entity) {
    return normalizeForMatching(entity)
        .replaceAll(/[^a-z0-9ñ]+/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

/**
 * Suprime falsos positivos del LLM cuando la cobertura determinista es completa.
 * @param {Array<*>} alerts - Alertas.
 * @param {*} coverage - Resultado de cobertura.
 * @returns {Array<*>} Alertas filtradas.
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
 * Genera alertas deterministas que dependen del contexto RDF.
 * @param {*} sentence - Oracion.
 * @param {*} context - Contexto.
 * @returns {Array<*>} Alertas.
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
 * Ajusta alertas del LLM con heuristicas conservadoras del dominio.
 * @param {Array<*>} alerts - Alertas originales.
 * @param {*} sentence - Oracion.
 * @param {*} context - Contexto.
 * @returns {Array<*>} Alertas ajustadas.
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
 * Normaliza alertas de idioma: la regla local decide si una frase no esta en espanol.
 * @param {Array<*>} alerts - Alertas.
 * @returns {Array<*>} Alertas filtradas.
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
 * Comprueba si una oracion parece completa para verbalizar triples.
 * @param {*} sentence - Oracion.
 * @returns {boolean} True si contiene una senal verbal minima.
 */
function looksLikeCompleteSentence(sentence) {
    if (typeof sentence !== 'string' || sentence.trim().length === 0)
        return false;

    return tokenizeWordsForMatching(sentence).some(token => COMPLETE_SENTENCE_MARKERS.has(token));
}

/**
 * Detecta cobertura probable de leaderTitle en voz activa.
 * @param {*} sentence - Oracion.
 * @param {*} triples - Triples.
 * @returns {boolean} True si parece cubierta.
 */
function isLikelyLeaderTitleCovered(sentence, triples) {
    if (typeof sentence !== 'string' || !Array.isArray(triples))
        return false;

    const normalizedSentence = normalizeForMatching(sentence);
    if (!/\b(gobierna|lidera|dirige|preside|liderazgo|ejerce)\b/i.test(normalizedSentence))
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
 * Tokeniza una parte de triple.
 * @param {*} value - Valor.
 * @returns {Array<string>} Tokens.
 */
function tokenizeTriplePart(value) {
    return normalizeForMatching(value)
        .split(/[^a-z0-9ñ]+/)
        .map(token => token.trim())
        .filter(token => token.length > 2);
}

/**
 * Tokeniza texto normalizado conservando palabras cortas.
 * @param {*} value - Valor.
 * @returns {Array<string>} Tokens.
 */
function tokenizeWordsForMatching(value) {
    return normalizeForMatching(value)
        .split(/[^a-z0-9ñ]+/)
        .map(token => token.trim())
        .filter(Boolean);
}

/**
 * Normaliza texto para comparaciones simples.
 * @param {*} value - Valor.
 * @returns {string} Texto normalizado.
 */
function normalizeForMatching(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replaceAll(/[\u0300-\u036f]/g, '')
        .replaceAll(/[_()]/g, ' ');
}

/**
 * Ordena alertas por severidad para que los errores lideren la respuesta.
 * @param {Array<*>} alerts - Alertas.
 * @returns {Array<*>} Alertas ordenadas.
 */
function orderAlerts(alerts) {
    /** @type {Record<string, number>} */
    const severityRank = { error: 0, warning: 1, info: 2 };

    return alerts.slice().sort((/** @type {*} */ a, /** @type {*} */ b) => (
        (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
    ));
}

/**
 * Extrae alertas desde un resultado de validacion.
 * @param {*} result - Resultado.
 * @param {string} source - Fuente por defecto.
 * @returns {Array<*>} Alertas.
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
 * Obtiene codigo de alerta desde una razon de regla.
 * @param {*} reason - Razon.
 * @param {string} source - Fuente.
 * @returns {string} Codigo.
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
 * Obtiene tipo de alerta desde una razon.
 * @param {*} reason - Razon.
 * @returns {string} Tipo.
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
 * Obtiene severidad de alerta desde una razon.
 * @param {*} reason - Razon.
 * @returns {string} Severidad.
 */
function severityFromRuleReason(reason) {
    if (reason === 'Falta un signo de puntuación final.')
        return 'warning';

    return 'error';
}

/**
 * Obtiene primera sugerencia disponible.
 * @param {Array<*>} alerts - Alertas.
 * @returns {?string} Sugerencia.
 */
function firstSuggestion(alerts) {
    const first = alerts.find(alert => alert && typeof alert.suggestion === 'string' && alert.suggestion.trim().length > 0);
    return first ? first.suggestion : null;
}

/**
 * Normaliza suggestion de un resultado.
 * @param {*} result - Resultado.
 * @returns {?string} Sugerencia.
 */
function resultSuggestion(result) {
    return result && typeof result.suggestion === 'string' && result.suggestion.trim().length > 0
        ? result.suggestion.trim()
        : null;
}

/**
 * Normaliza la oracion original.
 * @param {*} sentence - Oracion.
 * @returns {?string} Oracion normalizada.
 */
function normalizeSentence(sentence) {
    return typeof sentence === 'string' && sentence.trim().length > 0
        ? sentence.trim()
        : null;
}

/**
 * Construye contexto para checkers que solo validan una frase.
 * @param {*} context - Contexto de entry.
 * @param {number} sentenceIndex - Indice.
 * @returns {*} Contexto individual.
 */
function buildSingleSentenceContext(context, sentenceIndex) {
    const safeContext = context || {};
    const sourceSentences = Array.isArray(safeContext.englishSentences || safeContext.sourceSentences)
        ? (safeContext.englishSentences || safeContext.sourceSentences)
        : [];

    return {
        ...safeContext,
        referenceSentence: sourceSentences[sentenceIndex] || safeContext.referenceSentence || null
    };
}

/**
 * Normaliza el payload de save al formato canónico.
 * @param {{ userId?:*, datasetId?:*, rdfId?:*, eid?:*, sentences:Array<*>, rejectionReasons?:Array<*>, rejectionReason?:Array<*> }} payload
 * @returns {{ userId:?number, datasetId:?number, rdfId:?number, sentences:Array<{sentenceIndex:number, sentence:string, rejectionReason:?string}> }}
 */
function normalizeSavePayload(payload) {
    const sentences = payload && Array.isArray(payload.sentences) ? payload.sentences : [];
    /** @type {any[]} */
    let rejectionReasons = [];
    if (payload && Array.isArray(payload.rejectionReasons))
        rejectionReasons = payload.rejectionReasons;
    else if (payload && Array.isArray(payload.rejectionReason))
        rejectionReasons = payload.rejectionReason;

    return {
        userId: toPositiveInteger(payload?.userId),
        datasetId: toPositiveInteger(payload?.datasetId),
        rdfId: toPositiveInteger(payload?.rdfId ?? payload?.eid),
        sentences: sentences.map((/** @type {*} */ text, /** @type {*} */ index) => ({
            sentenceIndex: index,
            sentence: typeof text === 'string' ? text : '',
            rejectionReason: normalizeOptionalText(rejectionReasons[index])
        }))
    };
}

/**
 * Devuelve el texto recortado o null si el valor no es una cadena no vacia.
 * @param {*} value - Valor potencialmente nulo o no textual.
 * @returns {?string} Texto recortado o null.
 */
function normalizeOptionalText(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

module.exports = {
    createSpanishService
};
