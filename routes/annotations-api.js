'use strict';

/**
 * @file Router `/api/annotations` — endpoints JSON del flujo de anotacion.
 *
 * Protege todas las rutas con `requireApiAuth` (usuario autenticado).
 */

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

/**
 * Construye el router `/api/annotations`.
 *
 * @param {{ annotationsController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} Si no se proporciona `annotationsController`.
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
