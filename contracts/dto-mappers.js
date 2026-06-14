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

const { normalizePercent, toIntegerNormalized, trimmedOr } = require('../utils/validators');
const { DEFAULT_DATASET_COLOR } = require('../constants/datasets');

/** Default name when none is provided. */
const DEFAULT_DATASET_NAME = 'DATASET 1';
/** Default code when building a generic alert. */
const DEFAULT_ALERT_CODE = 'sentence_review';
/** Default severity when building a generic alert. */
const DEFAULT_ALERT_SEVERITY = 'warning';
/** Default message when there is no useful text in the source. */
const DEFAULT_ALERT_MESSAGE = 'La oracion requiere revision.';

/**
 * Converts a source object with a dataset's metrics/permissions into a
 * {@link DatasetListDTO} suitable for listings and tooltips.
 *
 * The canonical producer is `mapDatasetRecordToSource` in
 * `services/datasets-service.js`.
 *
 * @param {Record<string, any> | null | undefined} source - Canonical source object.
 * @param {number} [fallbackId] - Fallback id if the source does not provide a valid one.
 * @returns {DatasetListDTO}
 */
function mapDatasetListDTO(source, fallbackId = 1) {
    const id = toRequiredPositiveInteger(source?.id, fallbackId);

    return withOptionalFields({
        id,
        name: trimmedOr(source?.name, id > 0 ? `DATASET ${id}` : DEFAULT_DATASET_NAME),
        totalEntries: toIntegerNormalized(source?.totalEntries ?? 0),
        completedPercent: normalizePercent(source?.completedPercent ?? 0),
        remainPercent: normalizePercent(source?.remainPercent ?? 100)
    }, {
        description: trimmedOr(source?.description),
        withoutReviewPercent: normalizeOptionalPercent(source?.withoutReviewPercent),
        languages: trimmedOrArray(source?.languages),
        permissions: normalizeDatasetPermissions(source?.permissions),
        review: normalizeDatasetReviewState(source?.review),
        options: normalizeDatasetOptions(source?.options),
        hasActiveCredential: normalizeOptionalBoolean(source?.hasActiveCredential),
        colorClass: trimmedOr(source?.colorClass) || DEFAULT_DATASET_COLOR
    });
}

/**
 * Maps an array of source objects to {@link DatasetListDTO}. Assigns an
 * ascending `fallbackId` (1, 2, ...) for sources without their own id.
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
 * Converts a source object into a canonical {@link DatasetSectionDTO}.
 *
 * The canonical producer (`getAccessibleDatasetSection` in
 * `services/datasets-service.js`) already emits the flat shape defined in
 * `contracts/dtos.json`.
 *
 * @param {Record<string, any> | null | undefined} source
 * @returns {DatasetSectionDTO}
 */
function mapDatasetSectionDTO(source) {
    const sectionIndex = toRequiredPositiveInteger(source?.sectionIndex, 1);
    const entries = Array.isArray(source?.entries)
        ? source.entries.map((/** @type {*} */ entry) => mapEntryContextDTO(entry, { sectionIndex }))
        : [];

    return withOptionalFields({
        sectionIndex,
        totalEntries: toIntegerNormalized(source?.totalEntries ?? entries.length),
        entries
    }, {
        datasetId: toOptionalPositiveInteger(source?.datasetId),
        datasetName: trimmedOr(source?.datasetName),
        totalSections: toOptionalPositiveInteger(source?.totalSections),
        sectionSize: toOptionalPositiveInteger(source?.sectionSize),
        startEntry: toOptionalPositiveInteger(source?.startEntry),
        endEntry: toOptionalPositiveInteger(source?.endEntry),
        isLastSection: normalizeOptionalBoolean(source?.isLastSection)
    });
}

/**
 * Converts a source object into a canonical {@link EntryContextDTO}.
 * If the source does not provide `sectionIndex`, the optional argument is used.
 *
 * The canonical producer is `mapPersistedEntryToAnnotationEntry` in
 * `services/datasets-service.js`.
 *
 * @param {Record<string, any> | null | undefined} source
 * @param {{ sectionIndex?: number|null }} [context]
 * @returns {EntryContextDTO}
 */
function mapEntryContextDTO(source, { sectionIndex = null } = {}) {
    const triples = normalizeTriples(source?.triples);

    return withOptionalFields({
        entryId: toRequiredPositiveInteger(source?.entryId, 0),
        triples,
        englishSentences: trimmedOrArray(source?.englishSentences) || [],
        sectionIndex: toRequiredPositiveInteger(source?.sectionIndex ?? sectionIndex, 1)
    }, {
        category: normalizeEntryCategory(source?.category, triples)
    });
}

/**
 * Converts the raw result of a validator (LLM or rules) into a canonical
 * {@link SentenceValidationDTO}. If `result.valid` is false and includes no
 * alerts, an alert is synthesized from `reason`.
 *
 * The canonical producer (`normalizeCheckResult` in `annotations-service.js`)
 * emits `{ valid, reason, suggestion, proposal, alerts }`.
 *
 * @param {Record<string, any> | null | undefined} result
 * @param {string} [sentence] - Original sentence (fallback for `result.sentence`).
 * @returns {SentenceValidationDTO}
 */
