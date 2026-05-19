'use strict';

/**
 * @file Router `/api/datasets` — endpoints JSON de gestion de datasets.
 *
 * `requireApiAuth` protege todas las rutas; `requireApiModerator()` solo se
 * exige en `POST /` (creacion via upload de XML).
 */

const express = require('express');
const { createUploadMiddleware } = require('../middlewares/upload-middleware');
const { requireApiAuth, requireApiModerator } = require('../middlewares/auth');

/**
 * Construye el router `/api/datasets`.
 *
 * @param {{
 *   datasetsController?: Record<string, any>,
 *   uploadMiddleware?: import('multer').Multer
 * }} [options]
 * @returns {import('express').Router}
 * @throws {Error} Si no se proporciona `datasetsController`.
 */
function createDatasetsApiRouter({ datasetsController, uploadMiddleware } = {}) {
    if (!datasetsController)
        throw new Error('datasetsController is required to build the datasets API router.');

    const router = express.Router();
    const upload = uploadMiddleware || createUploadMiddleware();
    const requireModerator = requireApiModerator();

    router.use(requireApiAuth);

    router.get('/', datasetsController.listAllDatasets);
    router.post('/', requireModerator, upload.single('xmlFile'), datasetsController.createDataset);
    router.get('/:id/permissions', datasetsController.listDatasetPermissions);
    router.post('/:id/permissions', datasetsController.addDatasetPermission);
    router.patch('/:id/permissions/:userId', datasetsController.updateDatasetPermission);
    router.get('/:id/statistics', datasetsController.getDatasetStatistics);
    router.get('/:id', datasetsController.getDatasetById);
    router.get('/:id/text', datasetsController.getDatasetText);
    router.get('/:id/sections/:section', datasetsController.getDatasetSection);
    router.delete('/:id', datasetsController.deleteDataset);

    return router;
}

module.exports = {
    createDatasetsApiRouter
};
