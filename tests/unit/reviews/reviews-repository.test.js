'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createReviewsRepository } = require('../../../repositories/reviews-repository');
const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_EXPIRED
} = require('../../../constants/review-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Construye prisma a partir de los datos recibidos.
 * @param {Object<string, *>} [overrides] - Valor de overrides usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildPrisma(overrides = {}) {
    return {
        review: {
            /**
             * Obtiene first desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findFirst() { return null; },
            /**
             * Obtiene unique desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findUnique() { return null; },
            /**
             * Obtiene many desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findMany() { return []; },
            /**
             * Crea create con la configuracion recibida.
             * @param {*} args - Valor de args usado por la funcion.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async create(args) { return { reviewId: 100, ...args.data }; },
            /**
             * Actualiza update con los datos indicados.
             * @param {*} args - Valor de args usado por la funcion.
             */
            async update(args) { return { reviewId: args.where.reviewId, ...args.data }; },
            /**
             * Actualiza many con los datos indicados.
             */
            async updateMany() { return { count: 0 }; },
            ...(overrides.review || {})
        },
        reviewDecision: {
            /**
             * Ejecuta de forma asincrona la logica de upsert.
             * @param {*} args - Valor de args usado por la funcion.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async upsert(args) { return { id: 1, ...args.create, ...args.update }; },
            /**
             * Obtiene many desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findMany() { return []; },
            ...(overrides.reviewDecision || {})
        },
        reviewComment: {
            /**
             * Crea create con la configuracion recibida.
             * @param {*} args - Valor de args usado por la funcion.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async create(args) { return { id: 1, ...args.data }; },
            /**
             * Obtiene many desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findMany() { return []; },
            ...(overrides.reviewComment || {})
        },
        entry: {
            /**
             * Obtiene many desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findMany() { return []; },
            ...(overrides.entry || {})
        }
    };
}

describe('reviews-repository (T4.2)', () => {
    describe('findActiveReviewByReviewer', () => {
        it('filtra por reviewerId y solo estados pending/in_progress', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Obtiene first desde la fuente correspondiente.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async findFirst(args) {
                            captured.push(args);
                            return { reviewId: 10 };
                        }
                    }
                })
            });

            const result = await repo.findActiveReviewByReviewer({ reviewerId: 7 });

            assert.equal(/** @type {any} */ (result).reviewId, 10);
            assert.equal(captured[0].where.reviewerId, 7);
            assert.deepEqual(captured[0].where.status, { in: [REVIEW_PENDING, REVIEW_IN_PROGRESS] });
        });
    });

    describe('findReviewableEntries', () => {
        it('excluye entries del propio reviewer y entries con review activa o terminal', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    entry: {
                        /**
                         * Obtiene many desde la fuente correspondiente.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async findMany(args) {
                            captured.push(args);
                            return [{ entryId: 5, annotations: [{ userId: 9 }] }];
                        }
                    }
                })
            });

            const result = await repo.findReviewableEntries({ reviewerId: 3, limit: 1 });

            assert.equal(result.length, 1);
            assert.equal(captured[0].where.status, 'annotated');
            assert.deepEqual(captured[0].where.annotations.none, { userId: 3 });

            const blockingStatuses = captured[0].where.reviews.none.status.in;
            assert.ok(blockingStatuses.includes(REVIEW_PENDING));
            assert.ok(blockingStatuses.includes(REVIEW_IN_PROGRESS));
            assert.ok(blockingStatuses.includes(REVIEW_COMPLETED));
            assert.ok(blockingStatuses.includes(REVIEW_DISPUTED));
            assert.ok(!blockingStatuses.includes(REVIEW_EXPIRED));
        });
    });

    describe('createReview', () => {
        it('crea con status pending y currentCriterionIndex 0', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Crea create con la configuracion recibida.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async create(args) {
                            captured.push(args);
                            return { reviewId: 42, ...args.data };
                        }
                    }
                })
            });

            const expiresAt = new Date('2026-05-01T00:00:00Z');
            const result = await repo.createReview({
                entryId: 11,
                reviewerId: 22,
                annotatorId: 33,
                expiresAt
            });

            assert.equal(/** @type {any} */ (result).reviewId, 42);
            assert.equal(captured[0].data.status, REVIEW_PENDING);
            assert.equal(captured[0].data.currentCriterionIndex, 0);
            assert.equal(captured[0].data.entryId, 11);
            assert.equal(captured[0].data.reviewerId, 22);
            assert.equal(captured[0].data.annotatorId, 33);
            assert.equal(captured[0].data.expiresAt, expiresAt);
        });
    });

    describe('expireStaleReviews', () => {
        it('solo afecta a reviews activas con expiresAt < cutoff', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Actualiza many con los datos indicados.
                         * @param {*} args - Valor de args usado por la funcion.
                         */
                        async updateMany(args) {
                            captured.push(args);
                            return { count: 2 };
                        }
                    }
                })
            });

            const cutoff = new Date('2026-04-25T12:00:00Z');
            const result = await repo.expireStaleReviews(cutoff);

            assert.equal(result.count, 2);
            assert.deepEqual(captured[0].where.status, { in: [REVIEW_PENDING, REVIEW_IN_PROGRESS] });
            assert.deepEqual(captured[0].where.expiresAt, { lt: cutoff });
            assert.equal(captured[0].data.status, REVIEW_EXPIRED);
        });
    });

    describe('upsertDecision', () => {
        it('usa upsert con clave compuesta (reviewId, criterionCode)', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    reviewDecision: {
                        /**
                         * Ejecuta de forma asincrona la logica de upsert.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async upsert(args) {
                            captured.push(args);
                            return { id: 9, ...args.create };
                        }
                    }
                })
            });

            const result = await repo.upsertDecision({
                reviewId: 5,
                criterionCode: 'criterion_grammar',
                decision: 'accepted',
                comment: null
            });

            assert.equal(/** @type {any} */ (result).id, 9);
            assert.equal(captured[0].where.reviewId_criterionCode.reviewId, 5);
            assert.equal(captured[0].where.reviewId_criterionCode.criterionCode, 'criterion_grammar');
            assert.equal(captured[0].create.decision, 'accepted');
            assert.equal(captured[0].update.decision, 'accepted');
        });
    });

    describe('createComment', () => {
        it('persiste el comentario con todos sus campos', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    reviewComment: {
                        /**
                         * Crea create con la configuracion recibida.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async create(args) {
                            captured.push(args);
                            return { id: 1, ...args.data };
                        }
                    }
                })
            });

            const result = await repo.createComment({
                reviewId: 5,
                sentenceIndex: 2,
                originalSentence: 'foo',
                correctedSentence: 'foo bar',
                comment: 'añadir contexto'
            });

            assert.equal(/** @type {any} */ (result).id, 1);
            assert.equal(captured[0].data.sentenceIndex, 2);
            assert.equal(captured[0].data.correctedSentence, 'foo bar');
            assert.equal(captured[0].data.comment, 'añadir contexto');
        });
    });

    describe('findCompletedReviewsForAnnotator', () => {
        it('filtra por annotatorId y por estados terminales', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Obtiene many desde la fuente correspondiente.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async findMany(args) {
                            captured.push(args);
                            return [{ reviewId: 1, decisions: [], comments: [] }];
                        }
                    }
                })
            });

            const result = await repo.findCompletedReviewsForAnnotator({ annotatorId: 9, datasetId: 4 });

            assert.equal(result.length, 1);
            assert.equal(captured[0].where.annotatorId, 9);
            assert.deepEqual(captured[0].where.status, { in: [REVIEW_COMPLETED, REVIEW_DISPUTED] });
            assert.equal(captured[0].where.entry.datasetId, 4);
        });

        it('omite el filtro de dataset cuando no se proporciona', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Obtiene many desde la fuente correspondiente.
                         * @param {*} args - Valor de args usado por la funcion.
                         * @returns {Promise<*>} Resultado producido por la funcion.
                         */
                        async findMany(args) {
                            captured.push(args);
                            return [];
                        }
                    }
                })
            });

            await repo.findCompletedReviewsForAnnotator({ annotatorId: 9 });
            assert.equal(captured[0].where.entry, undefined);
        });
    });

    describe('updateReviewProgress', () => {
        it('actualiza currentCriterionIndex y opcionalmente status', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Actualiza update con los datos indicados.
                         * @param {*} args - Valor de args usado por la funcion.
                         */
                        async update(args) {
                            captured.push(args);
                            return { id: args.where.id, ...args.data };
                        }
                    }
                })
            });

            const result = await repo.updateReviewProgress({
                reviewId: 7,
                currentCriterionIndex: 2,
                status: REVIEW_IN_PROGRESS
            });

            assert.equal(result.currentCriterionIndex, 2);
            assert.equal(captured[0].where.id, 7);
            assert.equal(captured[0].data.status, REVIEW_IN_PROGRESS);
        });
    });

    describe('updateReviewStatus', () => {
        it('actualiza status y completedAt cuando se proporciona', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Actualiza update con los datos indicados.
                         * @param {*} args - Valor de args usado por la funcion.
                         */
                        async update(args) {
                            captured.push(args);
                            return args.data;
                        }
                    }
                })
            });

            const completedAt = new Date('2026-04-30T00:00:00Z');
            await repo.updateReviewStatus({ reviewId: 4, status: REVIEW_COMPLETED, completedAt });

            assert.equal(captured[0].data.status, REVIEW_COMPLETED);
            assert.equal(captured[0].data.completedAt, completedAt);
        });

        it('no incluye completedAt cuando no se proporciona', async () => {
            /** @type {any[]} */
            const captured = [];
            const repo = createReviewsRepository({
                prisma: buildPrisma({
                    review: {
                        /**
                         * Actualiza update con los datos indicados.
                         * @param {*} args - Valor de args usado por la funcion.
                         */
                        async update(args) {
                            captured.push(args);
                            return args.data;
                        }
                    }
                })
            });

            await repo.updateReviewStatus({ reviewId: 4, status: REVIEW_IN_PROGRESS });
            assert.equal(captured[0].data.completedAt, undefined);
        });
    });
});
