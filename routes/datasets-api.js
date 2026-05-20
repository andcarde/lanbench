'use strict';

/**
 * @file Router `/api/datasets` — JSON endpoints for dataset management.
 *
 * `requireApiAuth` protects all routes; `requireApiModerator()` is only
 * required on `POST /` (creation via XML upload).
 */

const express = require('express');
const { createUploadMiddleware } = require('../middlewares/upload-middleware');
const { requireApiAuth, requireApiModerator } = require('../middlewares/auth');

/**
 * Builds the `/api/datasets` router.
 *
 * @param {{
 *   datasetsController?: Record<string, any>,
 *   uploadMiddleware?: import('multer').Multer
 * }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `datasetsController` is not provided.
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
    router.get('/:id/download', datasetsController.downloadDatasetXml);
    router.get('/:id/download/annotated', datasetsController.downloadDatasetAnnotatedXml);
    router.get('/:id/sections/:section', datasetsController.getDatasetSection);
    router.delete('/:id', datasetsController.deleteDataset);

    return router;
}

module.exports = {
    createDatasetsApiRouter
};
