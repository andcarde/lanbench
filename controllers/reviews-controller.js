'use strict';

/**
 * @file Reviews controller — endpoints HTTP del flujo de revision.
 *
 * Cubre: peticion de la siguiente review, avance por criterios, cierre y
 * listado de feedback recibido por el anotador.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} ReviewsControllerDeps
 * @property {Record<string, any>} [reviewsService]
 */

const { createReviewsService } = require('../services/reviews-service');
const {
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
} = require('../utils/api-error-payload');
const { resolveSessionUserId } = require('../middlewares/auth');
const { toPositiveInteger } = require('../utils/validators');

/**
 * Construye el controlador de revisiones.
 *
 * @param {ReviewsControllerDeps} [options]
 */
function createReviewsController({ reviewsService } = {}) {
    const service = reviewsService || createReviewsService();

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function requestNext(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.body?.datasetId)
            || toPositiveInteger(request.query?.datasetId);

        try {
            const review = await service.requestNextReview({ reviewerId, datasetId: datasetId || null });
            return response.status(200).json(review);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function getContext(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        if (!reviewId)
            return respondInvalidPayload(response, 'Identificador invalido.');

        try {
            const dto = await service.getReviewContext({ reviewId, reviewerId });
            return response.status(200).json(dto);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function submitDecision(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        const body = request.body && typeof request.body === 'object' ? request.body : {};
        if (!reviewId || !body.criterionCode || !body.decision)
            return respondInvalidPayload(response, 'Datos invalidos.');

        try {
            const updated = await service.submitDecision({
                reviewId,
                reviewerId,
                criterionCode: body.criterionCode,
                decision: body.decision,
                comment: body.comment || null
            });
            return response.status(200).json(updated);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function submitCorrection(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        const body = request.body && typeof request.body === 'object' ? request.body : {};
        if (!reviewId || !Number.isInteger(body.sentenceIndex) || typeof body.correctedSentence !== 'string')
            return respondInvalidPayload(response, 'Datos invalidos.');

        try {
            const comments = await service.submitTextCorrection({
                reviewId,
                reviewerId,
                sentenceIndex: body.sentenceIndex,
                originalSentence: body.originalSentence || null,
                correctedSentence: body.correctedSentence,
                comment: body.comment || ''
            });
            return response.status(200).json({ comments });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function finalize(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        if (!reviewId)
            return respondInvalidPayload(response, 'Identificador invalido.');

        try {
            const updated = await service.finalizeReview({ reviewId, reviewerId });
            return response.status(200).json(updated);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function release(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        if (!reviewId)
            return respondInvalidPayload(response, 'Identificador invalido.');

        try {
            await service.releaseReview({ reviewId, reviewerId });
            return response.status(204).end();
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - Peticion HTTP con los datos de entrada.
     * @param {*} response - Respuesta HTTP usada para devolver el resultado.
     */
    async function feedbackForAnnotator(request, response) {
        const annotatorId = resolveSessionUserId(request);
        if (!annotatorId)
            return respondUnauthenticated(response);

        const datasetId = toPositiveInteger(request.query?.datasetId);
        const limit = toPositiveInteger(request.query?.limit) || 50;

        try {
            const feedback = await service.getFeedbackForAnnotator({
                annotatorId,
                datasetId: datasetId || null,
                limit
            });
            return response.status(200).json({ feedback });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return {
        requestNext,
        getContext,
        submitDecision,
        submitCorrection,
        finalize,
        release,
        feedbackForAnnotator
    };
}

module.exports = {
    createReviewsController
};
