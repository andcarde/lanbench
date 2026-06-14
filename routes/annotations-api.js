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
 * @param {{
 *   annotationsController?: Record<string, any>,
 *   autoAnnotationController?: Record<string, any>
 * }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `annotationsController` is not provided.
 */
function createAnnotationsRouter({ annotationsController, autoAnnotationController } = {}) {
    if (!annotationsController)
        throw new Error('annotationsController is required to build the annotations API router.');

    const router = express.Router();

    router.use(requireApiAuth);

    router.post('/check', annotationsController.check);
    router.post('/send', annotationsController.send);

    // Auto-annotation (US-33). Declared BEFORE the `/:datasetId/continue` and
    // `/:datasetId/next` routes so the `/auto` prefix is matched first.
    if (autoAnnotationController) {
        router.post('/auto/:datasetId', autoAnnotationController.start);
        router.get('/auto/:datasetId/status', autoAnnotationController.status);
        router.post('/auto/:datasetId/retry', autoAnnotationController.retry);
        router.post('/auto/:datasetId/cancel', autoAnnotationController.cancel);
    }

    router.post('/:datasetId/continue', annotationsController.continue);
    router.get('/:datasetId/next', annotationsController.next);

    return router;
}

module.exports = {
    createAnnotationsRouter
};
