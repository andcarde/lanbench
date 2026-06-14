'use strict';

/**
 * @file Annotations controller — HTTP endpoints of the annotation flow.
 *
 * Covers:
 *   - `POST /check`        validate sentences against the entry context.
 *   - `POST /send`         persist the sentences of the current entry.
 *   - `GET  /continue/:id` resolve the next section via `continueDatasetService`.
 *   - `GET  /next/:id`     return the entry pointed to by the active session.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} AnnotationsControllerDeps
 * @property {Record<string, any>} [annotationsService]
 * @property {Record<string, any>} [continueDatasetService]
 *
 * @typedef {Object} CheckPayload
 * @property {string[]|null} sentences
 * @property {Record<string, any>|null} entryContext
 *
 * @typedef {Object} SendSentenceItem
 * @property {string} sentence
 * @property {string|null} [rejectionReason]
 *
 * @typedef {Object} SendPayload
 * @property {SendSentenceItem[]|null} sentences
 * @property {number|null} entryId
 * @property {number|null} datasetId
 * @property {number|null} sectionNumber
 * @property {boolean|null} isLastEntry
 * @property {number} timeSpentSeconds
 */

const { createAnnotationsService } = require('../services/annotations-service');
const { isStringArray, toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');
const { normalizeIncomingEntryContext } = require('../contracts/dto-mappers');

/**
 * Builds the annotations controller.
 *
 * @param {AnnotationsControllerDeps} [options]
 */
function createAnnotationsController({ annotationsService, continueDatasetService } = {}) {
    const service = annotationsService || createAnnotationsService();
    const continueService = continueDatasetService || null;

    /**
     * `POST /api/annotations/check` — Validates a batch of sentences.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function check(request, response) {
        const payload = normalizeCheckPayload(request.body);
        if (!isStringArray(payload.sentences)) {
            respondInvalidPayload(response, 'Datos inválidos.');
            return;
        }

        // `datasetId` is optional. When present, the dataset's AI credential may
        // apply, so an authenticated user is required and the service validates
        // access before resolving/using the credential. Without it, behaviour is
        // the legacy global one (no session required, no providerConfig).
        const datasetId = resolveCheckDatasetId(request.body, payload.entryContext);
        const userId = resolveSessionUserId(request);
        if (datasetId !== null && userId === null) {
            respondUnauthenticated(response);
            return;
        }

        try {
            const validations = await service.checkSentences(payload.sentences, payload.entryContext, { userId, datasetId });
            response.status(200).json(validations);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `POST /api/annotations/send` — Persists the sentences of an entry.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function send(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null) {
            respondUnauthenticated(response);
            return;
        }

        const payload = normalizeSendPayload(request.body);
        if (!isSendPayloadValid(payload.sentences, payload.entryId, payload.datasetId)) {
            respondInvalidPayload(response, 'Datos inválidos.');
            return;
        }

        try {
            const savedAnnotation = await service.saveSentences({
                userId,
                datasetId: /** @type {number} */ (payload.datasetId),
                rdfId: /** @type {number} */ (payload.entryId),
                sentences: /** @type {SendSentenceItem[]} */ (payload.sentences),
                ...(payload.sectionNumber !== null ? { sectionNumber: payload.sectionNumber } : {}),
                ...(payload.isLastEntry !== null ? { isLastEntry: payload.isLastEntry } : {}),
                timeSpentSeconds: payload.timeSpentSeconds
            });

            response.status(200).json(savedAnnotation);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `GET /api/annotations/continue/:datasetId` — Orchestrates the "continue"
     * button according to the cases defined for sections.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function continueAnnotation(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null) {
            respondUnauthenticated(response);
            return;
        }

        const datasetId = toPositiveInteger(request.params.datasetId);
        if (datasetId === null) {
            respondInvalidPayload(response, 'El id del dataset es inválido.');
            return;
        }

        try {
            const payload = await /** @type {any} */ (continueService).continueDataset(userId, datasetId);
            response.status(200).json(payload);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `GET /api/annotations/next/:datasetId` — Returns the entry pointed to
     * by the user's active session.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function next(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null) {
            respondUnauthenticated(response);
            return;
        }

        const datasetId = toPositiveInteger(request.params.datasetId);
        if (datasetId === null) {
            respondInvalidPayload(response, 'El id del dataset es inválido.');
            return;
        }

        try {
            const payload = await /** @type {any} */ (continueService).getNextEntry(userId, datasetId);
            response.status(200).json(payload);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    return { check, send, continue: continueAnnotation, next };
}