function mapSentenceValidationDTO(result, sentence = '') {
    const alerts = normalizeAlerts(result?.alerts);
    const isValid = Boolean(result?.valid);
    const proposal = trimmedOr(result?.proposal);

    if (isValid) {
        return withOptionalFields({
            sentence: trimmedOr(result?.sentence, sentence),
            isValid: true,
            alerts,
            rejectionReasons: []
        }, {
            proposal
        });
    }

    return withOptionalFields({
        sentence: trimmedOr(result?.sentence, sentence),
        isValid: false,
        alerts: alerts.length > 0
            ? alerts
            : [buildAlert(/** @type {*} */ {
                message: result?.reason,
                suggestion: result?.suggestion
            })],
        rejectionReasons: []
    }, /** @type {*} */ {
        proposal
    });
}

/**
 * Maps, in parallel by index, a list of sentences and a list of validation
 * results. The returned array always has the maximum length of both inputs.
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
 * Converts the result of persisting an annotation into a canonical
 * {@link SavedAnnotationDTO}.
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
        sentences: trimmedOrArray(sentences) || [],
        savedAt: normalizeIsoDate(savedAt)
    }, {
        datasetId: toOptionalPositiveInteger(datasetId),
        sectionCompleted: typeof sectionCompleted === 'boolean' ? sectionCompleted : null,
        sessionAdvance: normalizeSessionAdvance(sessionAdvance)
    });
}

/**
 * Normalizes the session advance returned after saving annotations.
 * @param {Record<string, any> | null | undefined} source - Result of continueDatasetService.advanceSession.
 * @returns {SessionAdvanceDTO|null} Advance DTO, or null if the input is invalid.
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
 * Converts an optional value to a non-negative integer.
 * @param {string|number|null|undefined} value - Received value.
 * @returns {number|null} Normalized integer, or null if the value is invalid.
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
 * Maps a `DatasetLlmCredential` row to its masked DTO (US-31). The clear key
 * and the ciphertext are never exposed: only `provider`, `apiBase`, `model`,
 * `keyLast4` and `isActive` are returned.
 *
 * @param {Record<string, any> | null | undefined} row - Credential row.
 * @returns {{ provider: string, apiBase: string|null, model: string, keyLast4: string, isActive: boolean }}
 */
function mapDatasetLlmCredentialDTO(row) {
    const source = row && typeof row === 'object' ? row : {};

    return {
        provider: trimmedOr(source.provider, ''),
        apiBase: trimmedOr(source.apiBase),
        model: trimmedOr(source.model, ''),
        keyLast4: trimmedOr(source.keyLast4, ''),
        isActive: Boolean(source.isActive)
    };
}

/**
 * Maps an array of credential rows to masked DTOs.
 *
 * @param {Array<Record<string, any>> | unknown} rows
 * @returns {Array<{ provider: string, apiBase: string|null, model: string, keyLast4: string, isActive: boolean }>}
 */
function mapDatasetLlmCredentialDTOs(rows) {
    if (!Array.isArray(rows))
        return [];
    return rows.map(mapDatasetLlmCredentialDTO);
}

/**
 * Converts an `EntryContext` received from the frontend into the canonical
 * shape (`entryId`, `englishSentences`, `category`, `triples`) consumed by the
 * services. The frontend already emits the canonical shape
 * (`public/js/annotations.js`).
 *
 * @param {Record<string, any> | null | undefined} entryContext
 * @returns {{ entryId: number|null, category: string, englishSentences: string[], triples: TripleDTO[], datasetId?: number|null }|null}
 */
function normalizeIncomingEntryContext(entryContext) {
    if (!entryContext || typeof entryContext !== 'object')
        return null;

    const triples = /** @type {TripleDTO[]} */ (normalizeTriples(entryContext.triples));

    return withOptionalFields({
        entryId: toOptionalPositiveInteger(entryContext.entryId),
        category: normalizeEntryCategory(entryContext.category, triples) || '',
        englishSentences: trimmedOrArray(entryContext.englishSentences) || [],
        triples
    }, {
        datasetId: toOptionalPositiveInteger(entryContext.datasetId)
    });
}

/**
 * Normalizes `category` using the triples when the XML brings an inconsistent
 * category (known case: WebNLG marks `Airport` for entities that are not
 * airports, where it is rewritten to `Place`).
 *
 * @param {string|null|undefined} category - Original category.
 * @param {TripleDTO[]} triples            - Normalized triples.
 * @returns {string|null} Corrected category (null if there was no category).
 */
