'use strict';

/**
 * @file Admin service — reading/writing administrative data (dataset summary,
 * export, management of evaluation criteria).
 *
 * Coexists with `users-service`/`datasets-service`/`reviews-service`: this is
 * where the operations available only to the global `moderator` are
 * concentrated.
 *
 * @typedef {Object} AdminServiceDeps
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [evaluationCriteriaRepository]
 * @property {Record<string, any>} [usersRepository]
 * @property {() => Date}          [now] - Injectable clock (deterministic tests).
 *
 * @typedef {Object} ExportResult
 * @property {'json'|'xml'} format
 * @property {string} filename
 * @property {string} contentType
 * @property {string} body
 *
 * @typedef {Object} DatasetSummaryDTO
 * @property {number} datasetId
 * @property {string} name
 * @property {number} totalEntries
 * @property {number} reservedEntries
 * @property {number} annotatedEntries
 * @property {number} reviewedEntries
 * @property {number} disputedEntries
 * @property {number} activeAssignments
 * @property {Record<string, any>} progress
 * @property {string} updatedAt
 *
 * @typedef {Object} EvaluationCriterionDTO
 * @property {number} id
 * @property {string} key
 * @property {string} label
 * @property {string|null} description
 * @property {number} sortOrder
 * @property {boolean} isActive
 * @property {number} version
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createEvaluationCriteriaRepository } = require('../repositories/evaluation-criteria-repository');
const { createUsersRepository } = require('../repositories/users-repository');
const { ServiceError } = require('./service-error');
const { calculatePercentagesFromSectionCounters } = require('../utils/dataset-progress');
const { resolveSectionSize } = require('../constants/datasets');
const { escapeXml, renderAttrs } = require('../utils/xml-format');
const { toIntegerNormalized, trimmedOr } = require('../utils/validators');

/** Export formats supported by `exportDatasetProgress`. */
const SUPPORTED_EXPORT_FORMATS = new Set(['json', 'xml']);

/**
 * Builds the admin service. Accepts injectable repos and clock.
 *
 * @param {AdminServiceDeps} [options]
 */
