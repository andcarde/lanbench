'use strict';

/**
 * @file DTO mappers — convert loose internal objects (Prisma rows, parser
 * outputs, LLM responses) into the canonical DTOs declared in
 * `contracts/dtos.json`. These mappers are the single point where weakly
 * typed data gets normalised before being sent to the frontend or persisted.
 *
 * Every exported function returns an object that conforms to the schema in
 * `dtos.json`; consumers can therefore treat its return type as the matching
 * typedef in `types/typedefs.js`.
 *
 * @typedef {import('../types/typedefs').DatasetListDTO}      DatasetListDTO
 * @typedef {import('../types/typedefs').DatasetSectionDTO}   DatasetSectionDTO
 * @typedef {import('../types/typedefs').EntryContextDTO}     EntryContextDTO
 * @typedef {import('../types/typedefs').SentenceValidationDTO} SentenceValidationDTO
 * @typedef {import('../types/typedefs').SavedAnnotationDTO}  SavedAnnotationDTO
 * @typedef {import('../types/typedefs').ValidationAlertDTO}  ValidationAlertDTO
 * @typedef {import('../types/typedefs').TripleDTO}           TripleDTO
 * @typedef {import('../types/typedefs').DatasetPermissionsDTO} DatasetPermissionsDTO
 * @typedef {import('../types/typedefs').DatasetReviewStateDTO} DatasetReviewStateDTO
 * @typedef {import('../types/typedefs').DatasetOptionsDTO}   DatasetOptionsDTO
 * @typedef {import('../types/typedefs').SessionAdvanceDTO}   SessionAdvanceDTO
 */

const { normalizePercent, toIntegerNormalized } = require('../utils/validators');

/** Nombre por defecto cuando no llega ninguno. */
const DEFAULT_DATASET_NAME = 'DATASET 1';
/** Clase CSS por defecto cuando no llega ninguna. */
const DEFAULT_COLOR_CLASS = 'dataset-purple';
/** Codigo por defecto al construir una alerta generica. */
const DEFAULT_ALERT_CODE = 'sentence_review';
/** Severidad por defecto al construir una alerta generica. */
const DEFAULT_ALERT_SEVERITY = 'warning';
/** Mensaje por defecto cuando no hay texto util en el origen. */
const DEFAULT_ALERT_MESSAGE = 'La oracion requiere revision.';

/**
 * Convierte un objeto-fuente con metricas/permisos de un dataset en un
 * {@link DatasetListDTO} apto para listados y tooltips.
 *
 * El parametro `source` se documenta como `Record<string, any>` porque
 * proviene de Prisma rows, mocks, fixtures o estructuras heredadas con
 * jerarquia variable (`progress.completed`, `metrics.rdfTriples`, ...).
 *
 * @param {Record<string, any> | null | undefined} source - Objeto-fuente loose.
 * @param {number} [fallbackId] - Id de respaldo si el origen no aporta uno valido.
 * @returns {DatasetListDTO}
 */
function mapDatasetListDTO(source, fallbackId = 1) {
    const id = toRequiredPositiveInteger(source?.id ?? source?.datasetId, fallbackId);

    return withOptionalFields({
        id,
        name: normalizeRequiredString(source?.name, id > 0 ? `DATASET ${id}` : DEFAULT_DATASET_NAME),
        totalEntries: toIntegerNormalized(
            source?.totalEntries
            ?? source?.triplesRDF
            ?? source?.metrics?.rdfTriples
            ?? 0
        ),
        completedPercent: normalizePercent(source?.completedPercent ?? source?.progress?.completed ?? 0),
        remainPercent: normalizePercent(source?.remainPercent ?? source?.progress?.remaining ?? 100)
    }, {
        withoutReviewPercent: normalizeOptionalPercent(
            source?.withoutReviewPercent ?? source?.progress?.withoutReview
        ),
        languages: normalizeOptionalStringArray(source?.languages ?? source?.metrics?.languages),
        permissions: normalizeDatasetPermissions(source?.permissions),
        review: normalizeDatasetReviewState(source?.review),
        options: normalizeDatasetOptions(source?.options ?? source),
        colorClass: normalizeOptionalString(source?.colorClass ?? source?.ui?.colorClass) || DEFAULT_COLOR_CLASS
    });
}

