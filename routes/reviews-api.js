'use strict';

/**
 * @file Router `/api/reviews` — JSON endpoints of the review flow.
 *
 * `requireApiAuth` protects all routes. `POST /request` additionally requires
 * that the user be a global moderator or that their request be scoped to a
 * specific dataset (validated by {@link requireReviewRequestAccess}). The
 * per-dataset permissions are verified downstream in the controller.
 *
 * @typedef {import('express').Request}      ExpressRequest
 * @typedef {import('express').Response}     ExpressResponse
 * @typedef {import('express').NextFunction} ExpressNext
 */

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

/**
 * Builds the `/api/reviews` router.
 *
 * @param {{ reviewsController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `reviewsController` is not provided.
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
 * Middleware that allows `POST /request` only for global moderators or for
 * requests scoped to a specific dataset.
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
 * Checks whether the request is scoped to a dataset (via body or query).
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
