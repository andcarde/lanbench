'use strict';

const { unlink } = require('node:fs');
const { User } = require('../entities/user');
const { createDatasetsService } = require('../services/datasets-service');
const { listCandidateTempFilePaths } = require('../utils/temp-storage');
const { toPositiveInteger } = require('../utils/validators');
const { buildApiErrorPayloadFromError } = require('../utils/api-error-payload');
const {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO
} = require('../contracts/dto-mappers');

function createDatasetsController({ datasetsService } = {}) {
    const service = datasetsService || createDatasetsService();

    async function listDatasets(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        try {
            const datasets = await service.listAccessibleDatasets(idUser);
            return response.status(200).json(mapDatasetListDTOs(datasets));
        } catch (error) {
            return respondWithJsonError(response, error);
        }
    }

    async function listAllDatasets(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        try {
            const datasetList = await service.listAccessibleDatasetItems(idUser);
            return response.status(200).json(mapDatasetListDTOs(datasetList));
        } catch (error) {
            return respondWithJsonError(response, error);
        }
    }

    async function getDatasetById(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        const idDataset = toPositiveInteger(request.params.id);
        if (idDataset === null)
            return response.status(400).json(legacyMessageError('El id del dataset es inválido.'));

        try {
            const dataset = await service.getAccessibleDatasetItem(idUser, idDataset);
            return response.status(200).json(mapDatasetListDTO(dataset, idDataset));
        } catch (error) {
            return respondWithJsonError(response, error);
        }
    }

    async function getDatasetSection(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        const idDataset = toPositiveInteger(request.params.id);
        if (idDataset === null)
            return response.status(400).json(legacyMessageError('El id del dataset es inválido.'));

        const sectionNumber = toPositiveInteger(request.params.section);
        if (sectionNumber === null || sectionNumber <= 0)
            return response.status(400).json(legacyMessageError('La sección solicitada es inválida.'));

        try {
            const payload = await service.getAccessibleDatasetSection(idUser, idDataset, sectionNumber);
            return response.status(200).json(mapDatasetSectionDTO(payload));
        } catch (error) {
            return respondWithJsonError(response, error);
        }
    }

    async function getDatasetText(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        const idDataset = toPositiveInteger(request.params.id);
        if (idDataset === null)
            return response.status(400).json(legacyMessageError('El id del dataset es inválido.'));

        try {
            const text = await service.getAccessibleDatasetText(idUser, idDataset);
            return response
                .status(200)
                .type('text/plain; charset=utf-8')
                .send(text);
        } catch (error) {
            return respondWithJsonError(response, error);
        }
    }

    async function createDataset(request, response) {
        const idUser = resolveSessionUserId(request);
        if (idUser === null)
            return response.status(403).json(legacyMessageError('Sesión no válida.'));

        if (!request.file)
            return response.status(400).json(legacyMessageError('No se ha proporcionado un fichero XML.'));

        try {
            const payload = await service.createDataset(idUser, request.file);
            return response.status(201).json({
                ...payload,
                dataset: payload && payload.dataset
                    ? mapDatasetListDTO(payload.dataset, payload.idDataset)
                    : payload.dataset
            });
        } catch (error) {
            return respondWithJsonError(response, error);
        } finally {
            deleteTempFile(request.file.filename);
        }
    }

    return {
        listAllDatasets,
        listDatasets,
        getDatasetById,
        getDatasetSection,
        getDatasetText,
        createDataset
    };
}

function resolveSessionUserId(request) {
    const sessionUser = User.fromSession(request && request.session ? request.session.user : null);
    return sessionUser ? sessionUser.idUser : null;
}

function respondWithJsonError(response, error, fallbackMessage = 'Error interno del servidor.') {
    if (error && Number.isInteger(error.status) && error.status >= 400 && error.status < 500)
        return response.status(error.status).json(buildApiErrorPayloadFromError(error));

    response.locals.serverErrorReason = error && error.message
        ? error.message
        : fallbackMessage;

    return response.status(500).json(buildApiErrorPayloadFromError(error, fallbackMessage));
}

function deleteTempFile(filename) {
    if (!filename)
        return;

    for (const filePath of listCandidateTempFilePaths(filename))
        unlink(filePath, () => {});
}

function legacyMessageError(message) {
    return { message };
}

module.exports = {
    createDatasetsController
};
