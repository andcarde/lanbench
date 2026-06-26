'use strict';

/**
 * @file Dataset custom-providers controller (US-36) — HTTP surface to manage
 * the per-dataset user-defined LLM providers.
 *
 * All routes live under `/api/datasets/:id/custom-providers` and are admin-only
 * (enforced by the service).
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} DatasetCustomProvidersControllerDeps
 * @property {Record<string, any>} [datasetCustomProvidersService]
 */

const { createDatasetCustomProvidersService } = require('../services/dataset-custom-providers-service');
const { mapDatasetCustomProviderDTO, mapDatasetCustomProviderDTOs } = require('../contracts/dto-mappers');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');

/**
 * Builds the dataset-custom-providers controller.
 *
 * @param {DatasetCustomProvidersControllerDeps} [options]
 */
function createDatasetCustomProvidersController({ datasetCustomProvidersService } = {}) {
    const service = datasetCustomProvidersService || createDatasetCustomProvidersService();

    /**
     * `GET /api/datasets/:id/custom-providers` — list of custom providers.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function list(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const rows = await service.listForAdmin(context.userId, context.datasetId);
            response.status(200).json(mapDatasetCustomProviderDTOs(rows));
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/datasets/:id/custom-providers` — register a new provider.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function create(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        const body = request.body || {};

        try {
            const row = await service.createCustomProvider(context.userId, context.datasetId, {
                name: body.name,
                urlBase: body.urlBase
            });
            response.status(201).json(mapDatasetCustomProviderDTO(row));
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `DELETE /api/datasets/:id/custom-providers/:name` — remove a provider and
     * its associated credential (cascade).
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function remove(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.deleteCustomProvider(context.userId, context.datasetId, request.params.name);
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return { list, create, remove };
}

/**
 * Resolves the authenticated user and a valid dataset id, responding directly
 * (401/400) when either is missing.
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

    const datasetId = toPositiveInteger(request.params.id);
    if (datasetId === null) {
        respondInvalidPayload(response, 'El id del dataset es inválido.');
        return null;
    }

    return { userId, datasetId };
}

module.exports = {
    createDatasetCustomProvidersController
};