/**
 * Mapea un array de objetos-fuente a {@link DatasetListDTO}. Asigna un
 * `fallbackId` ascendente (1, 2, ...) para origenes sin id propio.
 *
 * @param {Array<Record<string, any>> | unknown} sources
 * @returns {DatasetListDTO[]}
 */
function mapDatasetListDTOs(sources) {
    if (!Array.isArray(sources))
        return [];

    return sources.map((/** @type {Record<string, any>} */ source, index) => mapDatasetListDTO(source, index + 1));
}

/**
 * Convierte un objeto-fuente en un {@link DatasetSectionDTO} canonico.
 *
 * @param {Record<string, any> | null | undefined} source
 * @returns {DatasetSectionDTO}
 */
function mapDatasetSectionDTO(source) {
    const sectionIndex = toRequiredPositiveInteger(source?.sectionIndex ?? source?.section?.number, 1);
    const entries = Array.isArray(source?.entries)
        ? source.entries.map((/** @type {*} */ entry) => mapEntryContextDTO(entry, { sectionIndex }))
        : [];

    return withOptionalFields({
        sectionIndex,
        totalEntries: toIntegerNormalized(source?.totalEntries ?? source?.section?.totalEntries ?? entries.length),
        entries
    }, {
        datasetId: toOptionalPositiveInteger(source?.datasetId ?? source?.dataset?.datasetId ?? source?.dataset?.id),
        datasetName: normalizeOptionalString(source?.datasetName ?? source?.dataset?.name),
        totalSections: toOptionalPositiveInteger(source?.totalSections ?? source?.dataset?.totalSections),
        sectionSize: toOptionalPositiveInteger(source?.sectionSize ?? source?.section?.size),
        startEntry: toOptionalPositiveInteger(source?.startEntry ?? source?.section?.startEntry),
        endEntry: toOptionalPositiveInteger(source?.endEntry ?? source?.section?.endEntry),
        isLastSection: normalizeOptionalBoolean(source?.isLastSection ?? source?.section?.isLastSection)
    });
}

/**
 * Convierte un objeto-fuente en un {@link EntryContextDTO} canonico.
 * Si el origen no aporta `sectionIndex`, se usa el argumento opcional.
 *
 * @param {Record<string, any> | null | undefined} source
 * @param {{ sectionIndex?: number|null }} [context]
 * @returns {EntryContextDTO}
 */
function mapEntryContextDTO(source, { sectionIndex = null } = {}) {
    const triples = normalizeTriples(source?.triples ?? source?.originalTriples ?? source?.modifiedTriples);

    return withOptionalFields({
        entryId: toRequiredPositiveInteger(source?.entryId ?? source?.eid ?? source?.rdfId, 0),
        triples,
        englishSentences: normalizeOptionalStringArray(source?.englishSentences ?? source?.sourceSentences) || [],
        sectionIndex: toRequiredPositiveInteger(source?.sectionIndex ?? sectionIndex, 1)
    }, {
        category: normalizeEntryCategory(source?.category, triples)
    });
}

/**
 * Convierte el resultado bruto de un validador (LLM o reglas) en un
 * {@link SentenceValidationDTO} canonico. Si `result.isValid` es falso y no
 * incluye alertas, se sintetiza una alerta a partir de `reason`/`message`.
 *
 * @param {Record<string, any> | null | undefined} result
 * @param {string} [sentence] - Oracion original (para fallback de `result.sentence`).
 * @returns {SentenceValidationDTO}
 */
function mapSentenceValidationDTO(result, sentence = '') {
    const alerts = normalizeAlerts(result?.alerts);
    const isValid = typeof result?.isValid === 'boolean'
        ? result.isValid
        : Boolean(result?.valid);
    const proposal = normalizeOptionalString(
        result?.proposal
        ?? result?.correctionProposal
        ?? result?.proposedSentence
    );

    if (isValid) {
        return withOptionalFields({
            sentence: normalizeRequiredString(result?.sentence, sentence),
            isValid: true,
            alerts,
            rejectionReasons: normalizeOptionalStringArray(result?.rejectionReasons ?? result?.rejectionReason) || []
        }, {
            proposal
        });
    }

    return withOptionalFields({
        sentence: normalizeRequiredString(result?.sentence, sentence),
        isValid: false,
        alerts: alerts.length > 0
            ? alerts
            : [buildAlert(/** @type {*} */ {
                message: result?.reason ?? result?.message,
                suggestion: result?.suggestion
            })],
        rejectionReasons: normalizeOptionalStringArray(result?.rejectionReasons ?? result?.rejectionReason) || []
    }, /** @type {*} */ {
        proposal
    });
}

