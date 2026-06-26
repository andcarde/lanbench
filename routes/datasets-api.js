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
 *   datasetLlmCredentialsController?: Record<string, any>,
 *   uploadMiddleware?: import('multer').Multer
 * }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `datasetsController` is not provided.
 */
function createDatasetsApiRouter({ datasetsController, datasetLlmCredentialsController, datasetCustomProvidersController, uploadMiddleware } = {}) {
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

    // Per-dataset AI credentials (US-31). Mounted only when the controller is
    // provided, so router tests that exercise the base surface stay unaffected.
    if (datasetLlmCredentialsController)
        mountLlmCredentialsRoutes(router, datasetLlmCredentialsController);

    // Per-dataset user-defined providers (US-36). Same conditional mount.
    if (datasetCustomProvidersController)
        mountCustomProvidersRoutes(router, datasetCustomProvidersController);

    router.get('/:id/statistics', datasetsController.getDatasetStatistics);
    router.get('/:id', datasetsController.getDatasetById);
    router.get('/:id/text', datasetsController.getDatasetText);
    router.get('/:id/download', datasetsController.downloadDatasetXml);
    router.get('/:id/download/annotated', datasetsController.downloadDatasetAnnotatedXml);
    router.get('/:id/sections/:section', datasetsController.getDatasetSection);
    router.patch('/:id', datasetsController.renameDataset);
    router.delete('/:id', datasetsController.deleteDataset);

    return router;
}

/**
 * Mounts the `/:id/llm-credentials` sub-routes (all admin-only, enforced in the
 * service). Declared before the catch-all `GET /:id` so the collection path is
 * matched first.
 *
 * @param {import('express').Router} router
 * @param {Record<string, any>} controller
 * @returns {void}
 */
function mountLlmCredentialsRoutes(router, controller) {
    // Active-status is declared FIRST so the `/active-status` suffix is not
    // matched as a `:provider` slug by the routes below.
    router.get('/:id/llm-credentials/active-status', controller.activeStatus);
    // Model catalog for the picker (US-35). POST so the typed key travels in
    // the body; declared before the `:provider` routes so "models" is never
    // interpreted as a provider slug.
    router.post('/:id/llm-credentials/models', controller.listModels);
    router.get('/:id/llm-credentials', controller.list);
    router.post('/:id/llm-credentials', controller.create);
    router.patch('/:id/llm-credentials/:provider/activate', controller.activate);
    router.delete('/:id/llm-credentials/:provider', controller.remove);
    router.post('/:id/llm-credentials/:provider/check', controller.check);
}

/**
 * Mounts the `/:id/custom-providers` sub-routes (admin-only, enforced in the
 * service). The provider name travels as a path segment for the delete action,
 * mirroring the credentials router.
 *
 * @param {import('express').Router} router
 * @param {Record<string, any>} controller
 * @returns {void}
 */
function mountCustomProvidersRoutes(router, controller) {
    router.get('/:id/custom-providers', controller.list);
    router.post('/:id/custom-providers', controller.create);
    router.delete('/:id/custom-providers/:name', controller.remove);
}

module.exports = {
    createDatasetsApiRouter
};
