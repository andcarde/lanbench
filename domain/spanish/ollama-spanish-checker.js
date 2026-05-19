'use strict';

/**
 * @file Spanish checker basado en LLM (Ollama/Groq).
 *
 * Construye los prompts (sistema + usuario), llama al cliente JSON
 * `llm-client.generateJson`, y normaliza la respuesta del LLM al formato
 * de validacion canonico (con codigos `VALIDATION_CODES` + alertas).
 *
 * Expone tanto `check` (1 oracion) como `checkBatch` (lote), de forma que
 * `spanishService` pueda elegir la modalidad mas eficiente.
 */

const ollamaClient = require('../../utils/llm-client');
const { buildValidationAlert } = require('../../utils/validation-alert');
const { ALL_CODES, resolveMessage, isKnownCode, VALIDATION_CODES } = require('../../constants/validation-codes');

/**
 * Valida una unica oracion contra el contexto RDF e ingles dado, consultando
 * al LLM.
 *
 * @param {string} sentence
 * @param {Record<string, any>} [context]
 * @returns {Promise<Record<string, any>>}
 */
async function check(sentence, context = {}) {
    const prompt = buildCheckPrompt(sentence, context);
    const response = await ollamaClient.generateJson({
        system: getSystemPrompt(),
        prompt
    });

    return normalizeOllamaResult(response, sentence);
}

/**
 * Comprueba un lote de oraciones de una misma entry en una sola llamada al
 * LLM. Devuelve un array paralelo a `sentences`.
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
        prompt
    });

    return normalizeBatchOllamaResult(response, normalizedSentences);
}

/**
 * Solicita a Ollama propuestas corregidas para las oraciones rechazadas.
 * @param {Array<*>} sentences - Oraciones candidatas originales.
 * @param {*} context - Contexto RDF y referencias inglesas.
 * @param {Array<*>} validations - Validaciones ya calculadas.
 * @returns {Promise<Array<?string>>} Propuestas indexadas por sentenceIndex.
 */
async function proposeCorrectionsBatch(sentences, context = {}, validations = []) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const prompt = buildCorrectionProposalPrompt(normalizedSentences, context, validations);

    if (!prompt)
        return normalizedSentences.map(() => null);

    const response = await ollamaClient.generateJson({
        system: getCorrectionProposalSystemPrompt(),
        prompt
    });

    return normalizeCorrectionProposalResult(response, normalizedSentences);
}

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
 * Obtiene system prompt para validacion por lote.
 * @returns {string} Prompt del sistema.
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
 * Obtiene system prompt para generar propuestas de correccion.
 * @returns {string} Prompt del sistema.
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
 * Construye el prompt de validacion para una unica oracion.
 * @param {*} sentence - Oracion candidata.
 * @param {*} [context] - Contexto RDF (triples, referenceSentence, category, eid).
 * @returns {string} Prompt completo para el modelo.
 */