/**
 * Mapea, en paralelo por indice, una lista de oraciones y una lista de
 * resultados de validacion. El array devuelto tiene siempre la longitud
 * maxima de ambas entradas.
 *
 * @param {string[]} sentences
 * @param {Array<Record<string, any>>} results
 * @returns {SentenceValidationDTO[]}
 */
function mapSentenceValidationDTOs(sentences, results) {
    const sourceSentences = Array.isArray(sentences) ? sentences : [];
    const sourceResults = Array.isArray(results) ? results : [];
    const length = Math.max(sourceSentences.length, sourceResults.length);

    return Array.from({ length }, (_value, index) => mapSentenceValidationDTO(
        sourceResults[index],
        sourceSentences[index] || ''
    ));
}

/**
 * Convierte el resultado de persistir una anotacion en un
 * {@link SavedAnnotationDTO} canonico.
 *
 * @param {Record<string, any>} input
 * @returns {SavedAnnotationDTO}
 */
function mapSavedAnnotationDTO({
    entryId,
    datasetId,
    sentences,
    savedAt = new Date().toISOString(),
    sectionCompleted = null,
    sessionAdvance = null
}) {
    return withOptionalFields({
        entryId: toRequiredPositiveInteger(entryId, 0),
        sentences: normalizeOptionalStringArray(sentences) || [],
        savedAt: normalizeIsoDate(savedAt)
    }, {
        datasetId: toOptionalPositiveInteger(datasetId),
        sectionCompleted: typeof sectionCompleted === 'boolean' ? sectionCompleted : null,
        sessionAdvance: normalizeSessionAdvance(sessionAdvance)
    });
}

/**
 * Normaliza el avance de sesion devuelto tras guardar anotaciones.
 * @param {Record<string, any> | null | undefined} source - Resultado de continueDatasetService.advanceSession.
 * @returns {SessionAdvanceDTO|null} DTO de avance o null si la entrada no es valida.
 */
function normalizeSessionAdvance(source) {
    if (!source || typeof source !== 'object')
        return null;

    const sectionDone = Boolean(source.sectionDone);
    return withOptionalFields({
        sectionDone
    }, {
        sectionNumber: toOptionalPositiveInteger(source.sectionNumber),
        entryPosition: toOptionalNonNegativeInteger(source.entryPosition),
        entryId: toOptionalPositiveInteger(source.entryId),
        entryIndexInSection: Number.isInteger(Number(source.entryIndexInSection))
            ? Number(source.entryIndexInSection)
            : null,
        moreSectionsAvailable: typeof source.moreSectionsAvailable === 'boolean'
            ? source.moreSectionsAvailable
        : null
    });
}

/**
 * Convierte un valor opcional a entero no negativo.
 * @param {string|number|null|undefined} value - Valor recibido.
 * @returns {number|null} Entero normalizado o null si el valor no es valido.
 */
function toOptionalNonNegativeInteger(value) {
    if (value === null || value === undefined)
        return null;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0)
        return null;

    return parsed;
}

/**
 * Convierte un `EntryContext` recibido del frontend a la forma interna
 * esperada por los servicios (con `eid`, `sourceSentences`, ...).
 *
 * @param {Record<string, any> | null | undefined} entryContext
 * @returns {{ eid: number|null, category: string, sourceSentences: string[], triples: TripleDTO[] }|null}
 */
function normalizeIncomingEntryContext(entryContext) {
    if (!entryContext || typeof entryContext !== 'object')
        return null;

    const triples = /** @type {TripleDTO[]} */ (normalizeTriples(entryContext.triples));

    return {
        eid: toOptionalPositiveInteger(entryContext.entryId ?? entryContext.eid),
        category: normalizeEntryCategory(entryContext.category, triples) || '',
        sourceSentences: normalizeOptionalStringArray(
            entryContext.englishSentences ?? entryContext.sourceSentences
        ) || [],
        triples
    };
}

