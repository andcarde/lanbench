'use strict';

/**
 * @file LLM-based Spanish checker (Ollama/Groq).
 *
 * It builds the prompts (system + user), calls the JSON client
 * `llm-client.generateJson`, and normalizes the LLM response to the canonical
 * validation format (with `VALIDATION_CODES` codes + alerts).
 *
 * It exposes both `check` (1 sentence) and `checkBatch` (batch), so that
 * `spanishService` can pick the most efficient mode.
 */

const ollamaClient = require('../../utils/llm-client');
const { buildValidationAlert } = require('../../utils/validation-alert');
const { ALL_CODES, resolveMessage, isKnownCode, VALIDATION_CODES } = require('../../constants/validation-codes');

/**
 * Validates a single sentence against the given RDF and English context by
 * querying the LLM.
 *
 * @param {string} sentence
 * @param {Record<string, any>} [context]
 * @returns {Promise<Record<string, any>>}
 */
async function check(sentence, context = {}) {
    const prompt = buildCheckPrompt(sentence, context);
    const response = await ollamaClient.generateJson({
        system: getSystemPrompt(),
        prompt,
        ...providerConfigOption(context)
    });

    return normalizeOllamaResult(response, sentence);
}

/**
 * Checks a batch of sentences from the same entry in a single LLM call.
 * Returns an array parallel to `sentences`.
 *
 * @param {string[]} sentences
 * @param {Record<string, any>} [context]
 * @returns {Promise<Array<Record<string, any>>>}
 */
async function checkBatch(sentences, context = {}) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const prompt = buildBatchCheckPrompt(normalizedSentences, context);
    const response = await ollamaClient.generateJson({
        system: getBatchSystemPrompt(),
        prompt,
        ...providerConfigOption(context)
    });

    return normalizeBatchOllamaResult(response, normalizedSentences);
}

/**
 * Asks Ollama for corrected proposals for the rejected sentences.
 * @param {Array<*>} sentences - Original candidate sentences.
 * @param {*} context - RDF context and English references.
 * @param {Array<*>} validations - Validations already computed.
 * @returns {Promise<Array<?string>>} Proposals indexed by sentenceIndex.
 */
async function proposeCorrectionsBatch(sentences, context = {}, validations = []) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const prompt = buildCorrectionProposalPrompt(normalizedSentences, context, validations);

    if (!prompt)
        return normalizedSentences.map(() => null);

    const response = await ollamaClient.generateJson({
        system: getCorrectionProposalSystemPrompt(),
        prompt,
        ...providerConfigOption(context)
    });

    return normalizeCorrectionProposalResult(response, normalizedSentences);
}

/**
 * Returns `{ providerConfig }` when the context carries a per-dataset AI
 * credential (US-31), or an empty object so the dispatcher keeps the global
 * provider. Spread into the `generateJson` options.
 *
 * @param {Record<string, any>} [context]
 * @returns {{ providerConfig?: Record<string, any> }}
 */
function providerConfigOption(context) {
    return context && context.providerConfig ? { providerConfig: context.providerConfig } : {};
}

/**
 * Builds the system prompt for single-sentence validation.
 * @returns {string} System prompt.
 */
function getSystemPrompt() {
    return [
        'Eres un revisor experto de oraciones en espanol para un benchmark RDF.',
        'Debes revisar ortografia, gramatica, puntuacion y adecuacion semantica respecto a los triples y la frase inglesa de referencia.',
        'Responde SOLO en JSON con este formato exacto:',
        '{"valid":boolean,"reason":string|null,"suggestion":string|null}',
        'Si la oracion es correcta, usa {"valid":true,"reason":null,"suggestion":null}.',
        'Si no es correcta, explica el problema en "reason" y devuelve en "suggestion" una version corregida en espanol.'
    ].join('\n');
}

/**
 * Gets the system prompt for batch validation.
 * @returns {string} System prompt.
 */