/**
 * Normalizes the `POST /check` body, separating `sentences` and `entryContext`.
 *
 * @param {Record<string, any>|null|undefined} payload
 * @returns {CheckPayload}
 */
function normalizeCheckPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return { sentences: null, entryContext: null };

    return {
        sentences: Array.isArray(payload.sentences) ? payload.sentences : null,
        entryContext: normalizeEntryContext(payload.entryContext || payload.entry || null)
    };
}

/**
 * Adapts the received `entryContext` to the canonical format expected by the
 * service. Optionally preserves `previousSentences`.
 *
 * @param {Record<string, any>|null} entryContext
 * @returns {Record<string, any>|null}
 */
function normalizeEntryContext(entryContext) {
    const normalized = normalizeIncomingEntryContext(entryContext);
    if (!normalized)
        return null;

    const previousSentences = Array.isArray(entryContext?.previousSentences)
        ? entryContext.previousSentences.filter((/** @type {*} */ sentence) => typeof sentence === 'string')
        : [];

    return {
        entryId: normalized.entryId,
        category: normalized.category,
        englishSentences: normalized.englishSentences,
        triples: normalized.triples,
        ...(normalized.datasetId ? { datasetId: normalized.datasetId } : {}),
        ...(previousSentences.length > 0 ? { previousSentences } : {})
    };
}

/**
 * Resolves the optional `datasetId` for `POST /check` from the entry context or
 * the request body. Returns `null` when none is provided.
 *
 * @param {Record<string, any>|null|undefined} body
 * @param {Record<string, any>|null|undefined} entryContext
 * @returns {number|null}
 */
function resolveCheckDatasetId(body, entryContext) {
    const fromContext = toPositiveInteger(entryContext?.datasetId);
    if (fromContext !== null)
        return fromContext;
    return toPositiveInteger(body?.datasetId);
}

/**
 * Normalizes the `POST /send` body to the canonical format. The client sends
 * `sentences` as an array of objects `{ sentence, rejectionReason? }`; here
 * only defensive number/boolean coercions are applied to the identifiers and
 * the array is passed as-is to the validator.
 *
 * @param {Record<string, any>|null|undefined} payload
 * @returns {SendPayload}
 */
function normalizeSendPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return { sentences: null, entryId: null, datasetId: null, sectionNumber: null, isLastEntry: null, timeSpentSeconds: 0 };

    const rawSeconds = Number(payload.timeSpentSeconds);

    return {
        sentences: payload.sentences,
        entryId: toPositiveInteger(payload.entryId ?? payload.rdfId),
        datasetId: toPositiveInteger(payload.datasetId),
        sectionNumber: payload.sectionNumber !== undefined && payload.sectionNumber !== null
            ? toPositiveInteger(payload.sectionNumber)
            : null,
        isLastEntry: payload.isLastEntry !== undefined && payload.isLastEntry !== null
            ? Boolean(payload.isLastEntry)
            : null,
        timeSpentSeconds: Number.isFinite(rawSeconds) && rawSeconds > 0 ? Math.floor(rawSeconds) : 0
    };
}

/**
 * Validates the minimal set of fields of the `POST /send` payload. Each item
 * of `sentences` must be an object with a string `sentence` and an optional
 * `rejectionReason` (string or null).
 *
 * @param {unknown} sentences
 * @param {number|null} entryId
 * @param {number|null} datasetId
 * @returns {boolean}
 */
function isSendPayloadValid(sentences, entryId, datasetId) {
    return Array.isArray(sentences)
        && sentences.every(isSendSentenceItem)
        && Number.isInteger(entryId)
        && /** @type {number} */ (entryId) > 0
        && Number.isInteger(datasetId)
        && /** @type {number} */ (datasetId) > 0;
}

/**
 * Checks that `item` is an object `{ sentence: string, rejectionReason?: string|null }`.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
function isSendSentenceItem(item) {
    if (!item || typeof item !== 'object')
        return false;
    const record = /** @type {Record<string, unknown>} */ (item);
    if (typeof record.sentence !== 'string')
        return false;
    if (record.rejectionReason === undefined || record.rejectionReason === null)
        return true;
    return typeof record.rejectionReason === 'string';
}

module.exports = {
    createAnnotationsController
};