function buildCheckPrompt(sentence, context = {}) {
    const safeContext = /** @type {any} */ (context || {});
    const triples = Array.isArray(safeContext.triples) ? safeContext.triples : [];
    const referenceSentence = typeof safeContext.referenceSentence === 'string'
        ? safeContext.referenceSentence.trim()
        : '';
    const category = typeof safeContext.category === 'string' ? safeContext.category.trim() : '';
    const eid = Number.isInteger(safeContext.eid) ? safeContext.eid : null;

    return [
        eid ? `Entry ID: ${eid}` : null,
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
 * Formatea triples RDF para incluirlos en prompts.
 * @param {Array<*>} triples - Triples RDF.
 * @returns {string} Lineas formateadas.
 */
function formatTriples(triples) {
    return triples.map((triple, index) => formatTripleLine(triple, index)).join('\n');
}

/**
 * Formatea un triple RDF.
 * @param {*} triple - Triple RDF.
 * @param {number} index - Indice.
 * @returns {string} Linea formateada.
 */
function formatTripleLine(triple, index) {
    return `${index + 1}. ${triple.subject} | ${triple.predicate} | ${triple.object}`;
}

/**
 * Construye prompt de validacion por lote.
 * @param {Array<*>} sentences - Oraciones candidatas.
 * @param {*} context - Contexto RDF y referencias.
 * @returns {string} Prompt completo.
 */
function buildBatchCheckPrompt(sentences, context = {}) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    const triples = Array.isArray(context.triples) ? context.triples : [];
    const sourceSentences = normalizeStringArray(context.englishSentences || context.sourceSentences);
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const eid = Number.isInteger(context.eid ?? context.entryId)
        ? (context.eid ?? context.entryId)
        : null;

    const requiredIndexes = normalizedSentences.map((_sentence, index) => index);
    const rdfSchematic = buildRdfSchematic(triples);
    const payload = {
        entry: {
            entryId: eid,
            category: category || null
        },
        requiredSentenceIndexes: requiredIndexes,
        triples: triples.map((/** @type {*} */ triple) => ({
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object
        })),
        references: normalizedSentences.map((_sentence, index) => {
            const english = sourceSentences[index];
            if (typeof english === 'string')
                return { sentenceIndex: index, english };
            return { sentenceIndex: index, english: null, rdfSchematic };
        }),
        candidates: normalizedSentences.map((sentence, index) => ({
            sentenceIndex: index,
            spanishCandidate: sentence,
            referenceAvailable: typeof sourceSentences[index] === 'string'
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
 * Construye prompt para propuestas de correccion.
 * @param {Array<*>} sentences - Oraciones candidatas.
 * @param {*} context - Contexto RDF.
 * @param {Array<*>} validations - Validaciones previas.
 * @returns {?string} Prompt o null si no hay nada que corregir.
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
    const sourceSentences = normalizeStringArray(context.englishSentences || context.sourceSentences);
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const eid = Number.isInteger(context.eid ?? context.entryId)
        ? (context.eid ?? context.entryId)
        : null;
    const payload = {
        entry: {
            entryId: eid,
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
            englishReference: sourceSentences[target.sentenceIndex] || null,
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
 * Construye un esquema textual con los triples para usar como rdfSchematic.
 * @param {Array<*>} triples - Triples RDF.
 * @returns {string} Esquema "subject | predicate | object" separado por " ; ".
 */
function buildRdfSchematic(triples) {
    if (!Array.isArray(triples) || triples.length === 0)
        return '(sin triples)';

    return triples
        .map(triple => `${triple.subject} | ${triple.predicate} | ${triple.object}`)
        .join(' ; ');
}

/**
 * Normaliza la respuesta del modelo Ollama a un resultado de validacion.
 * @param {*} result - Respuesta cruda del modelo.
 * @param {*} sentence - Oracion original validada.
 * @returns {*} Resultado normalizado con valid, reason, suggestion y alerts.
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
 * Normaliza la respuesta por lote de Ollama.
 * @param {*} result - Respuesta parseada de Ollama.
 * @param {Array<*>} sentences - Oraciones originales.
 * @returns {Array<*>} Validaciones normalizadas.
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
 * Normaliza propuestas de correccion indexadas por oracion.
 * @param {*} result - Respuesta parseada de Ollama.
 * @param {Array<*>} sentences - Oraciones originales.
 * @returns {Array<?string>} Propuestas por indice.
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
 * Busca una propuesta por indice, con fallback posicional solo si no hay indices explicitos.
 * @param {Array<*>} proposals - Propuestas crudas.
 * @param {number} index - Indice buscado.
 * @returns {*} Propuesta encontrada.
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
 * Extrae propuestas desde formatos tolerados.
 * @param {*} result - Respuesta parseada.
 * @returns {Array<*>} Propuestas crudas.
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
 * Extrae validaciones desde formatos tolerados.
 * @param {*} result - Respuesta parseada.
 * @returns {Array<*>} Validaciones crudas.
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
 * Busca una validacion por indice, con fallback posicional.
 * @param {Array<*>} validations - Validaciones crudas.
 * @param {number} index - Indice buscado.
 * @returns {*} Validacion encontrada.
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
 * Normaliza una validacion individual de lote.
 * @param {*} raw - Validacion cruda.
 * @param {*} sentence - Oracion original.
 * @returns {*} Validacion normalizada.
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
 * Normaliza alertas devueltas por Ollama aplicando mensajes fijos del catalogo.
 * El LLM devuelve {code, explanation?, severity?, suggestion?}; el mensaje final
 * se construye desde el catalogo para evitar mensajes genericos o inventados.
 * @param {*} alerts - Alertas crudas.
 * @returns {Array<*>} Alertas normalizadas con mensajes fijos.
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
 * Obtiene primer mensaje de alerta.
 * @param {Array<*>} alerts - Alertas.
 * @returns {?string} Mensaje.
 */
function firstAlertMessage(alerts) {
    const first = Array.isArray(alerts) ? alerts.find(alert => alert?.message) : null;
    return first ? first.message : null;
}

/**
 * Obtiene primera sugerencia de alerta.
 * @param {Array<*>} alerts - Alertas.
 * @returns {?string} Sugerencia.
 */
function firstAlertSuggestion(alerts) {
    const first = Array.isArray(alerts) ? alerts.find(alert => alert?.suggestion) : null;
    return first ? first.suggestion : null;
}

/**
 * Comprueba si una validacion necesita propuesta.
 * @param {*} validation - Validacion previa.
 * @returns {boolean} True si fue rechazada.
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
 * Normaliza el motivo incluido en el prompt de propuesta.
 * @param {*} validation - Validacion previa.
 * @returns {?string} Motivo.
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
 * Normaliza una propuesta de correccion.
 * @param {*} value - Texto candidato.
 * @returns {?string} Texto normalizado.
 */
function normalizeProposalText(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normaliza array de strings.
 * @param {*} values - Valores.
 * @returns {Array<string>} Strings no vacios.
 */
function normalizeStringArray(values) {
    if (!Array.isArray(values))
        return [];

    return values
        .filter(value => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean);
}

/**
 * Extrae y parsea el primer objeto JSON contenido en una respuesta cruda del modelo.
 * @param {*} rawResponse - Texto bruto devuelto por Ollama.
 * @returns {*} Objeto JSON parseado.
 */
function parseRawResponse(rawResponse) {
    if (typeof rawResponse !== 'string')
        throw new Error('La respuesta de Ollama debe ser una cadena de texto.');

    const startIndex = rawResponse.indexOf('{');
    const endIndex = rawResponse.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
        throw new Error('No se detectó un JSON válido en la respuesta de Ollama.');

    try {
        const response = JSON.parse(rawResponse.substring(startIndex, endIndex + 1));
        if (typeof response !== 'object' || response === null)
            throw new Error('La respuesta parseada no es un objeto.');
        return response;
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        throw new Error(`No se pudo parsear la respuesta como JSON: ${error.message}`);
    }
}

module.exports = {
    check,
    checkBatch,
    proposeCorrectionsBatch,
    getSystemPrompt,
    getBatchSystemPrompt,
    getCorrectionProposalSystemPrompt,
    buildCheckPrompt,
    buildBatchCheckPrompt,
    buildCorrectionProposalPrompt,
    normalizeOllamaResult,
    normalizeBatchOllamaResult,
    normalizeCorrectionProposalResult,
    parseRawResponse
};