function getBatchSystemPrompt() {
    const allowedCodes = ALL_CODES.filter(code => code !== 'ok' && code !== 'repeated_sentence').join(', ');
    return [
        'Eres un revisor estricto de traducciones espanolas para un benchmark RDF.',
        'Recibiras una entrada JSON con triples, referencias inglesas y candidatas espanolas. Valida CADA candidata de forma independiente.',
        'sentenceIndex identifica la candidata, no el triple. No inventes indices de triple.',
        'Si una referencia tiene english=null, recibira ademas rdfSchematic con la tripleta cruda; tratala SOLO como recordatorio del triple, NUNCA como traduccion a comparar literalmente.',
        'NO marques relation_missing, missing_triple, incomplete_sentence, semantic_mismatch ni rdf_error por la simple ausencia de referencia inglesa. No exijas que la candidata contenga literalmente las palabras del rdfSchematic; solo exige que verbalice el triple en espanol natural con sentido equivalente. Usa rdf_error exclusivamente cuando las entidades o la relacion sean genuinamente incorrectas (entidad cambiada, relacion invertida), no cuando la frase use sinonimos o parafrasis validas.',
        'Cada candidata debe ser una oracion espanola completa, no un fragmento. Un sintagma como "La provincia de Pakistan" es invalido si no expresa la relacion RDF.',
        'Marca error si la candidata esta en ingles, mezcla idiomas, omite la relacion del triple, cambia entidad/fecha/numero, invierte la relacion o solo menciona entidades sin verbalizar el predicado.',
        'No marques relation_inverted cuando la candidata conserva el significado con voz activa/pasiva equivalente; por ejemplo "X is led by Y" puede verbalizarse como "Y lidera/gobierna X".',
        'Para predicados nominales como leaderTitle ("titulo del lider"), prefiere voz activa ("Y gobierna/dirige X"). La pasiva "X esta dirigido por Y" describe la accion de liderar y NO verbaliza correctamente el titulo: marcala como semantic_mismatch.',
        'Usa warning solo si el significado principal esta cubierto pero hay denominacion imprecisa, vaguedad o estilo mejorable.',
        'Distingue dos casos ortograficos: (a) si la unica incidencia es la ausencia de tildes/acentos y las letras son correctas (por ejemplo "nacio" en vez de "nació", o "Mexico"/"Fisica" en vez de "México"/"Física"), marcala como accent_error con severity warning, nunca como error de bloqueo; (b) los errores de letras (omitir, cambiar o anadir letras, por ejemplo "kapital" por "capital" o "hamburgesa" por "hamburguesa") SIGUEN siendo spelling_error con severity error.',
        `Codigos permitidos: ${allowedCodes}.`,
        'IMPORTANTE: El campo "code" debe ser EXACTAMENTE uno de los codigos permitidos. El campo "explanation" debe contener SOLO la parte variable del problema (entidad concreta, palabra con falta ortografica, etc.), en una frase corta. NO uses el campo "message": usa "explanation" en su lugar.',
        'Ejemplo ortografia: {"code":"spelling_error","explanation":"uevo en lugar de huevo","severity":"error","suggestion":"..."}',
        'Ejemplo imprecision: {"code":"imprecise_entity_name","explanation":"se omite Provincial en Asamblea Provincial del Punjab","severity":"warning","suggestion":"..."}',
        'Ejemplo valida: {"sentenceIndex":0,"valid":true,"alerts":[]}',
        'Responde SOLO este JSON, sin texto extra:',
        '{"validations":[{"sentenceIndex":0,"valid":false,"alerts":[{"code":"spelling_error","explanation":"uevo en lugar de huevo","severity":"error","suggestion":"..."}]}]}',
        'Debe haber exactamente una validacion por cada sentenceIndex obligatorio recibido.'
    ].join('\n');
}

/**
 * Gets the system prompt for generating correction proposals.
 * @returns {string} System prompt.
 */
function getCorrectionProposalSystemPrompt() {
    return [
        'Eres un asistente experto en reescritura de oraciones espanolas para un benchmark RDF.',
        'Recibiras solo oraciones que una validacion previa rechazo o marco con aviso.',
        'Debes devolver una propuesta corregida en espanol natural para cada sentenceIndex solicitado.',
        'La propuesta debe ser una oracion completa, fiel a los triples RDF y a la referencia inglesa cuando exista.',
        'No devuelvas explicaciones, listas de cambios ni texto fuera del JSON.',
        'Responde SOLO este JSON:',
        '{"proposals":[{"sentenceIndex":0,"proposal":"Oracion corregida."}]}'
    ].join('\n');
}

