'use strict';

const express = require('express');
const defaultUpload = require('../middlewares/upload-middleware');
const { requireApiAuth, requireApiRole } = require('../middlewares/auth');
const { ROLE_ADMIN } = require('../constants/roles');

function createDatasetsApiRouter({ datasetsController, uploadMiddleware } = {}) {
    if (!datasetsController)
        throw new Error('datasetsController is required to build the datasets API router.');

    const router = express.Router();
    const upload = uploadMiddleware || defaultUpload;
    const requireAdmin = requireApiRole(ROLE_ADMIN);

    router.use(requireApiAuth);

    router.get('/', datasetsController.listAllDatasets);
    router.post('/', requireAdmin, upload.single('xmlFile'), datasetsController.createDataset);
    router.get('/:id', datasetsController.getDatasetById);
    router.get('/:id/text', datasetsController.getDatasetText);
    router.get('/:id/sections/:section', datasetsController.getDatasetSection);

    return router;
}

module.exports = {
    createDatasetsApiRouter
};
