'use strict';

/**
 * @file Reviews controller — HTTP endpoints of the review flow.
 *
 * Covers: requesting the next review, advancing through criteria, closure and
 * listing the feedback received by the annotator.
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
 * Builds the reviews controller.
 *
 * @param {ReviewsControllerDeps} [options]
 */
function createReviewsController({ reviewsService } = {}) {
    const service = reviewsService || createReviewsService();

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function submitDecision(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        const body = request.body && typeof request.body === 'object' ? request.body : {};
        if (!reviewId || !body.criterionCode || !body.decision)
            return respondInvalidPayload(response, 'Datos invalidos.');

        // `sentenceIndex` identifies the evaluated phrase; absent or non-integer
        // means the review-level criterion (e.g. diversity).
        const sentenceIndex = Number.isInteger(body.sentenceIndex) && body.sentenceIndex >= 0
            ? body.sentenceIndex
            : null;

        try {
            const updated = await service.submitDecision({
                reviewId,
                reviewerId,
                sentenceIndex,
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
     */
    async function finalize(request, response) {
        const reviewerId = resolveSessionUserId(request);
        if (!reviewerId)
            return respondUnauthenticated(response);

        const reviewId = toPositiveInteger(request.params.reviewId);
        if (!reviewId)
            return respondInvalidPayload(response, 'Identificador invalido.');

        const body = request.body && typeof request.body === 'object' ? request.body : {};
        const timeSpentSeconds = Number.isFinite(Number(body.timeSpentSeconds))
            ? Number(body.timeSpentSeconds)
            : 0;

        try {
            const updated = await service.finalizeReview({ reviewId, reviewerId, timeSpentSeconds });
            return response.status(200).json(updated);
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
     * @param {*} request - HTTP request with the input data.
     * @param {*} response - HTTP response used to return the result.
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