function createAdminService({ datasetsRepository, evaluationCriteriaRepository, usersRepository, now } = {}) {
    /** @type {{ datasetsRepository: any, evaluationCriteriaRepository: any, usersRepository: any, now: () => Date }} */
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        evaluationCriteriaRepository: evaluationCriteriaRepository || createEvaluationCriteriaRepository(),
        usersRepository: usersRepository || createUsersRepository(),
        now: now || (() => new Date())
    };

    /**
     * Retrieves the administrative summary of all datasets.
     *
     * @returns {Promise<DatasetSummaryDTO[]>}
     */
    async function listDatasetSummaries() {
        const summaries = await deps.datasetsRepository.findAdminDatasetSummaries();
        return summaries.map(mapDatasetSummary);
    }

    /**
     * Exports a dataset's full progress (annotations, decisions and metrics)
     * in `json` or `xml`.
     *
     * @param {number} datasetId
     * @param {{ format?: 'json'|'xml' }} [options]
     * @returns {Promise<ExportResult>}
     * @throws {ServiceError} `404` if the dataset does not exist; `400` if the format is not supported.
     */
    async function exportDatasetProgress(datasetId, { format = 'json' } = {}) {
        const normalizedFormat = normalizeFormat(format);
        const dataset = await deps.datasetsRepository.findDatasetExportGraphById(datasetId);

        if (!dataset)
            throw ServiceError.datasetNotFound();

        const exportedAt = deps.now().toISOString();
        const payload = mapDatasetExport(dataset, exportedAt);
        const filename = buildExportFilename(dataset.name, exportedAt, normalizedFormat);

        if (normalizedFormat === 'xml') {
            return {
                format: /** @type {'json'|'xml'} */ (normalizedFormat),
                filename,
                contentType: 'application/xml; charset=utf-8',
                body: buildExportXml(payload)
            };
        }

        return {
            format: /** @type {'json'|'xml'} */ (normalizedFormat),
            filename,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(payload, null, 2)
        };
    }

    /**
     * Lists the evaluation criteria. By default also includes those marked as
     * `inactive` for the administration UI.
     *
     * @param {{ includeInactive?: boolean }} [options]
     * @returns {Promise<EvaluationCriterionDTO[]>}
     */
    async function listEvaluationCriteria({ includeInactive = true } = {}) {
        const criteria = await deps.evaluationCriteriaRepository.findMany({ includeInactive });
        return criteria.map(mapCriterion);
    }

    /**
     * Creates a new evaluation criterion. Validates that `key` follows the
     * canonical pattern (snake-case + digits) and that `label` is not empty.
     *
     * @param {Record<string, any>} input
     * @returns {Promise<EvaluationCriterionDTO>}
     */
    async function createEvaluationCriterion(input) {
        const data = normalizeCriterionInput(input, { creating: true });
        const created = await deps.evaluationCriteriaRepository.create(data);
        return mapCriterion(created);
    }

    /**
     * Updates an existing criterion. Accepts only the fields present in
     * `input` (patches), validates `criterionId` and translates `P2025`
     * (Prisma "not found") into a 404 `ServiceError`.
     *
     * @param {number} criterionId
     * @param {Record<string, any>} input
     * @returns {Promise<EvaluationCriterionDTO>}
     * @throws {ServiceError} `400` if `criterionId` or `input` are invalid; `404` if it does not exist.
     */
    async function updateEvaluationCriterion(criterionId, input) {
        if (!Number.isInteger(criterionId) || criterionId <= 0)
            throw new ServiceError('El id del criterio es inválido.', { status: 400, code: 'invalid_criterion_id' });

        const data = normalizeCriterionInput(input, { creating: false });
        if (Object.keys(data).length === 0)
            throw new ServiceError('No se han proporcionado cambios para el criterio.', {
                status: 400,
                code: 'empty_criterion_update'
            });

        try {
            const updated = await deps.evaluationCriteriaRepository.update(criterionId, data);
            return mapCriterion(updated);
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            if (error?.code === 'P2025')
                throw new ServiceError('Criterio no encontrado.', { status: 404, code: 'criterion_not_found' });
            throw error;
        }
    }

    /**
     * Lists every user with their server role (US-22). Moderator-only surface;
     * the password is never selected by the repository, so it cannot leak.
     *
     * @returns {Promise<Array<{ id:number, email:string, isModerator:boolean }>>}
     */
    async function listUsers() {
        const users = await deps.usersRepository.listUsers();
        return users.map(mapUserRole);
    }

    /**
     * Promotes or demotes a user's server role (`isModerator`) — the missing
     * write side of US-22. A moderator cannot strip their own elevation, which
     * guards against a one-moderator base locking everyone out.
     *
     * @param {{ actorId:number|null, userId:number, isModerator:boolean }} input
     * @returns {Promise<{ id:number, email:string, isModerator:boolean }>}
     * @throws {ServiceError} `400` invalid input, `409` self-demotion, `404` unknown user.
     */
    async function setUserModerator({ actorId, userId, isModerator }) {
        if (!Number.isInteger(userId) || userId <= 0)
            throw new ServiceError('El id de usuario es inválido.', { status: 400, code: 'invalid_user_id' });

        if (typeof isModerator !== 'boolean')
            throw new ServiceError('El campo isModerator debe ser booleano.', {
                status: 400,
                code: 'invalid_is_moderator'
            });

        if (actorId === userId && isModerator === false)
            throw new ServiceError('No puedes retirarte a ti mismo el rol de moderador.', {
                status: 409,
                code: 'cannot_self_demote'
            });

        try {
            const updated = await deps.usersRepository.setIsModerator(userId, isModerator);
            return mapUserRole(updated);
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            if (error?.code === 'P2025')
                throw new ServiceError('Usuario no encontrado.', { status: 404, code: 'user_not_found' });
            throw error;
        }
    }

    return {
        listDatasetSummaries,
        exportDatasetProgress,
        listEvaluationCriteria,
        createEvaluationCriterion,
        updateEvaluationCriterion,
        listUsers,
        setUserModerator
    };
}