/**
 * Builds the validation prompt for a single sentence.
 * @param {*} sentence - Candidate sentence.
 * @param {*} [context] - RDF context (triples, referenceSentence, category, entryId).
 * @returns {string} Full prompt for the model.
 */
function buildCheckPrompt(sentence, context = {}) {
    const safeContext = /** @type {any} */ (context || {});
    const triples = Array.isArray(safeContext.triples) ? safeContext.triples : [];
    const referenceSentence = typeof safeContext.referenceSentence === 'string'
        ? safeContext.referenceSentence.trim()
        : '';
    const category = typeof safeContext.category === 'string' ? safeContext.category.trim() : '';
    const entryId = Number.isInteger(safeContext.entryId) ? safeContext.entryId : null;

    return [
        entryId ? `Entry ID: ${entryId}` : null,
        category ? `Categoria: ${category}` : null,
        triples.length
            ? `Triples RDF:\n${formatTriples(triples)}`
            : 'Triples RDF: no disponibles.',
        referenceSentence
            ? `Oracion de referencia en ingles: ${referenceSentence}`
            : 'Oracion de referencia en ingles: no disponible.',
        `Oracion en espanol a validar: ${sentence}`,
        'Devuelve unicamente el JSON solicitado.'
    ].filter(Boolean).join('\n\n');
}

/**
 * Formats RDF triples for inclusion in prompts.
 * @param {Array<*>} triples - RDF triples.
 * @returns {string} Formatted lines.
 */
function formatTriples(triples) {
    return triples.map((triple, index) => formatTripleLine(triple, index)).join('\n');
}

/**
 * Formats a single RDF triple.
 * @param {*} triple - RDF triple.
 * @param {number} index - Index.
 * @returns {string} Formatted line.
 */
function formatTripleLine(triple, index) {
    return `${index + 1}. ${triple.subject} | ${triple.predicate} | ${triple.object}`;
}

/**
 * Builds the batch validation prompt.
 * @param {Array<*>} sentences - Candidate sentences.
 * @param {*} context - RDF context and references.
 * @returns {string} Full prompt.
 */
function buildBatchCheckPrompt(sentences, context = {}) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const triples = Array.isArray(context.triples) ? context.triples : [];
    const englishSentences = normalizeStringArray(context.englishSentences);
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const entryId = Number.isInteger(context.entryId) ? context.entryId : null;

    const requiredIndexes = normalizedSentences.map((_sentence, index) => index);
    const rdfSchematic = buildRdfSchematic(triples);
    const payload = {
        entry: {
            entryId,
            category: category || null
        },
        requiredSentenceIndexes: requiredIndexes,
        triples: triples.map((/** @type {*} */ triple) => ({
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object
        })),
        references: normalizedSentences.map((_sentence, index) => {
            const english = englishSentences[index];
            if (typeof english === 'string')
                return { sentenceIndex: index, english };
            return { sentenceIndex: index, english: null, rdfSchematic };
        }),
        candidates: normalizedSentences.map((sentence, index) => ({
            sentenceIndex: index,
            spanishCandidate: sentence,
            referenceAvailable: typeof englishSentences[index] === 'string'
        }))
    };

    return [
        `Indices obligatorios: ${requiredIndexes.join(', ') || '(ninguno)'}.`,
        'Valida todos esos indices. Cuando references[i].english sea null, usa references[i].rdfSchematic como recordatorio del triple, NO como texto a comparar.',
        'Entrada JSON:',
        JSON.stringify(payload, null, 2),
        'Salida obligatoria: JSON con validations en el mismo orden de Indices obligatorios.'
    ].join('\n\n');
}

/**
 * Builds the prompt for correction proposals.
 * @param {Array<*>} sentences - Candidate sentences.
 * @param {*} context - RDF context.
 * @param {Array<*>} validations - Previous validations.
 * @returns {?string} Prompt, or null if there is nothing to correct.
 */
