'use strict';

/**
 * @file Admin controller — endpoints HTTP de la zona de administracion.
 *
 * Mapea las funciones de `adminService` a respuestas HTTP, valida ids con
 * `toPositiveInteger`, y delega la serializacion de errores a
 * `utils/api-error-payload`.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} AdminControllerDeps
 * @property {Record<string, any>} [adminService]
 */

const { createAdminService } = require('../services/admin-service');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondInvalidPayload
} = require('../utils/api-error-payload');

/**
 * Construye el controlador de administracion.
 *
 * @param {AdminControllerDeps} [options]
 */
function createAdminController({ adminService } = {}) {
    const service = adminService || createAdminService();

    /**
     * `GET /api/admin/datasets` — Devuelve el resumen administrativo de
     * todos los datasets.
     *
     * @param {ExpressRequest} _request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function listDatasetSummaries(_request, response) {
        try {
            const summaries = await service.listDatasetSummaries();
            response.status(200).json(summaries);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `GET /api/admin/datasets/:id/export` — Devuelve el progreso exportado
     * en `json` o `xml` segun `request.query.format`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function exportDataset(request, response) {
        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null) {
            respondInvalidPayload(response, 'El id del dataset es inválido.');
            return;
        }

        try {
            const exported = await service.exportDatasetProgress(datasetId, {
                format: /** @type {*} */ (request.query)?.format
            });

            response.setHeader('Content-Type', exported.contentType);
            response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
            response.status(200).send(exported.body);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `GET /api/admin/criteria` — Lista los criterios de evaluacion.
     * Acepta `?includeInactive=false` para ocultar los inactivos.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function listEvaluationCriteria(request, response) {
        try {
            const includeInactive = /** @type {*} */ (request.query)?.includeInactive !== 'false';
            const criteria = await service.listEvaluationCriteria({ includeInactive });
            response.status(200).json(criteria);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `POST /api/admin/criteria` — Crea un nuevo criterio.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function createEvaluationCriterion(request, response) {
        try {
            const criterion = await service.createEvaluationCriterion(request.body);
            response.status(201).json(criterion);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    /**
     * `PUT /api/admin/criteria/:id` — Actualiza un criterio existente.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<void>}
     */
    async function updateEvaluationCriterion(request, response) {
        const criterionId = toPositiveInteger(request.params.id);
        if (criterionId === null) {
            respondInvalidPayload(response, 'El id del criterio es inválido.');
            return;
        }

        try {
            const criterion = await service.updateEvaluationCriterion(criterionId, request.body);
            response.status(200).json(criterion);
            return;
        } catch (caughtError) {
            respondWithApiError(response, /** @type {any} */ (caughtError));
            return;
        }
    }

    return {
        listDatasetSummaries,
        exportDataset,
        listEvaluationCriteria,
        createEvaluationCriterion,
        updateEvaluationCriterion
    };
}

module.exports = {
    createAdminController
};