/**
 * Maps a user row to the role DTO exposed by the admin API (US-22).
 *
 * @param {Record<string, any>} user
 * @returns {{ id:number, email:string, isModerator:boolean }}
 */
function mapUserRole(user) {
    return {
        id: user.id,
        email: user.email,
        isModerator: Boolean(user.isModerator)
    };
}

/**
 * Converts the raw repo row into the summary DTO for the admin UI.
 *
 * @param {Record<string, any>} summary
 * @returns {DatasetSummaryDTO}
 */
function mapDatasetSummary(summary) {
    return {
        datasetId: summary.id,
        name: summary.name,
        totalEntries: toIntegerNormalized(summary.totalEntries),
        reservedEntries: toIntegerNormalized(summary.reservedEntries),
        annotatedEntries: toIntegerNormalized(summary.annotatedEntries),
        reviewedEntries: toIntegerNormalized(summary.reviewedEntries),
        disputedEntries: toIntegerNormalized(summary.disputedEntries),
        activeAssignments: toIntegerNormalized(summary.activeAssignments),
        progress: calculatePercentagesFromSectionCounters({
            sectionsCompleted: summary.sectionsCompleted,
            sectionsInReview: summary.sectionsInReview,
            sectionsPending: summary.sectionsPending,
            reviewEnabled: Boolean(summary.isReviewEnabled),
            annotatedEntries: toIntegerNormalized(summary.annotatedEntries),
            totalEntries: toIntegerNormalized(summary.totalEntries),
            sectionSize: resolveSectionSize(summary)
        }),
        updatedAt: toIso(summary.updatedAt)
    };
}

/**
 * Converts a dataset's full graph into the export payload.
 *
 * @param {Record<string, any>} dataset
 * @param {string} exportedAt
 * @returns {Record<string, any>}
 */
function mapDatasetExport(dataset, exportedAt) {
    const annotatedEntries = (dataset.entries || []).reduce(
        (/** @type {number} */ count, /** @type {*} */ entry) =>
            count + (Array.isArray(entry.annotations) && entry.annotations.length > 0 ? 1 : 0),
        0
    );

    return {
        exportedAt,
        dataset: {
            id: dataset.id,
            name: dataset.name,
            totalEntries: dataset.totalEntries,
            progress: calculatePercentagesFromSectionCounters({
                sectionsCompleted: dataset.sectionsCompleted,
                sectionsInReview: dataset.sectionsInReview,
                sectionsPending: dataset.sectionsPending,
                reviewEnabled: Boolean(dataset.isReviewEnabled),
                annotatedEntries,
                totalEntries: toIntegerNormalized(dataset.totalEntries),
                sectionSize: resolveSectionSize(dataset)
            })
        },
        entries: (dataset.entries || []).map(mapExportEntry)
    };
}

/**
 * Converts an entry (with annotations and alert decisions) into its
 * corresponding export sub-payload.
 *
 * @param {Record<string, any>} entry
 * @returns {Record<string, any>}
 */