function buildCorrectionProposalPrompt(sentences, context = {}, validations = []) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const targets = normalizedSentences
        .map((sentence, index) => ({
            sentenceIndex: index,
            spanishCandidate: sentence,
            validation: Array.isArray(validations) ? validations[index] : null
        }))
        .filter(target => isRejectedValidation(target.validation));

    if (!targets.length)
        return null;

    const triples = Array.isArray(context.triples) ? context.triples : [];
    const englishSentences = normalizeStringArray(context.englishSentences);
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const entryId = Number.isInteger(context.entryId) ? context.entryId : null;
    const payload = {
        entry: {
            entryId,
            category: category || null
        },
        triples: triples.map((/** @type {*} */ triple) => ({
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object
        })),
        targets: targets.map(target => ({
            sentenceIndex: target.sentenceIndex,
            spanishCandidate: target.spanishCandidate,
            englishReference: englishSentences[target.sentenceIndex] || null,
            reason: normalizeProposalReason(target.validation),
            alerts: Array.isArray(target.validation?.alerts)
                ? target.validation.alerts.map((/** @type {*} */ alert) => ({
                    code: alert.code,
                    severity: alert.severity,
                    message: alert.message
                }))
                : []
        }))
    };

    return [
        `Indices que necesitan propuesta: ${targets.map(target => target.sentenceIndex).join(', ')}.`,
        'Genera exactamente una propuesta corregida para cada indice.',
        'Entrada JSON:',
        JSON.stringify(payload, null, 2),
        'Salida obligatoria: JSON con proposals para los mismos sentenceIndex.'
    ].join('\n\n');
}

/**
 * Builds a textual schema with the triples to use as rdfSchematic.
 * @param {Array<*>} triples - RDF triples.
 * @returns {string} Schema "subject | predicate | object" separated by " ; ".
 */
function buildRdfSchematic(triples) {
    if (!Array.isArray(triples) || triples.length === 0)
        return '(sin triples)';

    return triples
        .map(triple => `${triple.subject} | ${triple.predicate} | ${triple.object}`)
        .join(' ; ');
}

/**
 * Normalizes the Ollama model response into a validation result.
 * @param {*} result - Raw model response.
 * @param {*} sentence - Original validated sentence.
 * @returns {*} Normalized result with valid, reason, suggestion and alerts.
 */
function normalizeOllamaResult(result, sentence) {
    if (!result || typeof result !== 'object') {
        return {
            valid: true,
            reason: null,
            suggestion: null
        };
    }

    const alerts = normalizeAlerts(result.alerts);
    const valid = result.valid !== false
        && !alerts.some(alert => alert.severity === 'error' || alert.severity === 'warning');
    const trimmedSentence = typeof sentence === 'string' ? sentence.trim() : '';
    const reason = typeof result.reason === 'string' && result.reason.trim().length > 0
        ? result.reason.trim()
        : null;
    const suggestion = typeof result.suggestion === 'string' && result.suggestion.trim().length > 0
        ? result.suggestion.trim()
        : null;

    if (valid) {
        return {
            valid: true,
            reason: null,
            suggestion: null
        };
    }

    return {
        valid: false,
        reason: reason || 'Se han detectado problemas en la oracion.',
        suggestion: suggestion || firstAlertSuggestion(alerts) || trimmedSentence || null,
        ...(alerts.length ? { alerts } : {})
    };
}

/**
 * Normalizes the Ollama batch response.
 * @param {*} result - Parsed Ollama response.
 * @param {Array<*>} sentences - Original sentences.
 * @returns {Array<*>} Normalized validations.
 */
function normalizeBatchOllamaResult(result, sentences) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const rawValidations = extractRawValidations(result);

    return normalizedSentences.map((sentence, index) => {
        const raw = findValidationForIndex(rawValidations, index);
        return normalizeBatchValidation(raw, sentence);
    });
}

/**
 * Normalizes correction proposals indexed by sentence.
 * @param {*} result - Parsed Ollama response.
 * @param {Array<*>} sentences - Original sentences.
 * @returns {Array<?string>} Proposals by index.
 */
function normalizeCorrectionProposalResult(result, sentences) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const rawProposals = extractRawProposals(result);

    return normalizedSentences.map((_sentence, index) => {
        const raw = findProposalForIndex(rawProposals, index);
        if (!raw || typeof raw !== 'object')
            return null;

        return normalizeProposalText(
            raw.proposal
            ?? raw.suggestion
            ?? raw.correctedSentence
            ?? raw.sentence
        );
    });
}

