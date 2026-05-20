'use strict';

/**
 * @file Datasets controller — HTTP endpoints for dataset management.
 *
 * Covers: listing the datasets accessible to the user, creation from XML
 * upload, reading a section for annotation, XML export, recursive deletion and
 * per-dataset permission management.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} DatasetsControllerDeps
 * @property {Record<string, any>} [datasetsService]
 * @property {Record<string, any>} [datasetsPermissionsService]
 * @property {Record<string, any>} [datasetsStatisticsService]
 */

const { unlink } = require('node:fs');
const { createDatasetsService } = require('../services/datasets-service');
const { createDatasetsPermissionsService } = require('../services/datasets-permissions-service');
const { createDatasetsStatisticsService } = require('../services/datasets-statistics-service');
const { listCandidateTempFilePaths } = require('../utils/temp-storage');
const { toPositiveInteger } = require('../utils/validators');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');
const { mapDatasetSectionDTO } = require('../contracts/dto-mappers');

/**
 * Builds the datasets controller.
 *
 * @param {DatasetsControllerDeps} [options]
 */
function createDatasetsController({
    datasetsService,
    datasetsPermissionsService,
    datasetsStatisticsService
} = {}) {
    const service = datasetsService || createDatasetsService();
    const permissionsService = datasetsPermissionsService || createDatasetsPermissionsService();
    const statisticsService = datasetsStatisticsService || createDatasetsStatisticsService();

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function listAllDatasets(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        try {
            const datasetList = await service.listAccessibleDatasetItems(userId);
            return response.status(200).json(datasetList);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
            return response.status(200).json(dataset);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * Downloads the rebuilt dataset XML as an attachment.
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function downloadDatasetXml(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const { filename, body, contentType } = await service.getAccessibleDatasetXmlDownload(userId, datasetId);
            return response
                .status(200)
                .type(contentType)
                .set('Content-Disposition', buildAttachmentHeader(filename))
                .send(body);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Downloads the extended XML (original + Spanish annotations) as an
     * attachment. Requires the dataset to be 100% complete.
     *
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function downloadDatasetAnnotatedXml(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const { filename, body, contentType } = await service.getAccessibleDatasetAnnotatedXmlDownload(userId, datasetId);
            return response
                .status(200)
                .type(contentType)
                .set('Content-Disposition', buildAttachmentHeader(filename))
                .send(body);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function createDataset(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        if (!request.file)
            return respondInvalidPayload(response, 'No se ha proporcionado un fichero XML.');

        try {
            const payload = await service.createDataset(userId, request.file, request.body || {});
            return response.status(201).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        } finally {
            deleteTempFile(request.file.filename);
        }
    }

    /**
     * Lists user permissions over a dataset.
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     * @returns {Promise<*>} JSON response.
     */
    async function listDatasetPermissions(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const payload = await permissionsService.listDatasetPermissions(userId, datasetId);
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * Adds a user to the dataset with the given permissions (annotator by default).
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     * @returns {Promise<*>} JSON response.
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
            const userPermission = await permissionsService.addDatasetPermissionByEmail(
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
     * Updates a user's permissions over a dataset.
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     * @returns {Promise<*>} JSON response.
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
            const payload = await permissionsService.updateDatasetPermission(
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
     * Fully deletes a dataset and its dependencies.
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     * @returns {Promise<*>} JSON response.
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
     * Returns the dataset's statistics.
     * @param {*} request - HTTP request.
     * @param {*} response - HTTP response.
     * @returns {Promise<*>} JSON response.
     */
    async function getDatasetStatistics(request, response) {
        const userId = resolveSessionUserId(request);
        if (userId === null)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.params.id);
        if (datasetId === null)
            return respondInvalidPayload(response, 'El id del dataset es inválido.');

        try {
            const payload = await statisticsService.getDatasetStatistics(userId, datasetId);
            return response.status(200).json(payload);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return {
        listAllDatasets,
        getDatasetById,
        getDatasetSection,
        getDatasetText,
        downloadDatasetXml,
        downloadDatasetAnnotatedXml,
        createDataset,
        listDatasetPermissions,
        addDatasetPermission,
        updateDatasetPermission,
        deleteDataset,
        getDatasetStatistics
    };
}

/**
 * Builds the `Content-Disposition` header for a download. Sanitizes the
 * filename by escaping double quotes and backslashes, in compliance with
 * RFC 6266 token quoting.
 *
 * @param {*} filename - File name proposed to the client.
 * @returns {string} Header ready for `response.set`.
 */
function buildAttachmentHeader(filename) {
    const safeFilename = String(filename || 'dataset.xml')
        .replaceAll('\\', String.raw`\\`)
        .replaceAll('"', String.raw`\"`);
    return `attachment; filename="${safeFilename}"`;
}

/**
 * Silently deletes a temporary file uploaded during dataset upload.
 * @param {*} filename - Name or path of the temporary file.
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