function mapExportEntry(entry) {
    return {
        id: entry.id,
        eid: entry.eid,
        category: entry.category,
        size: entry.size,
        status: entry.status,
        triples: flattenTriplesets(entry.triplesets),
        references: (entry.lexes || []).map((/** @type {*} */ lex) => ({
            lid: lex.lid,
            lang: lex.lang,
            text: lex.text,
            comment: lex.comment
        })),
        annotations: (entry.annotations || []).map((/** @type {*} */ annotation) => ({
            entryId: annotation.entryId,
            datasetId: annotation.datasetId,
            userId: annotation.userId,
            userEmail: annotation.user ? annotation.user.email : null,
            sentenceIndex: annotation.sentenceIndex,
            sentence: annotation.sentence,
            origin: annotation.origin,
            rejectionReason: annotation.rejectionReason,
            createdAt: toIso(annotation.createdAt),
            updatedAt: toIso(annotation.updatedAt)
        })),
        alertDecisions: (entry.alertDecisions || []).map((/** @type {*} */ decision) => ({
            id: decision.id,
            userId: decision.userId,
            userEmail: decision.user ? decision.user.email : null,
            sentenceIndex: decision.sentenceIndex,
            alertCode: decision.alertCode,
            alertType: decision.alertType,
            decision: decision.decision,
            reason: decision.reason,
            suggestion: decision.suggestion,
            appliedSentence: decision.appliedSentence,
            createdAt: toIso(decision.createdAt)
        })),
        review: null
    };
}

/**
 * Flattens the `triplesets -> triples` collection into a single array per entry.
 *
 * @param {Array<Record<string, any>>|undefined} triplesets
 * @returns {Array<Record<string, any>>}
 */
function flattenTriplesets(triplesets) {
    return (triplesets || []).flatMap(tripleset => (tripleset.triples || []).map((/** @type {*} */ triple) => ({
        type: tripleset.type,
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        position: triple.position
    })));
}

/**
 * Normalizes the criterion create/update `input` body. In create mode it
 * requires `key` and `label`; in update mode it only processes the fields
 * present.
 *
 * @param {Record<string, any>|null|undefined} input
 * @param {{ creating: boolean }} options
 * @returns {Record<string, any>}
 * @throws {ServiceError} `400` with specific codes per failed validation.
 */
function normalizeCriterionInput(input, { creating }) {
    const source = input && typeof input === 'object' ? input : {};
    /** @type {Record<string, any>} */
    const data = {};

    if (creating || source.key !== undefined) {
        const key = normalizeKey(source.key);
        if (!key)
            throw new ServiceError('La clave del criterio es inválida.', { status: 400, code: 'invalid_criterion_key' });
        data.key = key;
    }

    if (creating || source.label !== undefined) {
        const label = trimmedOr(source.label);
        if (!label)
            throw new ServiceError('La etiqueta del criterio es obligatoria.', {
                status: 400,
                code: 'invalid_criterion_label'
            });
        data.label = label;
    }

    if (source.description !== undefined)
        data.description = trimmedOr(source.description);

    if (source.sortOrder !== undefined)
        data.sortOrder = toInteger(source.sortOrder, 0);

    if (source.isActive !== undefined)
        data.isActive = Boolean(source.isActive);
    else if (source.active !== undefined)
        data.isActive = Boolean(source.active);

    return data;
}

/**
 * Validates and normalizes the export format.
 *
 * @param {unknown} format
 * @returns {string} `'json'` or `'xml'`.
 * @throws {ServiceError} `400` if the format is not supported.
 */
function normalizeFormat(format) {
    const normalized = typeof format === 'string' ? format.toLowerCase() : 'json';
    if (!SUPPORTED_EXPORT_FORMATS.has(normalized))
        throw new ServiceError('Formato de exportación no soportado.', {
            status: 400,
            code: 'unsupported_export_format'
        });
    return normalized;
}

/**
 * Returns the normalized `key` if it matches the pattern
 * `^[a-z][a-z0-9_-]{1,63}$`; otherwise `null`.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeKey(value) {
    const normalized = trimmedOr(value);
    if (!normalized || !/^[a-z][a-z0-9_-]{1,63}$/.test(normalized))
        return null;
    return normalized;
}

/**
 * Converts the Prisma criterion row into the DTO exposed to the UI.
 *
 * @param {Record<string, any>} criterion
 * @returns {EvaluationCriterionDTO}
 */