/**
 * Normaliza `category` usando los triples cuando el XML trae una categoria
 * inconsistente (caso conocido: WebNLG marca `Airport` para entidades que
 * no son aeropuertos, donde se reescribe a `Place`).
 *
 * @param {string|null|undefined} category - Categoria original.
 * @param {TripleDTO[]} triples            - Triples normalizados.
 * @returns {string|null} Categoria corregida (null si no habia categoria).
 */
function normalizeEntryCategory(category, triples) {
    const normalized = normalizeOptionalString(category);
    if (!normalized)
        return null;

    if (normalized.toLowerCase() !== 'airport')
        return normalized;

    if (!Array.isArray(triples) || triples.length === 0)
        return normalized;

    return triples.some(tripleHasAirportEntity)
        ? normalized
        : 'Place';
}

/**
 * Comprueba si algun extremo del triple apunta claramente a un aeropuerto
 * (heuristica sobre `subject`/`object` que incluye `airport`/`aeropuerto`).
 *
 * @param {TripleDTO} triple - Triple RDF normalizado.
 * @returns {boolean}
 */
function tripleHasAirportEntity(triple) {
    return /** @type {Array<'subject'|'object'>} */ (['subject', 'object']).some(field => {
        const value = typeof triple[field] === 'string' ? triple[field].toLowerCase() : '';
        return value.includes('airport') || value.includes('aeropuerto');
    });
}

/**
 * Normaliza una lista de triples RDF. Descarta los triples con campos
 * vacios o de tipo incorrecto.
 *
 * @param {unknown} triples
 * @returns {TripleDTO[]}
 */
function normalizeTriples(triples) {
    if (!Array.isArray(triples))
        return [];

    /** @type {TripleDTO[]} */
    const result = [];
    for (const triple of triples) {
        if (!triple || typeof triple !== 'object')
            continue;

        const subject = normalizeOptionalString(triple.subject);
        const predicate = normalizeOptionalString(triple.predicate);
        const object = normalizeOptionalString(triple.object);

        if (!subject || !predicate || !object)
            continue;

        result.push({ subject, predicate, object });
    }
    return result;
}

/**
 * Normaliza una lista heterogenea de alertas (strings u objetos parciales)
 * a un array tipado de {@link ValidationAlertDTO}.
 *
 * @param {unknown} alerts
 * @returns {ValidationAlertDTO[]}
 */
function normalizeAlerts(alerts) {
    if (!Array.isArray(alerts))
        return [];

    /** @type {ValidationAlertDTO[]} */
    const result = [];
    for (const alert of alerts) {
        if (typeof alert === 'string') {
            result.push(buildAlert({ message: alert }));
            continue;
        }
        if (!alert || typeof alert !== 'object')
            continue;
        result.push(buildAlert(alert));
    }
    return result;
}

/**
 * Construye una {@link ValidationAlertDTO} aplicando los defaults declarados
 * en este modulo cuando algun campo obligatorio falte.
 *
 * @param {Partial<ValidationAlertDTO>} [input]
 * @returns {ValidationAlertDTO}
 */
function buildAlert({ code, severity, message, suggestion } = {}) {
    return /** @type {ValidationAlertDTO} */ (withOptionalFields({
        code: normalizeRequiredString(code, DEFAULT_ALERT_CODE),
        severity: normalizeRequiredString(severity, DEFAULT_ALERT_SEVERITY),
        message: normalizeRequiredString(message, DEFAULT_ALERT_MESSAGE)
    }, {
        suggestion: normalizeOptionalString(suggestion)
    }));
}

/**
 * Devuelve `value.trim()` si es una cadena con contenido util; en otro caso
 * devuelve `fallback`.
 *
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeRequiredString(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Como {@link normalizeRequiredString} pero devuelve `null` cuando el valor
 * no es una cadena util.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeOptionalString(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normaliza una lista de cadenas (filtra no-strings, aplica `trim`, descarta
 * cadenas vacias). Devuelve `null` si la entrada no era un array.
 *
 * @param {unknown} values
 * @returns {string[]|null}
 */
function normalizeOptionalStringArray(values) {
    if (!Array.isArray(values))
        return null;

    return values
        .filter((/** @type {unknown} */ value) => typeof value === 'string')
        .map((/** @type {string} */ value) => value.trim())
        .filter(Boolean);
}

