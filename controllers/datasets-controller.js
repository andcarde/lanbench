'use strict';

/**
 * @file Datasets controller — endpoints HTTP de gestion de datasets.
 *
 * Cubre: listado de datasets accesibles al usuario, alta desde upload XML,
 * lectura de seccion para anotacion, exportacion XML, baja recursiva y
 * gestion de permisos por dataset.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} DatasetsControllerDeps
 * @property {Record<string, any>} [datasetsService]
 */

const { unlink } = require('node:fs');
const { createDatasetsService } = require('../services/datasets-service');
const { listCandidateTempFilePaths } = require('../utils/temp-storage');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');
const {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO
} = require('../contracts/dto-mappers');

/**
 * Construye el controlador de datasets.
 *
 * @param {DatasetsControllerDeps} [options]
 */
function createDatasetsController({ datasetsService } = {}) {
    const service = datasetsService || createDatasetsService();

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function listDatasets(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        try {
            const datasets = await service.listAccessibleDatasets(userId);
            return response.status(200).json(mapDatasetListDTOs(datasets));
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function listAllDatasets(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        try {
            const datasetList = await service.listAccessibleDatasetItems(userId);
            return response.status(200).json(mapDatasetListDTOs(datasetList));
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function getDatasetById(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const dataset = await service.getAccessibleDatasetItem(userId, datasetId);
            return response.status(200).json(mapDatasetListDTO(dataset, datasetId));
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function getDatasetSection(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        const sectionNumber = toPositiveInteger(request.params.section);
        if (sectionNumber === null || sectionNumber <= 0)
            return respondInvalidPayload(response, 'La sección solicitada es inválida.');

        try {
            const payload = await service.getAccessibleDatasetSection(userId, datasetId, sectionNumber);
            return response.status(200).json(mapDatasetSectionDTO(payload));
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function getDatasetText(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const text = await service.getAccessibleDatasetText(userId, datasetId);
            return response
                .status(200)
                .type('text/plain; charset=utf-8')
                .send(text);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function createDataset(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        if (!request.file)
            return respondInvalidPayload(response, 'No se ha proporcionado un fichero XML.');

        try {
            const payload = await service.createDataset(userId, request.file, request.body || {});
            return response.status(201).json({
                ...payload,
                dataset: payload?.dataset
                    ? mapDatasetListDTO(payload.dataset, payload.id)
                    : payload.dataset
            });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        } finally {
            deleteTempFile(request.file.filename);
        }
    }

    /**
     * Lista permisos de usuarios sobre un dataset.
     * @param {*} request - Peticion HTTP.
     * @param {*} response - Respuesta HTTP.
     * @returns {Promise<*>} Respuesta JSON.
     */
    async function listDatasetPermissions(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const payload = await service.listDatasetPermissions(userId, datasetId);
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Anade un usuario al dataset con los permisos indicados (annotator por defecto).
     * @param {*} request - Peticion HTTP.
     * @param {*} response - Respuesta HTTP.
     * @returns {Promise<*>} Respuesta JSON.
     */
    async function addDatasetPermission(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        const body = request.body || {};
        const userEmail = body.email;

        try {
            const userPermission = await service.addDatasetPermissionByEmail(
                userId,
                datasetId,
                userEmail,
                body.permissions
            );
            return response.status(201).json(userPermission);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Actualiza permisos de usuario sobre un dataset.
     * @param {*} request - Peticion HTTP.
     * @param {*} response - Respuesta HTTP.
     * @returns {Promise<*>} Respuesta JSON.
     */
    async function updateDatasetPermission(request, response) {
        const actorId = resolveSessionUserId(request);
        if (actorId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        const targetUserId = toPositiveInteger(request.params.userId);
        if (datasetId === null || targetUserId === null)
            return respondInvalidPayload(response, 'Los identificadores son inválidos.');

        try {
            const payload = await service.updateDatasetPermission(
                actorId,
                datasetId,
                targetUserId,
                request.body?.permissions
                    ? request.body.permissions
                    : request.body
            );
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Borra completamente un dataset y sus dependencias.
     * @param {*} request - Peticion HTTP.
     * @param {*} response - Respuesta HTTP.
     * @returns {Promise<*>} Respuesta JSON.
     */
    async function deleteDataset(request, response) {
        const actorId = resolveSessionUserId(request);
        if (actorId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const payload = await service.deleteDataset(actorId, datasetId);
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Devuelve estadisticas del dataset.
     * @param {*} request - Peticion HTTP.
     * @param {*} response - Respuesta HTTP.
     * @returns {Promise<*>} Respuesta JSON.
     */
    async function getDatasetStatistics(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const payload = await service.getDatasetStatistics(userId, datasetId);
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return {
        listAllDatasets,
        listDatasets,
        getDatasetById,
        getDatasetSection,
        getDatasetText,
        createDataset,
        listDatasetPermissions,
        addDatasetPermission,
        updateDatasetPermission,
        deleteDataset,
        getDatasetStatistics
    };
}

/**
 * Borra silenciosamente un archivo temporal subido durante la carga de datasets.
 * @param {*} filename - Nombre o ruta del archivo temporal.
 * @returns {void}
 */
function deleteTempFile(filename) {
    if (!filename)
        return;

    for (const filePath of listCandidateTempFilePaths(filename))
        unlink(filePath, () => {});
}

module.exports = {
    createDatasetsController
};
