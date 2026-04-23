'use strict';

const { normalizePercent, toIntegerNormalized } = require('../utils/validators');

const DEFAULT_DATASET_NAME = 'DATASET 1';
const DEFAULT_COLOR_CLASS = 'dataset-purple';
const DEFAULT_ALERT_CODE = 'sentence_review';
const DEFAULT_ALERT_SEVERITY = 'warning';
const DEFAULT_ALERT_MESSAGE = 'La oracion requiere revision.';

function mapDatasetListDTO(source, fallbackId = 1) {
    const id = toRequiredPositiveInteger(source?.id ?? source?.idDataset, fallbackId);

    return withOptionalFields({
        id,
        name: normalizeRequiredString(source?.name, id > 0 ? `DATASET ${id}` : DEFAULT_DATASET_NAME),
        totalEntries: toIntegerNormalized(
            source?.totalEntries
            ?? source?.triplesRDF
            ?? source?.metrics?.rdfTriples
            ?? source?.entries
            ?? 0
        ),
        completedPercent: normalizePercent(source?.completedPercent ?? source?.progress?.completed ?? 0),
        remainPercent: normalizePercent(source?.remainPercent ?? source?.progress?.remaining ?? 100)
    }, {
        withoutReviewPercent: normalizeOptionalPercent(
            source?.withoutReviewPercent ?? source?.progress?.withoutReview
        ),
        languages: normalizeOptionalStringArray(source?.languages ?? source?.metrics?.languages),
        colorClass: normalizeOptionalString(source?.colorClass ?? source?.ui?.colorClass) || DEFAULT_COLOR_CLASS
    });
}

function mapDatasetListDTOs(sources) {
    if (!Array.isArray(sources))
        return [];

    return sources.map((source, index) => mapDatasetListDTO(source, index + 1));
}

function mapDatasetSectionDTO(source) {
    const sectionIndex = toRequiredPositiveInteger(source?.sectionIndex ?? source?.section?.number, 1);
    const entries = Array.isArray(source?.entries)
        ? source.entries.map(entry => mapEntryContextDTO(entry, { sectionIndex }))
        : [];

    return withOptionalFields({
        sectionIndex,
        totalEntries: toIntegerNormalized(source?.totalEntries ?? source?.section?.totalEntries ?? entries.length),
        entries
    }, {
        datasetId: toOptionalPositiveInteger(source?.datasetId ?? source?.dataset?.id ?? source?.dataset?.idDataset),
        datasetName: normalizeOptionalString(source?.datasetName ?? source?.dataset?.name),
        totalSections: toOptionalPositiveInteger(source?.totalSections ?? source?.dataset?.totalSections),
        sectionSize: toOptionalPositiveInteger(source?.sectionSize ?? source?.section?.size),
        startEntry: toOptionalPositiveInteger(source?.startEntry ?? source?.section?.startEntry),
        endEntry: toOptionalPositiveInteger(source?.endEntry ?? source?.section?.endEntry),
        isLastSection: normalizeOptionalBoolean(source?.isLastSection ?? source?.section?.isLastSection)
    });
}

function mapEntryContextDTO(source, { sectionIndex = null } = {}) {
    return withOptionalFields({
        entryId: toRequiredPositiveInteger(source?.entryId ?? source?.eid ?? source?.rdfId, 0),
        triples: normalizeTriples(source?.triples ?? source?.originalTriples ?? source?.modifiedTriples),
        englishSentences: normalizeOptionalStringArray(source?.englishSentences ?? source?.sourceSentences) || [],
        sectionIndex: toRequiredPositiveInteger(source?.sectionIndex ?? sectionIndex, 1)
    }, {
        category: normalizeOptionalString(source?.category)
    });
}

