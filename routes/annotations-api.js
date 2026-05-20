'use strict';

/**
 * @file Router `/api/annotations` — JSON endpoints of the annotation flow.
 *
 * Protects all routes with `requireApiAuth` (authenticated user).
 */

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

/**
 * Builds the `/api/annotations` router.
 *
 * @param {{ annotationsController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `annotationsController` is not provided.
 */
function createAnnotationsRouter({ annotationsController } = {}) {
    if (!annotationsController)
        throw new Error('annotationsController is required to build the annotations API router.');

    const router = express.Router();

    router.use(requireApiAuth);

    router.post('/check', annotationsController.check);
    router.post('/send', annotationsController.send);
    router.post('/:datasetId/continue', annotationsController.continue);
    router.get('/:datasetId/next', annotationsController.next);

    return router;
}

module.exports = {
    createAnnotationsRouter
};
