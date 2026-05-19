'use strict';

/**
 * @file Annotations controller — endpoints HTTP del flujo de anotacion.
 *
 * Cubre:
 *   - `POST /check`        validar oraciones contra el contexto de la entry.
 *   - `POST /send`         persistir las oraciones de la entry actual.
 *   - `GET  /continue/:id` resolver la siguiente seccion via `continueDatasetService`.
 *   - `GET  /next/:id`     devolver la entry apuntada por la sesion activa.
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
 * @typedef {Object} SendPayload
 * @property {string[]|null} sentences
 * @property {number|null} entryId
 * @property {number|null} datasetId
 * @property {Array<string|null>|null} rejectionReasons
 * @property {number|null} sectionNumber
 * @property {boolean|null} isLastEntry
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
 * Construye el controlador de anotaciones.
 *
 * @param {AnnotationsControllerDeps} [options]
 */
function createAnnotationsController({ annotationsService, continueDatasetService } = {}) {
    const service = annotationsService || createAnnotationsService();
    const continueService = continueDatasetService || null;

    /**
     * `POST /api/annotations/check` — Valida un lote de oraciones.
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

        try {
            const validations = await service.checkSentences(payload.sentences, payload.entryContext);
            response.status(200).json(validations);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `POST /api/annotations/send` — Persiste las oraciones de una entry.
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
        if (!isSendPayloadValid(payload.sentences, payload.entryId, payload.datasetId, payload.rejectionReasons)) {
            respondInvalidPayload(response, 'Datos inválidos.');
            return;
        }

        try {
            const savedAnnotation = await service.saveSentences({
                userId,
                datasetId: /** @type {number} */ (payload.datasetId),
                rdfId: /** @type {number} */ (payload.entryId),
                sentences: /** @type {string[]} */ (payload.sentences),
                rejectionReasons: /** @type {Array<string|null>} */ (payload.rejectionReasons),
                ...(payload.sectionNumber !== null ? { sectionNumber: payload.sectionNumber } : {}),
                ...(payload.isLastEntry !== null ? { isLastEntry: payload.isLastEntry } : {})
            });

            response.status(200).json(savedAnnotation);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `GET /api/annotations/continue/:datasetId` — Orquesta el boton
     * "continuar" segun los casos definidos para secciones.
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
     * `GET /api/annotations/next/:datasetId` — Devuelve la entry apuntada
     * por la sesion activa del usuario.
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
 * Normaliza el body de `POST /check` separando `sentences` y `entryContext`.
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
 * Adapta el `entryContext` recibido al formato canonico esperado por el
 * servicio. Preserva opcionalmente `previousSentences`.
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
        eid: normalized.eid,
        category: normalized.category,
        sourceSentences: normalized.sourceSentences,
        triples: normalized.triples,
        ...(previousSentences.length > 0 ? { previousSentences } : {})
    };
}

/**
 * Normaliza el body de `POST /send` con coerciones defensivas a numero
 * positivo / booleano.
 *
 * @param {Record<string, any>|null|undefined} payload
 * @returns {SendPayload}
 */
function normalizeSendPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return { sentences: null, entryId: null, datasetId: null, rejectionReasons: null, sectionNumber: null, isLastEntry: null };

    return {
        sentences: payload.sentences,
        entryId: toPositiveInteger(payload.entryId ?? payload.rdfId),
        datasetId: toPositiveInteger(payload.datasetId),
        rejectionReasons: payload.rejectionReasons || payload.rejectionReason,
        sectionNumber: payload.sectionNumber !== undefined && payload.sectionNumber !== null
            ? toPositiveInteger(payload.sectionNumber)
            : null,
        isLastEntry: payload.isLastEntry !== undefined && payload.isLastEntry !== null
            ? Boolean(payload.isLastEntry)
            : null
    };
}

/**
 * Valida el conjunto minimo de campos del payload de `POST /send`.
 *
 * @param {unknown} sentences
 * @param {number|null} entryId
 * @param {number|null} datasetId
 * @param {unknown} rejectionReasons
 * @returns {boolean}
 */
function isSendPayloadValid(sentences, entryId, datasetId, rejectionReasons) {
    return isStringArray(sentences)
        && Number.isInteger(entryId)
        && /** @type {number} */ (entryId) > 0
        && Number.isInteger(datasetId)
        && /** @type {number} */ (datasetId) > 0
        && isRejectionReasonsArray(rejectionReasons)
        && /** @type {string[]} */ (rejectionReasons).length === /** @type {string[]} */ (sentences).length;
}

/**
 * Comprueba que `value` es un array de strings (o null por slot).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRejectionReasonsArray(value) {
    return Array.isArray(value)
        && value.every((/** @type {unknown} */ item) => typeof item === 'string');
}

module.exports = {
    createAnnotationsController
};
