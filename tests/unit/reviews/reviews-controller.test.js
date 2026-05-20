'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createReviewsController } = require('../../../controllers/reviews-controller');
const { ServiceError } = require('../../../services/service-error');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds response from the received data.
 * @returns {*} Result produced by the function.
 */
function buildResponse() {
    /** @type {any} */
    const captured = { status: null, body: null, ended: false };
    return {
        captured,
        /**
         * Runs the logic of status.
         * @param {string} code - Value of code used by the function.
         * @returns {*} Result produced by the function.
         */
        status(code) { captured.status = code; return this; },
        /**
         * Runs the logic of json.
         * @param {*} payload - Value of payload used by the function.
         * @returns {*} Result produced by the function.
         */
        json(payload) { captured.body = payload; return this; },
        /**
         * Runs the logic of end.
         * @returns {*} Result produced by the function.
         */
        end() { captured.ended = true; return this; }
    };
}

/**
 * Builds request from the received data.
 * @param {*} options - Options object used to configure the function.
 * @returns {*} Result produced by the function.
 */
function buildRequest({ user = { id: 7 }, params = {}, body = {}, query = {} } = {}) {
    return { user, params, body, query };
}

describe('reviews-controller (T4.4)', () => {
    describe('requestNext', () => {
        it('responde 200 con la review devuelta por el servicio', async () => {
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Asynchronously runs request next review against the corresponding persistence layer or API.
                     * @param {*} options - Options object used to configure the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async requestNextReview({ reviewerId }) {
                        assert.equal(reviewerId, 7);
                        return { reviewId: 11, status: 'pending' };
                    }
                }
            });
            const res = buildResponse();
            await controller.requestNext(buildRequest(), res);

            assert.equal(res.captured.status, 200);
            assert.equal(res.captured.body.reviewId, 11);
        });

        it('propaga el status del ServiceError', async () => {
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Asynchronously runs request next review against the corresponding persistence layer or API.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async requestNextReview() {
                        throw new ServiceError('vacio', { status: 404, code: 'no_review_available' });
                    }
                }
            });
            const res = buildResponse();
            await controller.requestNext(buildRequest(), res);

            assert.equal(res.captured.status, 404);
            assert.equal(res.captured.body.code, 'no_review_available');
            assert.equal(res.captured.body.error, true);
        });

        it('responde 401 si no hay usuario en sesion', async () => {
            const controller = createReviewsController({ reviewsService: { async requestNextReview() { return null; } } });
            const res = buildResponse();
            await controller.requestNext({ user: null, session: {} }, res);

            assert.equal(res.captured.status, 401);
            assert.equal(res.captured.body.code, 'unauthenticated');
        });
    });

    describe('submitDecision', () => {
        it('rechaza payload incompleto con 400', async () => {
            const controller = createReviewsController({
                reviewsService: { async submitDecision() { throw new Error('should not be called'); } }
            });
            const res = buildResponse();
            await controller.submitDecision(buildRequest({ params: { reviewId: '5' }, body: {} }), res);

            assert.equal(res.captured.status, 400);
            assert.equal(res.captured.body.code, 'invalid_payload');
        });

        it('llama al servicio con campos normalizados', async () => {
            let /** @type {any} */ called;
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Asynchronously runs submit decision against the corresponding persistence layer or API.
                     * @param {*} args - Value of args used by the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async submitDecision(args) { called = args; return { reviewId: 5, currentCriterionIndex: 1 }; }
                }
            });
            const res = buildResponse();
            await controller.submitDecision(buildRequest({
                params: { reviewId: '5' },
                body: { criterionCode: 'criterion_grammar', decision: 'accepted', comment: ' ok ' }
            }), res);

            assert.equal(called.reviewId, 5);
            assert.equal(called.reviewerId, 7);
            assert.equal(called.criterionCode, 'criterion_grammar');
            assert.equal(res.captured.status, 200);
        });
    });

    describe('submitCorrection', () => {
        it('rechaza si falta sentenceIndex o correctedSentence', async () => {
            const controller = createReviewsController({
                reviewsService: { async submitTextCorrection() { throw new Error('should not be called'); } }
            });
            const res = buildResponse();
            await controller.submitCorrection(buildRequest({ params: { reviewId: '5' }, body: { comment: 'x' } }), res);

            assert.equal(res.captured.status, 400);
            assert.equal(res.captured.body.code, 'invalid_payload');
        });

        it('responde 200 con la lista de comentarios', async () => {
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Asynchronously runs submit text correction against the corresponding persistence layer or API.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async submitTextCorrection() { return [{ sentenceIndex: 0, correctedSentence: 'foo' }]; }
                }
            });
            const res = buildResponse();
            await controller.submitCorrection(buildRequest({
                params: { reviewId: '5' },
                body: { sentenceIndex: 0, correctedSentence: 'foo', comment: 'fix' }
            }), res);

            assert.equal(res.captured.status, 200);
            assert.equal(res.captured.body.comments.length, 1);
        });
    });

    describe('finalize', () => {
        it('responde 409 cuando faltan criterios', async () => {
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Asynchronously runs the logic of finalize review.
                     */
                    async finalizeReview() { throw new ServiceError('faltan', { status: 409, code: 'criteria_incomplete' }); }
                }
            });
            const res = buildResponse();
            await controller.finalize(buildRequest({ params: { reviewId: '5' } }), res);

            assert.equal(res.captured.status, 409);
            assert.equal(res.captured.body.code, 'criteria_incomplete');
        });
    });

    describe('release', () => {
        it('responde 204 sin body cuando se libera correctamente', async () => {
            const controller = createReviewsController({
                reviewsService: { async releaseReview() {} }
            });
            const res = buildResponse();
            await controller.release(buildRequest({ params: { reviewId: '5' } }), res);

            assert.equal(res.captured.status, 204);
            assert.equal(res.captured.ended, true);
        });
    });

    describe('feedbackForAnnotator', () => {
        it('llama al servicio con annotatorId del usuario', async () => {
            let /** @type {any} */ captured;
            const controller = createReviewsController({
                reviewsService: {
                    /**
                     * Gets feedback for annotator from the corresponding source.
                     * @param {*} args - Value of args used by the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async getFeedbackForAnnotator(args) { captured = args; return [{ reviewId: 1 }]; }
                }
            });
            const res = buildResponse();
            await controller.feedbackForAnnotator(buildRequest({
                user: { id: 9 },
                query: { datasetId: '4' }
            }), res);

            assert.equal(captured.annotatorId, 9);
            assert.equal(captured.datasetId, 4);
            assert.equal(res.captured.body.feedback.length, 1);
        });
    });
});