function mapCriterion(criterion) {
    return {
        id: criterion.id,
        key: criterion.key,
        label: criterion.label,
        description: criterion.description,
        sortOrder: criterion.sortOrder,
        isActive: Boolean(criterion.isActive),
        version: criterion.version,
        createdAt: toIso(criterion.createdAt),
        updatedAt: toIso(criterion.updatedAt)
    };
}

/**
 * Builds a manual XML serialization of the export payload.
 *
 * @param {Record<string, any>} payload
 * @returns {string}
 */
function buildExportXml(payload) {
    const entries = payload.entries.map((/** @type {*} */ entry) => {
        const annotations = entry.annotations.map((/** @type {*} */ annotation) => `
      <annotation${renderAttrs({
                entryId: annotation.entryId,
                datasetId: annotation.datasetId,
                userId: annotation.userId,
                sentenceIndex: annotation.sentenceIndex,
                origin: annotation.origin
            })}>
        <sentence>${escapeXml(annotation.sentence)}</sentence>
        ${annotation.rejectionReason ? `<rejectionReason>${escapeXml(annotation.rejectionReason)}</rejectionReason>` : ''}
      </annotation>`).join('');

        const decisions = entry.alertDecisions.map((/** @type {*} */ decision) => `
      <alertDecision${renderAttrs({
                id: decision.id,
                userId: decision.userId,
                sentenceIndex: decision.sentenceIndex,
                code: decision.alertCode,
                type: decision.alertType,
                decision: decision.decision
            })}>
        ${decision.reason ? `<reason>${escapeXml(decision.reason)}</reason>` : ''}
        ${decision.suggestion ? `<suggestion>${escapeXml(decision.suggestion)}</suggestion>` : ''}
      </alertDecision>`).join('');

        return `
    <entry${renderAttrs({ id: entry.id, eid: entry.eid, status: entry.status })}>
      <annotations>${annotations}
      </annotations>
      <alertDecisions>${decisions}
      </alertDecisions>
    </entry>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<lanbenchExport${renderAttrs({ exportedAt: payload.exportedAt })}>
  <dataset${renderAttrs({
        id: payload.dataset.id,
        name: payload.dataset.name,
        totalEntries: payload.dataset.totalEntries
    })} />
  <entries>${entries}
  </entries>
</lanbenchExport>
`;
}

/**
 * Builds the export file name by sanitizing the dataset name and replacing
 * `:`/`.` in the timestamp with `-`.
 *
 * @param {string} datasetName
 * @param {string} exportedAt - Timestamp in ISO format.
 * @param {string} format
 * @returns {string}
 */
function buildExportFilename(datasetName, exportedAt, format) {
    const safeName = String(datasetName || 'dataset')
        .toLowerCase()
        .replaceAll(/[^a-z0-9_-]+/g, '-');
    const normalizedName = trimDashes(safeName) || 'dataset';
    const stamp = exportedAt.replaceAll(/[:.]/g, '-');
    return `${normalizedName}-progress-${stamp}.${format}`;
}

/**
 * Removes leading and trailing dashes without regular expressions.
 * @param {string} value - Input text.
 * @returns {string} Text without outer dashes.
 */
function trimDashes(value) {
    let startIndex = 0;
    let endIndex = value.length;

    while (startIndex < endIndex && value[startIndex] === '-')
        startIndex += 1;
    while (endIndex > startIndex && value[endIndex - 1] === '-')
        endIndex -= 1;

    return value.slice(startIndex, endIndex);
}

/**
 * Converts to an integer, or returns `fallback`.
 *
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

/**
 * Converts any value accepted by `Date` into an ISO string; if the date is
 * invalid, returns the epoch.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toIso(value) {
    const parsed = new Date(/** @type {*} */ (value));
    if (Number.isNaN(parsed.getTime()))
        return new Date(0).toISOString();
    return parsed.toISOString();
}

module.exports = {
    createAdminService
};
