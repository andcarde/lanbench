'use strict';

/**
 * @file Admin service — lectura/escritura de datos administrativos
 * (resumen de datasets, exportacion, gestion de criterios de evaluacion).
 *
 * Convive con `users-service`/`datasets-service`/`reviews-service`: aqui se
 * concentran las operaciones disponibles solo para el `moderator` global.
 *
 * @typedef {Object} AdminServiceDeps
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [evaluationCriteriaRepository]
 * @property {() => Date}          [now] - Reloj inyectable (tests deterministas).
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
const { ServiceError } = require('./service-error');
const { calculatePercentagesFromSectionCounters } = require('../utils/dataset-progress');
const { escapeXml } = require('../utils/xml-format');

/** Formatos de exportacion soportados por `exportDatasetProgress`. */
const SUPPORTED_EXPORT_FORMATS = new Set(['json', 'xml']);

/**
 * Construye el servicio de administracion. Acepta repos y reloj inyectables.
 *
 * @param {AdminServiceDeps} [options]
 */
function createAdminService({ datasetsRepository, evaluationCriteriaRepository, now } = {}) {
    /** @type {{ datasetsRepository: any, evaluationCriteriaRepository: any, now: () => Date }} */
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        evaluationCriteriaRepository: evaluationCriteriaRepository || createEvaluationCriteriaRepository(),
        now: now || (() => new Date())
    };

    /**
     * Recupera el resumen administrativo de todos los datasets.
     *
     * @returns {Promise<DatasetSummaryDTO[]>}
     */
    async function listDatasetSummaries() {
        const summaries = await deps.datasetsRepository.findAdminDatasetSummaries();
        return summaries.map(mapDatasetSummary);
    }

    /**
     * Exporta el progreso completo de un dataset (anotaciones, decisiones y
     * metricas) en `json` o `xml`.
     *
     * @param {number} datasetId
     * @param {{ format?: 'json'|'xml' }} [options]
     * @returns {Promise<ExportResult>}
     * @throws {ServiceError} `404` si el dataset no existe; `400` si el formato no es soportado.
     */
    async function exportDatasetProgress(datasetId, { format = 'json' } = {}) {
        const normalizedFormat = normalizeFormat(format);
        const dataset = await deps.datasetsRepository.findDatasetExportGraphById(datasetId);

        if (!dataset)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

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
     * Lista los criterios de evaluacion. Por defecto incluye tambien los
     * marcados como `inactive` para la UI de administracion.
     *
     * @param {{ includeInactive?: boolean }} [options]
     * @returns {Promise<EvaluationCriterionDTO[]>}
     */
    async function listEvaluationCriteria({ includeInactive = true } = {}) {
        const criteria = await deps.evaluationCriteriaRepository.findMany({ includeInactive });
        return criteria.map(mapCriterion);
    }

    /**
     * Crea un nuevo criterio de evaluacion. Valida que `key` siga el patron
     * canonico (snake-case + digitos) y que `label` no este vacio.
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
     * Actualiza un criterio existente. Acepta solo los campos presentes en
     * `input` (parches), valida el `criterionId` y traduce `P2025` (Prisma
     * "not found") a un `ServiceError` 404.
     *
     * @param {number} criterionId
     * @param {Record<string, any>} input
     * @returns {Promise<EvaluationCriterionDTO>}
     * @throws {ServiceError} `400` si `criterionId` o `input` son invalidos; `404` si no existe.
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

    return {
        listDatasetSummaries,
        exportDatasetProgress,
        listEvaluationCriteria,
        createEvaluationCriterion,
        updateEvaluationCriterion
    };
}

/**
 * Convierte la fila cruda del repo en el DTO de resumen para la UI admin.
 *
 * @param {Record<string, any>} summary
 * @returns {DatasetSummaryDTO}
 */
function mapDatasetSummary(summary) {
    return {
        datasetId: summary.id,
        name: summary.name,
        totalEntries: toNonNegativeInteger(summary.totalEntries),
        reservedEntries: toNonNegativeInteger(summary.reservedEntries),
        annotatedEntries: toNonNegativeInteger(summary.annotatedEntries),
        reviewedEntries: toNonNegativeInteger(summary.reviewedEntries),
        disputedEntries: toNonNegativeInteger(summary.disputedEntries),
        activeAssignments: toNonNegativeInteger(summary.activeAssignments),
        progress: calculatePercentagesFromSectionCounters({
            sectionsCompleted: summary.sectionsCompleted,
            sectionsInReview: summary.sectionsInReview,
            sectionsPending: summary.sectionsPending,
            reviewEnabled: Boolean(summary.isReviewEnabled),
            annotatedEntries: toNonNegativeInteger(summary.annotatedEntries),
            totalEntries: toNonNegativeInteger(summary.totalEntries)
        }),
        updatedAt: toIso(summary.updatedAt)
    };
}

/**
 * Convierte el grafo completo de un dataset en el payload de exportacion.
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
                totalEntries: toNonNegativeInteger(dataset.totalEntries)
            })
        },
        entries: (dataset.entries || []).map(mapExportEntry)
    };
}

/**
 * Convierte una entry (con anotaciones y decisiones de alerta) en el
 * sub-payload de exportacion correspondiente.
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
 * Aplana la coleccion `triplesets -> triples` en un array unico por entry.
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
 * Normaliza el cuerpo `input` de creacion/actualizacion de criterio.
 * En modo creacion exige `key` y `label`; en modo update solo procesa
 * los campos presentes.
 *
 * @param {Record<string, any>|null|undefined} input
 * @param {{ creating: boolean }} options
 * @returns {Record<string, any>}
 * @throws {ServiceError} `400` con codigos especificos por validacion fallida.
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
        const label = normalizeString(source.label);
        if (!label)
            throw new ServiceError('La etiqueta del criterio es obligatoria.', {
                status: 400,
                code: 'invalid_criterion_label'
            });
        data.label = label;
    }

    if (source.description !== undefined)
        data.description = normalizeString(source.description);

    if (source.sortOrder !== undefined)
        data.sortOrder = toInteger(source.sortOrder, 0);

    if (source.isActive !== undefined)
        data.isActive = Boolean(source.isActive);
    else if (source.active !== undefined)
        data.isActive = Boolean(source.active);

    return data;
}

/**
 * Valida y normaliza el formato de exportacion.
 *
 * @param {unknown} format
 * @returns {string} `'json'` o `'xml'`.
 * @throws {ServiceError} `400` si el formato no esta soportado.
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
 * Devuelve la `key` normalizada si cumple el patron `^[a-z][a-z0-9_-]{1,63}$`;
 * en otro caso `null`.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeKey(value) {
    const normalized = normalizeString(value);
    if (!normalized || !/^[a-z][a-z0-9_-]{1,63}$/.test(normalized))
        return null;
    return normalized;
}

/**
 * Devuelve la cadena `trim()`-eada si es un string util; en otro caso `null`.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Convierte la fila Prisma de criterio en el DTO expuesto a la UI.
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
 * Construye una serializacion XML manual del payload de exportacion.
 *
 * @param {Record<string, any>} payload
 * @returns {string}
 */
function buildExportXml(payload) {
    const entries = payload.entries.map((/** @type {*} */ entry) => {
        const annotations = entry.annotations.map((/** @type {*} */ annotation) => `
      <annotation entryId="${annotation.entryId}" datasetId="${annotation.datasetId}" userId="${annotation.userId}" sentenceIndex="${annotation.sentenceIndex}" origin="${escapeXml(annotation.origin)}">
        <sentence>${escapeXml(annotation.sentence)}</sentence>
        ${annotation.rejectionReason ? `<rejectionReason>${escapeXml(annotation.rejectionReason)}</rejectionReason>` : ''}
      </annotation>`).join('');

        const decisions = entry.alertDecisions.map((/** @type {*} */ decision) => `
      <alertDecision id="${decision.id}" userId="${decision.userId}" sentenceIndex="${decision.sentenceIndex}" code="${escapeXml(decision.alertCode)}" type="${escapeXml(decision.alertType)}" decision="${escapeXml(decision.decision)}">
        ${decision.reason ? `<reason>${escapeXml(decision.reason)}</reason>` : ''}
        ${decision.suggestion ? `<suggestion>${escapeXml(decision.suggestion)}</suggestion>` : ''}
      </alertDecision>`).join('');

        return `
    <entry id="${entry.id}" eid="${entry.eid}" status="${escapeXml(entry.status)}">
      <annotations>${annotations}
      </annotations>
      <alertDecisions>${decisions}
      </alertDecisions>
    </entry>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<lanbenchExport exportedAt="${escapeXml(payload.exportedAt)}">
  <dataset id="${payload.dataset.id}" name="${escapeXml(payload.dataset.name)}" totalEntries="${payload.dataset.totalEntries}" />
  <entries>${entries}
  </entries>
</lanbenchExport>
`;
}

/**
 * Construye el nombre del fichero de exportacion saneando el nombre del
 * dataset y reemplazando `:`/`.` del timestamp por `-`.
 *
 * @param {string} datasetName
 * @param {string} exportedAt - Marca temporal en formato ISO.
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
 * Quita guiones iniciales y finales sin expresiones regulares.
 * @param {string} value - Texto de entrada.
 * @returns {string} Texto sin guiones externos.
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
 * Convierte a entero >= 0 o devuelve 0.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toNonNegativeInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Convierte a entero o devuelve `fallback`.
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
 * Convierte cualquier valor aceptado por `Date` en cadena ISO; si la fecha
 * es invalida devuelve la epoch.
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