function mapSentenceValidationDTO(result, sentence = '') {
    const alerts = normalizeAlerts(result?.alerts);
    const isValid = typeof result?.isValid === 'boolean'
        ? result.isValid
        : Boolean(result?.valid);

    if (isValid) {
        return {
            sentence: normalizeRequiredString(result?.sentence, sentence),
            isValid: true,
            alerts,
            rejectionReasons: normalizeOptionalStringArray(result?.rejectionReasons ?? result?.rejectionReason) || []
        };
    }

    return {
        sentence: normalizeRequiredString(result?.sentence, sentence),
        isValid: false,
        alerts: alerts.length > 0
            ? alerts
            : [buildAlert({
                message: result?.reason ?? result?.message,
                suggestion: result?.suggestion
            })],
        rejectionReasons: normalizeOptionalStringArray(result?.rejectionReasons ?? result?.rejectionReason) || []
    };
}

function mapSentenceValidationDTOs(sentences, results) {
    const sourceSentences = Array.isArray(sentences) ? sentences : [];
    const sourceResults = Array.isArray(results) ? results : [];
    const length = Math.max(sourceSentences.length, sourceResults.length);

    return Array.from({ length }, (_value, index) => mapSentenceValidationDTO(
        sourceResults[index],
        sourceSentences[index] || ''
    ));
}

function mapSavedAnnotationDTO({
    entryId,
    datasetId,
    sentences,
    savedAt = new Date().toISOString()
}) {
    return withOptionalFields({
        entryId: toRequiredPositiveInteger(entryId, 0),
        sentences: normalizeOptionalStringArray(sentences) || [],
        savedAt: normalizeIsoDate(savedAt)
    }, {
        datasetId: toOptionalPositiveInteger(datasetId)
    });
}

function normalizeIncomingEntryContext(entryContext) {
    if (!entryContext || typeof entryContext !== 'object')
        return null;

    return {
        eid: toOptionalPositiveInteger(entryContext.entryId ?? entryContext.eid),
        category: normalizeRequiredString(entryContext.category, ''),
        sourceSentences: normalizeOptionalStringArray(
            entryContext.englishSentences ?? entryContext.sourceSentences
        ) || [],
        triples: normalizeTriples(entryContext.triples)
    };
}

function normalizeTriples(triples) {
    if (!Array.isArray(triples))
        return [];

    return triples
        .map(triple => {
            if (!triple || typeof triple !== 'object')
                return null;

            const subject = normalizeOptionalString(triple.subject);
            const predicate = normalizeOptionalString(triple.predicate);
            const object = normalizeOptionalString(triple.object);

            if (!subject || !predicate || !object)
                return null;

            return { subject, predicate, object };
        })
        .filter(Boolean);
}

function normalizeAlerts(alerts) {
    if (!Array.isArray(alerts))
        return [];

    return alerts
        .map(alert => {
            if (typeof alert === 'string')
                return buildAlert({ message: alert });

            if (!alert || typeof alert !== 'object')
                return null;

            return buildAlert(alert);
        })
        .filter(Boolean);
}

function buildAlert({ code, severity, message, suggestion } = {}) {
    return withOptionalFields({
        code: normalizeRequiredString(code, DEFAULT_ALERT_CODE),
        severity: normalizeRequiredString(severity, DEFAULT_ALERT_SEVERITY),
        message: normalizeRequiredString(message, DEFAULT_ALERT_MESSAGE)
    }, {
        suggestion: normalizeOptionalString(suggestion)
    });
}

function normalizeRequiredString(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeOptionalString(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalStringArray(values) {
    if (!Array.isArray(values))
        return null;

    return values
        .filter(value => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean);
}

function normalizeOptionalPercent(value) {
    if (value === undefined || value === null)
        return null;

    return normalizePercent(value);
}

function normalizeIsoDate(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return new Date().toISOString();
    return parsed.toISOString();
}

function normalizeOptionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

function toOptionalPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

function toRequiredPositiveInteger(value, fallback) {
    return toOptionalPositiveInteger(value) || toOptionalPositiveInteger(fallback) || 1;
}

function withOptionalFields(base, optionalFields) {
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
    mapEntryContextDTO,
    mapSentenceValidationDTO,
    mapSentenceValidationDTOs,
    mapSavedAnnotationDTO,
    normalizeIncomingEntryContext
};
