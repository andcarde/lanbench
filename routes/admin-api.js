'use strict';

/**
 * @file Router `/api/admin` — JSON administration endpoints.
 *
 * Protects all routes with `requireApiAuth` + `requireApiModerator()`: only
 * authenticated users with the global `moderator` role can reach them.
 */

const express = require('express');
const { requireApiAuth, requireApiModerator } = require('../middlewares/auth');

/**
 * Builds the `/api/admin` router.
 *
 * @param {{ adminController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `adminController` is not provided.
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