/**
 * Variante opcional de {@link normalizePercent}: devuelve `null` para
 * `null`/`undefined`, y delega para el resto.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizeOptionalPercent(value) {
    if (value === undefined || value === null)
        return null;

    return normalizePercent(value);
}

/**
 * Convierte cualquier representacion aceptada por `Date` en una cadena ISO.
 * Si la fecha es invalida, devuelve la fecha actual.
 *
 * @param {string|number|Date} value
 * @returns {string}
 */
function normalizeIsoDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return new Date().toISOString();
    return parsed.toISOString();
}

/**
 * Devuelve `value` si es booleano, en otro caso `null`.
 *
 * @param {unknown} value
 * @returns {boolean|null}
 */
function normalizeOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

/**
 * Normaliza permisos del usuario actual sobre un dataset.
 * @param {*} permissions - Permisos de entrada.
 * @returns {*} Permisos normalizados.
 */
function normalizeDatasetPermissions(permissions) {
    if (!permissions || typeof permissions !== 'object')
        return null;

    return {
        annotator: Boolean(permissions.annotator ?? permissions.isAnnotator),
        reviewer: Boolean(permissions.reviewer ?? permissions.isReviewer),
        admin: Boolean(permissions.admin ?? permissions.isAdmin),
        owner: Boolean(permissions.owner ?? permissions.isOwned),
        canAdmin: Boolean(permissions.canAdmin ?? permissions.admin ?? permissions.isAdmin ?? permissions.owner ?? permissions.isOwned)
    };
}

/**
 * Normaliza estado de revision del usuario actual sobre un dataset.
 * @param {*} review - Estado de entrada.
 * @returns {*} Estado normalizado.
 */
function normalizeDatasetReviewState(review) {
    if (!review || typeof review !== 'object')
        return null;

    return {
        canReview: Boolean(review.canReview),
        showReviewButton: Boolean(review.showReviewButton),
        reviewAvailable: Boolean(review.reviewAvailable),
        reviewableCount: toIntegerNormalized(review.reviewableCount ?? 0)
    };
}

/**
 * Normaliza opciones del dataset.
 * @param {*} options - Opciones de entrada.
 * @returns {*} Opciones normalizadas.
 */
function normalizeDatasetOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    const llmMode = normalizeOptionalString(source.llmMode);
    const isReviewEnabled = source.isReviewEnabled;
    const hasAdditionalReviews = source.hasAdditionalReviews;

    if (!llmMode && isReviewEnabled === undefined && hasAdditionalReviews === undefined)
        return null;

    return {
        llmMode: llmMode || 'none',
        isReviewEnabled: normalizeOptionalBoolean(isReviewEnabled) || false,
        hasAdditionalReviews: normalizeOptionalBoolean(hasAdditionalReviews) || false
    };
}

/**
 * Convierte un valor a entero positivo, o devuelve `null` si no es valido.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toOptionalPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

/**
 * Convierte un valor a entero positivo, recurriendo a `fallback` si no es
 * valido y finalmente a `1` si tampoco el fallback lo es.
 *
 * @param {unknown} value
 * @param {unknown} fallback
 * @returns {number}
 */
function toRequiredPositiveInteger(value, fallback) {
    return toOptionalPositiveInteger(value) || toOptionalPositiveInteger(fallback) || 1;
}

/**
 * Combina los campos obligatorios (`base`) con los opcionales (`optionalFields`),
 * descartando estos ultimos cuando son `null`/`undefined`. La devolucion es
 * `any` para que el llamante la trate como el DTO especifico que esperan
 * sus consumidores (cada `mapXxxDTO` declara su `@returns` concreto).
 *
 * @param {Record<string, any>} base
 * @param {Record<string, any> | null | undefined} optionalFields
 * @returns {any}
 */
function withOptionalFields(base, optionalFields) {
    /** @type {Record<string, any>} */
    const normalized = { ...base };

    for (const [key, value] of Object.entries(optionalFields || {})) {
        if (value !== null && value !== undefined)
            normalized[key] = value;
    }

    return normalized;
}

module.exports = {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO,
    mapSentenceValidationDTOs,
    mapSavedAnnotationDTO,
    normalizeIncomingEntryContext
};