function normalizeEntryCategory(category, triples) {
    const normalized = trimmedOr(category);
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
 * Checks whether either end of the triple clearly points to an airport
 * (heuristic over `subject`/`object` that includes `airport`/`aeropuerto`).
 *
 * @param {TripleDTO} triple - Normalized RDF triple.
 * @returns {boolean}
 */
function tripleHasAirportEntity(triple) {
    return /** @type {Array<'subject'|'object'>} */ (['subject', 'object']).some(field => {
        const value = typeof triple[field] === 'string' ? triple[field].toLowerCase() : '';
        return value.includes('airport') || value.includes('aeropuerto');
    });
}

/**
 * Normalizes a list of RDF triples. Discards triples with empty or
 * wrongly-typed fields.
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

        const subject = trimmedOr(triple.subject);
        const predicate = trimmedOr(triple.predicate);
        const object = trimmedOr(triple.object);

        if (!subject || !predicate || !object)
            continue;

        result.push({ subject, predicate, object });
    }
    return result;
}

/**
 * Normalizes a heterogeneous list of alerts (strings or partial objects) into
 * a typed array of {@link ValidationAlertDTO}.
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
 * Builds a {@link ValidationAlertDTO} applying the defaults declared in this
 * module when any required field is missing.
 *
 * @param {Partial<ValidationAlertDTO>} [input]
 * @returns {ValidationAlertDTO}
 */
function buildAlert({ code, severity, message, suggestion } = {}) {
    return /** @type {ValidationAlertDTO} */ (withOptionalFields({
        code: trimmedOr(code, DEFAULT_ALERT_CODE),
        severity: trimmedOr(severity, DEFAULT_ALERT_SEVERITY),
        message: trimmedOr(message, DEFAULT_ALERT_MESSAGE)
    }, {
        suggestion: trimmedOr(suggestion)
    }));
}

/**
 * Normalizes a list of strings (filters out non-strings, applies `trim`,
 * discards empty strings). Returns `null` if the input was not an array.
 *
 * @param {unknown} values
 * @returns {string[]|null}
 */
function trimmedOrArray(values) {
    if (!Array.isArray(values))
        return null;

    return values
        .filter((/** @type {unknown} */ value) => typeof value === 'string')
        .map((/** @type {string} */ value) => value.trim())
        .filter(Boolean);
}

/**
 * Optional variant of {@link normalizePercent}: returns `null` for
 * `null`/`undefined`, and delegates for the rest.
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
 * Converts any representation accepted by `Date` into an ISO string. If the
 * date is invalid, returns the current date.
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
 * Returns `value` if it is a boolean, otherwise `null`.
 *
 * @param {unknown} value
 * @returns {boolean|null}
 */
function normalizeOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

/**
 * Normalizes the current user's permissions over a dataset. The canonical
 * producer (`mapCurrentUserDatasetPermissions` in
 * `services/datasets-service.js`) already translates the Prisma columns
 * (`isAnnotator`, ...) into the canonical keys.
 *
 * @param {*} permissions - Input permissions in canonical form.
 * @returns {*} Normalized permissions.
 */
function normalizeDatasetPermissions(permissions) {
    if (!permissions || typeof permissions !== 'object')
        return null;

    return {
        annotator: Boolean(permissions.annotator),
        reviewer: Boolean(permissions.reviewer),
        admin: Boolean(permissions.admin),
        owner: Boolean(permissions.owner),
        canAdmin: Boolean(permissions.canAdmin)
    };
}

/**
 * Normalizes the current user's review state over a dataset.
 * @param {*} review - Input state.
 * @returns {*} Normalized state.
 */
function normalizeDatasetReviewState(review) {
    if (!review || typeof review !== 'object')
        return null;

    return {
        canReview: Boolean(review.canReview),
        showReviewButton: Boolean(review.showReviewButton),
        reviewAvailable: Boolean(review.reviewAvailable),
        reviewableCount: toIntegerNormalized(review.reviewableCount ?? 0),
        blockedBySelfAnnotation: Boolean(review.blockedBySelfAnnotation)
    };
}

/**
 * Normalizes the dataset options.
 * @param {*} options - Input options.
 * @returns {*} Normalized options.
 */
function normalizeDatasetOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    const llmMode = trimmedOr(source.llmMode);
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
 * Converts a value to a positive integer, or returns `null` if invalid.
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
 * Converts a value to a positive integer, falling back to `fallback` if it is
 * invalid and finally to `1` if the fallback is invalid too.
 *
 * @param {unknown} value
 * @param {unknown} fallback
 * @returns {number}
 */
function toRequiredPositiveInteger(value, fallback) {
    return toOptionalPositiveInteger(value) || toOptionalPositiveInteger(fallback) || 1;
}

/**
 * Combines the required fields (`base`) with the optional ones
 * (`optionalFields`), discarding the latter when they are `null`/`undefined`.
 * The return type is `any` so the caller can treat it as the specific DTO its
 * consumers expect (each `mapXxxDTO` declares its concrete `@returns`).
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
    mapDatasetLlmCredentialDTO,
    mapDatasetLlmCredentialDTOs,
    normalizeIncomingEntryContext
};
