'use strict';

/**
 * @file Router `/api/reviews` — endpoints JSON del flujo de revision.
 *
 * `requireApiAuth` protege todas las rutas. `POST /request` ademas exige
 * que el usuario sea moderador global o que su peticion venga acotada a un
 * dataset concreto (validado por {@link requireReviewRequestAccess}). Los
 * permisos por dataset se verifican aguas abajo en el controlador.
 *
 * @typedef {import('express').Request}      ExpressRequest
 * @typedef {import('express').Response}     ExpressResponse
 * @typedef {import('express').NextFunction} ExpressNext
 */

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

/**
 * Construye el router `/api/reviews`.
 *
 * @param {{ reviewsController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} Si no se proporciona `reviewsController`.
 */
function createReviewsRouter({ reviewsController } = {}) {
    if (!reviewsController)
        throw new Error('reviewsController is required to build the reviews API router.');

    const router = express.Router();

    router.use(requireApiAuth);

    router.get('/feedback', reviewsController.feedbackForAnnotator);
    router.post('/request', requireReviewRequestAccess, reviewsController.requestNext);
    router.get('/:reviewId', reviewsController.getContext);
    router.post('/:reviewId/decisions', reviewsController.submitDecision);
    router.post('/:reviewId/corrections', reviewsController.submitCorrection);
    router.post('/:reviewId/finalize', reviewsController.finalize);
    router.post('/:reviewId/release', reviewsController.release);

    return router;
}

/**
 * Middleware que permite `POST /request` solo a moderadores globales o a
 * peticiones que vengan acotadas a un dataset concreto.
 *
 * @param {ExpressRequest & { user?: { isModerator?: boolean } }} request
 * @param {ExpressResponse} response
 * @param {ExpressNext} next
 * @returns {void}
 */
function requireReviewRequestAccess(request, response, next) {
    const isModerator = Boolean(request.user && request.user.isModerator === true);
    if (isModerator)
        return next();

    if (hasDatasetScope(request))
        return next();

    response.status(403).json({
        ok: false,
        code: 'forbidden',
        message: 'No tienes permisos para solicitar revisiones.'
    });
}

/**
 * Comprueba si la peticion viene acotada a un dataset (via body o query).
 *
 * @param {ExpressRequest} request
 * @returns {boolean}
 */
function hasDatasetScope(request) {
    const datasetId = Number(
        /** @type {*} */ (request.body) && /** @type {*} */ (request.body).datasetId
            ? /** @type {*} */ (request.body).datasetId
            : /** @type {*} */ (request.query) && /** @type {*} */ (request.query).datasetId
    );
    return Number.isInteger(datasetId) && datasetId > 0;
}

module.exports = {
    createReviewsRouter
};