/**
 * Finds a proposal by index, with positional fallback only if there are no explicit indexes.
 * @param {Array<*>} proposals - Raw proposals.
 * @param {number} index - Searched index.
 * @returns {*} Found proposal.
 */
function findProposalForIndex(proposals, index) {
    if (!Array.isArray(proposals))
        return null;

    const hasExplicitIndexes = proposals.some(proposal => proposal && (
        proposal.sentenceIndex !== undefined
        || proposal.index !== undefined
        || proposal.id !== undefined
    ));

    if (hasExplicitIndexes) {
        return proposals.find(proposal => Number(proposal && (
            proposal.sentenceIndex
            ?? proposal.index
            ?? proposal.id
        )) === index) || null;
    }

    return proposals[index] || null;
}

/**
 * Extracts proposals from tolerated formats.
 * @param {*} result - Parsed response.
 * @returns {Array<*>} Raw proposals.
 */
function extractRawProposals(result) {
    if (Array.isArray(result))
        return result;

    if (!result || typeof result !== 'object')
        return [];

    if (Array.isArray(result.proposals))
        return result.proposals;

    if (Array.isArray(result.suggestions))
        return result.suggestions;

    if (Array.isArray(result.corrections))
        return result.corrections;

    return [];
}

/**
 * Extracts validations from tolerated formats.
 * @param {*} result - Parsed response.
 * @returns {Array<*>} Raw validations.
 */
function extractRawValidations(result) {
    if (Array.isArray(result))
        return result;

    if (!result || typeof result !== 'object')
        return [];

    if (Array.isArray(result.validations))
        return result.validations;

    if (Array.isArray(result.results))
        return result.results;

    if (Array.isArray(result.sentences))
        return result.sentences;

    return [];
}

/**
 * Finds a validation by index, with positional fallback.
 * @param {Array<*>} validations - Raw validations.
 * @param {number} index - Searched index.
 * @returns {*} Found validation.
 */
function findValidationForIndex(validations, index) {
    if (!Array.isArray(validations))
        return null;

    return validations.find(validation => Number(validation && (
        validation.sentenceIndex
        ?? validation.index
        ?? validation.id
    )) === index) || validations[index] || null;
}

/**
 * Normalizes a single batch validation.
 * @param {*} raw - Raw validation.
 * @param {*} sentence - Original sentence.
 * @returns {*} Normalized validation.
 */
function normalizeBatchValidation(raw, sentence) {
    const trimmedSentence = typeof sentence === 'string' ? sentence.trim() : '';

    if (!raw || typeof raw !== 'object') {
        return {
            valid: false,
            reason: 'Ollama no devolvio una validacion para esta oracion.',
            suggestion: trimmedSentence || null,
            alerts: [buildValidationAlert({
                code: 'llm_missing_validation',
                type: 'semantic',
                severity: 'warning',
                source: 'llm',
                message: 'Ollama no devolvio una validacion para esta oracion.',
                suggestion: trimmedSentence || null,
                lowConfidence: true
            })]
        };
    }

    const alerts = normalizeAlerts(raw.alerts);
    const reason = typeof raw.reason === 'string' && raw.reason.trim().length > 0
        ? raw.reason.trim()
        : null;
    const suggestion = typeof raw.suggestion === 'string' && raw.suggestion.trim().length > 0
        ? raw.suggestion.trim()
        : firstAlertSuggestion(alerts);
    const explicitValid = raw.valid !== false && raw.isValid !== false;
    const hasBlockingAlert = alerts.some(alert => alert.severity === 'error' || alert.severity === 'warning');
    const valid = explicitValid && !hasBlockingAlert;

    if (valid) {
        return {
            valid: true,
            reason: null,
            suggestion: null,
            ...(alerts.length ? { alerts } : {})
        };
    }

    return {
        valid: false,
        reason: reason || firstAlertMessage(alerts) || 'Se han detectado problemas en la oracion.',
        suggestion: suggestion || trimmedSentence || null,
        ...(alerts.length ? { alerts } : {})
    };
}

