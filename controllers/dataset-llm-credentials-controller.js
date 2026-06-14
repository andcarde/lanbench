'use strict';

/**
 * @file Dataset LLM credentials controller (US-31) — HTTP surface to manage a
 * dataset's AI provider credentials.
 *
 * Every endpoint is admin-only (enforced by the service via
 * `assertDatasetAdminPermission`) and lives under
 * `/api/datasets/:id/llm-credentials`. The clear API key never leaves the
 * service: responses carry only the masked DTO. The "check" action returns the
 * model's reply (or a sanitized error).
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} DatasetLlmCredentialsControllerDeps
 * @property {Record<string, any>} [datasetLlmCredentialsService]
 */

const { createDatasetLlmCredentialsService } = require('../services/dataset-llm-credentials-service');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');

/**
 * Builds the dataset-LLM-credentials controller.
 *
 * @param {DatasetLlmCredentialsControllerDeps} [options]
 */
function createDatasetLlmCredentialsController({ datasetLlmCredentialsService } = {}) {
    const service = datasetLlmCredentialsService || createDatasetLlmCredentialsService();

    /**
     * `GET /api/datasets/:id/llm-credentials` — masked credential list.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function list(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const credentials = await service.listForAdmin(context.userId, context.datasetId);
            response.status(200).json(credentials);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/datasets/:id/llm-credentials` — create/update a provider.
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
            const credential = await service.saveCredential(context.userId, context.datasetId, {
                provider: body.provider,
                apiBase: body.apiBase,
                model: body.model,
                apiKey: body.apiKey
            });
            response.status(201).json(credential);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `PATCH /api/datasets/:id/llm-credentials/:provider/activate`.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function activate(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.activateCredential(context.userId, context.datasetId, request.params.provider);
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `DELETE /api/datasets/:id/llm-credentials/:provider`.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function remove(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.deleteCredential(context.userId, context.datasetId, request.params.provider);
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/datasets/:id/llm-credentials/:provider/check` — calls the model
     * with the decrypted key and returns its reply (or a sanitized error).
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function check(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.checkCredential(context.userId, context.datasetId, request.params.provider);
            // A failed check is returned as 200 { ok:false } so the UI can show
            // the reason, but it is a real provider/credential failure: flag it
            // for the error log so it is traceable in /logs (see the request-log
            // middleware "handled-failure" contract).
            if (result && result.ok === false) {
                response.locals.logAnomaly = true;
                response.locals.serverErrorReason =
                    `Comprobación de credencial fallida (dataset ${context.datasetId}, proveedor ${request.params.provider}): ${result.error || 'sin detalle'}`;
            }
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /api/datasets/:id/llm-credentials/models` — lists the provider's
     * available models for the picker (US-35). The key travels in the body
     * (typed in the form) or is resolved server-side from the stored
     * credential; it is never echoed back. Provider failures come back as
     * `200 { ok:false, code, error }`, mirroring the "check" contract.
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function listModels(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        const body = request.body || {};

        try {
            const result = await service.listProviderModels(context.userId, context.datasetId, {
                provider: body.provider,
                apiKey: body.apiKey,
                apiBase: body.apiBase
            });
            // A failed catalog query is a real provider/credential failure:
            // flag it for the error log like the "check" action does.
            if (result && result.ok === false) {
                response.locals.logAnomaly = true;
                response.locals.serverErrorReason =
                    `Consulta del catálogo de modelos fallida (dataset ${context.datasetId}, proveedor ${result.provider}): ${result.error || 'sin detalle'}`;
            }
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `GET /api/datasets/:id/llm-credentials/active-status` — readable by any
     * user with a `Permit` on the dataset (NOT admin-only): the automatic
     * annotation flow (US-33) needs the annotator to know whether to enable
     * the "Confirmar" button.
     *
     * Returns `{ hasActive:boolean, llmMode:string }`. No `keyLast4`, no
     * cipher, no provider name.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function activeStatus(request, response) {
        const context = resolveContext(request, response);
        if (!context)
            return;

        try {
            const result = await service.getActiveStatusForUser(context.userId, context.datasetId);
            response.status(200).json(result);
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return { list, create, activate, remove, check, listModels, activeStatus };
}

/**
 * Resolves the authenticated user and a valid dataset id, responding directly
 * (401/400) when either is missing. Returns `null` when a response was already
 * sent, so callers can bail out early.
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
    createDatasetLlmCredentialsController
};
