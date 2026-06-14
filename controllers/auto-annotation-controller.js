'use strict';

/**
 * @file Auto-annotation controller (US-33) — HTTP surface of the asynchronous
 * "Anotar" flow for `generation` datasets.
 *
 * Routes (all mounted under `/api/annotations/auto`):
 *
 *   - `POST   /:datasetId`         start a new job (body: `{ sectionsCount }`).
 *   - `GET    /:datasetId/status`  read the current snapshot of the job.
 *   - `POST   /:datasetId/retry`   resume a `failed` job from the failing entry.
 *   - `POST   /:datasetId/cancel`  cancel & roll back the partial section.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} AutoAnnotationControllerDeps
 * @property {Record<string, any>} [autoAnnotationService]
 */

const { createAutoAnnotationService } = require('../services/auto-annotation-service');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');

/**
 * Builds the auto-annotation controller.
 *
 * @param {AutoAnnotationControllerDeps} [options]
 */
function createAutoAnnotationController({ autoAnnotationService } = {}) {
    const service = autoAnnotationService || createAutoAnnotationService();

    /**
     * `POST /api/annotations/auto/:datasetId`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function start(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        const sectionsCount = Number(request.body?.sectionsCount);
        try {
            const snapshot = await service.start(context.userId, context.datasetId, sectionsCount);
            response.status(202).json(snapshot);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `GET /api/annotations/auto/:datasetId/status`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function status(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const snapshot = await service.getStatus(context.userId, context.datasetId);
            response.status(200).json(snapshot);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/annotations/auto/:datasetId/retry`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function retry(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const snapshot = await service.retry(context.userId, context.datasetId);
            response.status(200).json(snapshot);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/annotations/auto/:datasetId/cancel`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function cancel(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.cancel(context.userId, context.datasetId);
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return { start, status, retry, cancel };
}

/**
 * Resolves authenticated user + valid dataset id, or sends 401/400 directly.
 *
 * @param {ExpressRequest} request
 * @param {ExpressResponse} response
 * @returns {{ userId:number, datasetId:number }|null}
 */
function resolveContext(request, response) {
    const userId = resolveSessionUserId(request);
    if (userId === null) {
        respondUnauthenticated(response);
        return null;
    }

    const datasetId = toPositiveInteger(request.params.datasetId);
    if (datasetId === null) {
        respondInvalidPayload(response, 'El id del dataset es inválido.');
        return null;
    }

    return { userId, datasetId };
}

module.exports = {
    createAutoAnnotationController
};