/**
 * Normalizes alerts returned by Ollama, applying the catalogue's fixed messages.
 * The LLM returns {code, explanation?, severity?, suggestion?}; the final message
 * is built from the catalogue to avoid generic or invented messages.
 * @param {*} alerts - Raw alerts.
 * @returns {Array<*>} Normalized alerts with fixed messages.
 */
function normalizeAlerts(alerts) {
    if (!Array.isArray(alerts))
        return [];

    return alerts
        .map(alert => {
            if (typeof alert === 'string') {
                return buildValidationAlert({
                    code: 'llm_review',
                    source: 'llm',
                    message: alert
                });
            }

            if (!alert || typeof alert !== 'object')
                return null;

            const code = typeof alert.code === 'string' ? alert.code.trim() : null;
            const explanation = alert.explanation ?? alert.message ?? null;
            const catalogEntry = code && isKnownCode(code) ? (/** @type {Record<string, any>} */ (VALIDATION_CODES))[code] : null;

            const resolvedMessage = catalogEntry
                ? resolveMessage(code, typeof explanation === 'string' ? explanation : null)
                : (typeof explanation === 'string' && explanation.trim().length > 0
                    ? explanation.trim()
                    : 'Problema de validacion.');

            const catalogSeverity = catalogEntry ? catalogEntry.severity : null;
            const resolvedSeverity = catalogSeverity && catalogSeverity !== 'duplicate' && catalogSeverity !== 'ok'
                ? catalogSeverity
                : (alert.severity || 'warning');

            const resolvedType = catalogEntry ? catalogEntry.type : (alert.type || 'semantic');

            return buildValidationAlert({
                code: code || 'llm_review',
                type: resolvedType,
                severity: resolvedSeverity,
                source: alert.source || 'llm',
                message: resolvedMessage,
                suggestion: alert.suggestion || null
            });
        })
        .filter(Boolean);
}

/**
 * Gets the first alert message.
 * @param {Array<*>} alerts - Alerts.
 * @returns {?string} Message.
 */
function firstAlertMessage(alerts) {
    const first = Array.isArray(alerts) ? alerts.find(alert => alert?.message) : null;
    return first ? first.message : null;
}

/**
 * Gets the first alert suggestion.
 * @param {Array<*>} alerts - Alerts.
 * @returns {?string} Suggestion.
 */
function firstAlertSuggestion(alerts) {
    const first = Array.isArray(alerts) ? alerts.find(alert => alert?.suggestion) : null;
    return first ? first.suggestion : null;
}

/**
 * Checks whether a validation needs a proposal.
 * @param {*} validation - Previous validation.
 * @returns {boolean} True if it was rejected.
 */
function isRejectedValidation(validation) {
    if (!validation || typeof validation !== 'object')
        return false;

    const explicitValid = validation.valid === true || validation.isValid === true;
    if (explicitValid)
        return false;

    return validation.valid === false
        || validation.isValid === false
        || (Array.isArray(validation.alerts) && validation.alerts.some((/** @type {*} */ alert) => (
            alert && (alert.severity === 'error' || alert.severity === 'warning')
        )));
}

/**
 * Normalizes the reason included in the proposal prompt.
 * @param {*} validation - Previous validation.
 * @returns {?string} Reason.
 */
function normalizeProposalReason(validation) {
    if (validation && typeof validation.reason === 'string' && validation.reason.trim().length > 0)
        return validation.reason.trim();

    const first = Array.isArray(validation?.alerts)
        ? validation.alerts.find((/** @type {*} */ alert) => alert && typeof alert.message === 'string' && alert.message.trim().length > 0)
        : null;

    return first ? first.message.trim() : null;
}

/**
 * Normalizes a correction proposal.
 * @param {*} value - Candidate text.
 * @returns {?string} Normalized text.
 */
function normalizeProposalText(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes an array of strings.
 * @param {*} values - Values.
 * @returns {Array<string>} Non-empty strings.
 */
function normalizeStringArray(values) {
    if (!Array.isArray(values))
        return [];

    return values
        .filter(value => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean);
}

module.exports = {
    check,
    checkBatch,
    proposeCorrectionsBatch
};
