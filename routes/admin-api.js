'use strict';

/**
 * @file Router `/api/admin` — endpoints JSON de administracion.
 *
 * Protege todas las rutas con `requireApiAuth` + `requireApiModerator()`:
 * solo usuarios autenticados con rol global `moderator` pueden alcanzarlas.
 */

const express = require('express');
const { requireApiAuth, requireApiModerator } = require('../middlewares/auth');

/**
 * Construye el router `/api/admin`.
 *
 * @param {{ adminController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} Si no se proporciona `adminController`.
 */
function createAdminApiRouter({ adminController } = {}) {
    if (!adminController)
        throw new Error('adminController is required to build the admin API router.');

    const router = express.Router();

    router.use(requireApiAuth);
    router.use(requireApiModerator());

    router.get('/datasets/summary', adminController.listDatasetSummaries);
    router.get('/datasets/:id/export', adminController.exportDataset);
    router.get('/evaluation-criteria', adminController.listEvaluationCriteria);
    router.post('/evaluation-criteria', adminController.createEvaluationCriterion);
    router.patch('/evaluation-criteria/:id', adminController.updateEvaluationCriterion);

    return router;
}

module.exports = {
    createAdminApiRouter
};
