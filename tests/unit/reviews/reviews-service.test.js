'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    createReviewsService,
    buildFeedbackEntry,
    buildReviewContextDTO
} = require('../../../services/reviews-service');
const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_RELEASED
} = require('../../../constants/review-status');
const {
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED
} = require('../../../constants/review-decision');
const {
    CRITERION_GRAMMAR,
    CRITERION_COVERAGE,
    getOrderedCriterionCodes
} = require('../../../constants/review-criterion');
const {
    ENTRY_REVIEWED,
    ENTRY_DISPUTED
} = require('../../../constants/entry-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds repo stub from the received data.
 * @param {Array<*>} initialReviews - Value of initialReviews used by the function.
 * @param {*} options - Value of options used by the function.
 * @returns {*} Result produced by the function.
 */
function buildRepoStub(initialReviews = [], options = {}) {
    const reviews = new Map(initialReviews.map(r => [r.id, { ...r }]));
    const decisionsByReview = new Map();
    const commentsByReview = new Map();
    let nextId = 1000;

    const repo = {
        /**
         * Asynchronously runs the logic of expire stale reviews.
         * @returns {Promise<*>} Result produced by the function.
         */
        async expireStaleReviews() { return { count: 0 }; },
        /**
         * Gets active review by reviewer from the corresponding source.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findActiveReviewByReviewer({ reviewerId }) {
            for (const r of reviews.values())
                if (r.reviewerId === reviewerId && (r.status === REVIEW_PENDING || r.status === REVIEW_IN_PROGRESS))
                    return { ...r };
            return null;
        },
        /**
         * Gets review by id from the corresponding source.
         * @param {number} reviewId - Value of reviewId used by the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findReviewById(reviewId) {
            return reviews.has(reviewId) ? { ...reviews.get(reviewId) } : null;
        },
        /**
         * Gets reviewable entries from the corresponding source.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findReviewableEntries({ reviewerId: _idReviewer, limit: _limit = 1 }) {
            return options.reviewableEntries || [];
        },
        /**
         * Creates review with the received configuration.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async createReview({ entryId, reviewerId, annotatorId, expiresAt }) {
            const reviewId = nextId++;
            const created = {
                id: reviewId,
                entryId,
                reviewerId,
                annotatorId,
                status: REVIEW_PENDING,
                currentCriterionIndex: 0,
                expiresAt,
                assignedAt: new Date(),
                completedAt: null
            };
            reviews.set(reviewId, created);
            return { ...created };
        },
        /**
         * Updates review status with the given data.
         * @param {*} options - Options object used to configure the function.
         */
        async updateReviewStatus({ reviewId, status, completedAt = null }) {
            const r = reviews.get(reviewId);
            r.status = status;
            if (completedAt !== null) r.completedAt = completedAt;
            return { ...r };
        },
        /**
         * Updates review progress with the given data.
         * @param {*} options - Options object used to configure the function.
         */
        async updateReviewProgress({ reviewId, currentCriterionIndex, status }) {
            const r = reviews.get(reviewId);
            r.currentCriterionIndex = currentCriterionIndex;
            if (status) r.status = status;
            return { ...r };
        },
        /**
         * Asynchronously runs the logic of upsert decision.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async upsertDecision({ reviewId, criterionCode, decision, comment }) {
            const list = decisionsByReview.get(reviewId) || [];
            const existing = list.find((/** @type {*} */ d) => d.criterionCode === criterionCode);
            if (existing) {
                existing.decision = decision;
                existing.comment = comment;
                existing.decidedAt = new Date();
            } else {
                list.push({ reviewId, criterionCode, decision, comment, decidedAt: new Date() });
            }
            decisionsByReview.set(reviewId, list);
            return list[list.length - 1];
        },
        /**
         * Gets decisions by review from the corresponding source.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findDecisionsByReview({ reviewId }) {
            return (decisionsByReview.get(reviewId) || []).map((/** @type {*} */ d) => ({ ...d }));
        },
        /**
         * Creates comment with the received configuration.
         * @param {*} payload - Value of payload used by the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async createComment(payload) {
            const list = commentsByReview.get(payload.reviewId) || [];
            list.push({ ...payload, id: list.length + 1, createdAt: new Date() });
            commentsByReview.set(payload.reviewId, list);
            return list[list.length - 1];
        },
        /**
         * Gets comments by review from the corresponding source.
         * @param {*} options - Options object used to configure the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findCommentsByReview({ reviewId }) {
            return (commentsByReview.get(reviewId) || []).map((/** @type {*} */ c) => ({ ...c }));
        },
        /**
         * Gets completed reviews for annotator from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findCompletedReviewsForAnnotator() { return []; }
    };

    return { repo, reviews, decisionsByReview, commentsByReview };
}

/**
 * Builds prisma stub from the received data.
 * @param {*} [transactionImpl] - Value of transactionImpl used by the function.
 * @returns {*} Result produced by the function.
 */
function buildPrismaStub(transactionImpl) {
    return {
        /**
         * Asynchronously runs the logic of $transaction.
         * @param {*} fn - Value of fn used by the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async $transaction(fn) {
            const tx = transactionImpl || {
                review: { async update() {} },
                entry: { async update() {} }
            };
            return fn(tx);
        },
        entry: { async findUnique() { return null; } }
    };
}

describe('reviews-service (T4.3)', () => {
    describe('requestNextReview', () => {
        it('crea una review nueva cuando no hay activa y existe candidato', async () => {
            const { repo } = buildRepoStub([], {
                reviewableEntries: [{ id: 50, annotations: [{ userId: 9 }] }]
            });
            const service = createReviewsService({
                reviewsRepository: repo,
                prismaClient: buildPrismaStub()
            });

            const result = await service.requestNextReview({ reviewerId: 7 });

            assert.equal(result.status, REVIEW_PENDING);
            assert.equal(result.entryId, 50);
            assert.equal(result.annotatorId, 9);
            assert.equal(result.currentCriterionIndex, 0);
        });

        it('devuelve la review activa existente sin crear otra', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, currentCriterionIndex: 1, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date(), completedAt: null }];
            const { repo, reviews } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            const result = await service.requestNextReview({ reviewerId: 7 });

            assert.equal(result.reviewId, 1);
            assert.equal(reviews.size, 1);
        });

        it('lanza no_review_available cuando no hay candidatos', async () => {
            const { repo } = buildRepoStub([], { reviewableEntries: [] });
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.requestNextReview({ reviewerId: 7 }),
                (/** @type {any} */ err) => err.code === 'no_review_available' && err.status === 404
            );
        });

        it('lanza annotator_missing si la entry no tiene annotations', async () => {
            const { repo } = buildRepoStub([], {
                reviewableEntries: [{ id: 1, annotations: [] }]
            });
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.requestNextReview({ reviewerId: 7 }),
                (/** @type {any} */ err) => err.code === 'annotator_missing'
            );
        });

        it('acota la busqueda al dataset si el usuario tiene permiso de reviewer', async () => {
            /** @type {any[]} */
            const captured = [];
            const { repo } = buildRepoStub([], {
                reviewableEntries: [{ id: 5, annotations: [{ userId: 11 }] }]
            });
            const wrappedRepo = {
                ...repo,
                async findActiveReviewByReviewer(/** @type {*} */ args) {
                    captured.push(['active', args.datasetId]);
                    return repo.findActiveReviewByReviewer(args);
                },
                async findReviewableEntries(/** @type {*} */ args) {
                    captured.push(['candidates', args.datasetId]);
                    return repo.findReviewableEntries(args);
                }
            };
            const service = createReviewsService({
                reviewsRepository: wrappedRepo,
                datasetsRepository: {
                    async findPermitForUser() {
                        return { isReviewer: true };
                    }
                },
                prismaClient: buildPrismaStub()
            });

            const result = await service.requestNextReview({ reviewerId: 7, datasetId: 12 });

            assert.equal(result.entryId, 5);
            assert.deepEqual(captured, [['active', 12], ['candidates', 12]]);
        });

        it('rechaza dataset acotado si el usuario no es reviewer del dataset', async () => {
            const { repo } = buildRepoStub([], {
                reviewableEntries: [{ id: 5, annotations: [{ userId: 11 }] }]
            });
            const service = createReviewsService({
                reviewsRepository: repo,
                datasetsRepository: {
                    async findPermitForUser() {
                        return { isReviewer: false };
                    }
                },
                prismaClient: buildPrismaStub()
            });

            await assert.rejects(
                () => service.requestNextReview({ reviewerId: 7, datasetId: 12 }),
                (/** @type {any} */ err) => err.code === 'dataset_reviewer_required' && err.status === 403
            );
        });
    });

    describe('submitDecision', () => {
        /**
         * Builds pending service from the received data.
         * @returns {*} Result produced by the function.
         */
        function buildPendingService() {
            const initial = [{
                id: 10,
                reviewerId: 7,
                entryId: 1,
                annotatorId: 9,
                status: REVIEW_PENDING,
                currentCriterionIndex: 0,
                expiresAt: new Date(Date.now() + 1000),
                assignedAt: new Date(),
                completedAt: null
            }];
            const stub = buildRepoStub(initial);
            const service = createReviewsService({
                reviewsRepository: stub.repo,
                prismaClient: buildPrismaStub()
            });
            return { service, ...stub };
        }

        it('rechaza con criterion_locked si se salta criterios', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 7,
                    criterionCode: CRITERION_COVERAGE,
                    decision: REVIEW_DECISION_ACCEPTED
                }),
                (/** @type {any} */ err) => err.code === 'criterion_locked' && err.status === 409
            );
        });

        it('rechaza con comment_required si decision rechazada sin comentario', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 7,
                    criterionCode: CRITERION_GRAMMAR,
                    decision: REVIEW_DECISION_REJECTED
                }),
                (/** @type {any} */ err) => err.code === 'comment_required'
            );
        });

        it('rechaza con review_not_assigned cuando otro reviewer intenta operar', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 999,
                    criterionCode: CRITERION_GRAMMAR,
                    decision: REVIEW_DECISION_ACCEPTED
                }),
                (/** @type {any} */ err) => err.code === 'review_not_assigned' && err.status === 403
            );
        });

        it('avanza currentCriterionIndex y pasa a in_progress', async () => {
            const { service, reviews } = buildPendingService();

            const updated = await service.submitDecision({
                reviewId: 10,
                reviewerId: 7,
                criterionCode: CRITERION_GRAMMAR,
                decision: REVIEW_DECISION_ACCEPTED
            });

            assert.equal(updated.currentCriterionIndex, 1);
            assert.equal(updated.status, REVIEW_IN_PROGRESS);
            assert.equal(reviews.get(10).currentCriterionIndex, 1);
        });

        it('permite reabrir un criterio anterior sin avanzar el indice', async () => {
            const { service } = buildPendingService();

            await service.submitDecision({ reviewId: 10, reviewerId: 7, criterionCode: CRITERION_GRAMMAR, decision: REVIEW_DECISION_ACCEPTED });
            const reopened = await service.submitDecision({
                reviewId: 10,
                reviewerId: 7,
                criterionCode: CRITERION_GRAMMAR,
                decision: REVIEW_DECISION_REJECTED,
                comment: 'mejor revisar'
            });

            assert.equal(reopened.currentCriterionIndex, 1);
        });
    });

    describe('submitTextCorrection', () => {
        it('lanza comment_required si falta comentario', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, currentCriterionIndex: 0, entryId: 1, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.submitTextCorrection({
                    reviewId: 1, reviewerId: 7, sentenceIndex: 0, correctedSentence: 'foo'
                }),
                (/** @type {any} */ err) => err.code === 'comment_required'
            );
        });

        it('persiste el comentario cuando hay corrected y comment', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, currentCriterionIndex: 0, entryId: 1, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, commentsByReview } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            const result = await service.submitTextCorrection({
                    reviewId: 1, reviewerId: 7, sentenceIndex: 0,
                originalSentence: 'foo', correctedSentence: 'foo bar',
                comment: 'añadir contexto'
            });

            assert.equal(result.length, 1);
            assert.equal(commentsByReview.get(1)[0].correctedSentence, 'foo bar');
            assert.equal(commentsByReview.get(1)[0].comment, 'añadir contexto');
        });
    });

    describe('finalizeReview', () => {
        /**
         * Updates setup all accepted with the given data.
         */
        function setupAllAccepted() {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, currentCriterionIndex: 4, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const stub = buildRepoStub(initial);
            for (const code of getOrderedCriterionCodes())
                stub.decisionsByReview.set(1, [...(stub.decisionsByReview.get(1) || []), { criterionCode: code, decision: REVIEW_DECISION_ACCEPTED, comment: null }]);
            return stub;
        }

        it('rechaza con criteria_incomplete si faltan decisiones', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, currentCriterionIndex: 1, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, decisionsByReview } = buildRepoStub(initial);
            decisionsByReview.set(1, [{ criterionCode: CRITERION_GRAMMAR, decision: REVIEW_DECISION_ACCEPTED }]);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.finalizeReview({ reviewId: 1, reviewerId: 7 }),
                (/** @type {any} */ err) => err.code === 'criteria_incomplete'
            );
        });

        it('marca completed + entry reviewed si todo es accepted', async () => {
            const stub = setupAllAccepted();
            const updates = { entryStatus: null, reviewStatus: null };
            const prisma = {
                /**
                 * Asynchronously runs the logic of $transaction.
                 * @param {*} fn - Value of fn used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async $transaction(fn) {
                    return fn({
                        review: { async update(/** @type {*} */ args) { updates.reviewStatus = args.data.status; stub.reviews.get(args.where.id).status = args.data.status; stub.reviews.get(args.where.id).completedAt = args.data.completedAt; } },
                        entry: { async update(/** @type {*} */ args) { updates.entryStatus = args.data.status; } }
                    });
                },
                entry: { async findUnique() { return null; } }
            };
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            const result = await service.finalizeReview({ reviewId: 1, reviewerId: 7 });

            assert.equal(updates.reviewStatus, REVIEW_COMPLETED);
            assert.equal(updates.entryStatus, ENTRY_REVIEWED);
            assert.equal(result.status, REVIEW_COMPLETED);
        });

        it('marca disputed + entry disputed si alguna decision no es accepted', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, currentCriterionIndex: 4, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const stub = buildRepoStub(initial);
            const decisions = getOrderedCriterionCodes().map((/** @type {*} */ code, /** @type {*} */ i) => ({
                criterionCode: code,
                decision: i === 0 ? REVIEW_DECISION_REJECTED : REVIEW_DECISION_ACCEPTED,
                comment: i === 0 ? 'fail' : null
            }));
            stub.decisionsByReview.set(1, decisions);
            const updates = { entryStatus: null, reviewStatus: null };
            const prisma = {
                /**
                 * Asynchronously runs the logic of $transaction.
                 * @param {*} fn - Value of fn used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async $transaction(fn) {
                    return fn({
                        review: { async update(/** @type {*} */ args) { updates.reviewStatus = args.data.status; stub.reviews.get(args.where.id).status = args.data.status; } },
                        entry: { async update(/** @type {*} */ args) { updates.entryStatus = args.data.status; } }
                    });
                },
                entry: { async findUnique() { return null; } }
            };
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            const result = await service.finalizeReview({ reviewId: 1, reviewerId: 7 });

            assert.equal(updates.reviewStatus, REVIEW_DISPUTED);
            assert.equal(updates.entryStatus, ENTRY_DISPUTED);
            assert.equal(result.status, REVIEW_DISPUTED);
        });
    });

    describe('releaseReview', () => {
        it('marca como released cuando pertenece al reviewer', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, currentCriterionIndex: 0, entryId: 5, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, reviews } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await service.releaseReview({ reviewId: 1, reviewerId: 7 });

            assert.equal(reviews.get(1).status, REVIEW_RELEASED);
        });

        it('rechaza ajeno con review_not_assigned', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, currentCriterionIndex: 0, entryId: 5, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.releaseReview({ reviewId: 1, reviewerId: 999 }),
                (/** @type {any} */ err) => err.code === 'review_not_assigned'
            );
        });
    });
});

describe('buildFeedbackEntry', () => {
    it('proyecta criterios fallidos y comentarios', () => {
        const review = {
            id: 1,
            entryId: 10,
            entry: { datasetId: 3, eid: 5 },
            status: REVIEW_DISPUTED,
            completedAt: new Date('2026-04-26T10:00:00Z'),
            decisions: [
                { criterionCode: CRITERION_GRAMMAR, decision: REVIEW_DECISION_ACCEPTED, comment: null },
                { criterionCode: CRITERION_COVERAGE, decision: REVIEW_DECISION_REJECTED, comment: 'falta entidad' }
            ],
            comments: [{ sentenceIndex: 0, originalSentence: 'a', correctedSentence: 'b', comment: 'fix' }]
        };

        const entry = buildFeedbackEntry(review);

        assert.equal(entry.failedCriteria.length, 1);
        assert.equal(entry.failedCriteria[0].criterionCode, CRITERION_COVERAGE);
        assert.equal(entry.corrections.length, 1);
        assert.equal(entry.corrections[0].correctedSentence, 'b');
        assert.equal(entry.datasetId, 3);
    });

    it('devuelve arrays vacios cuando no hay decisiones ni comentarios', () => {
        const entry = buildFeedbackEntry({
            id: 1, entryId: 5, entry: null, status: REVIEW_COMPLETED, completedAt: null
        });
        assert.deepEqual(entry.failedCriteria, []);
        assert.deepEqual(entry.corrections, []);
        assert.equal(entry.datasetId, null);
    });
});

describe('buildReviewContextDTO', () => {
    it('aplana triples y filtra lex inglesas', () => {
        const dto = buildReviewContextDTO({
            review: { id: 1, entryId: 2, reviewerId: 3, annotatorId: 4, status: REVIEW_PENDING, currentCriterionIndex: 0, assignedAt: new Date(), expiresAt: new Date(), completedAt: null },
            entry: {
                entryId: 2, datasetId: 7, eid: 1, position: 0, status: 'annotated',
                triplesets: [
                    { type: 'original', triples: [{ subject: 'A', predicate: 'p', object: 'B' }] },
                    { type: 'modified', triples: [{ subject: 'C', predicate: 'p', object: 'D' }] }
                ],
                lexes: [
                    { lang: 'en', text: 'hello' },
                    { lang: 'es', text: 'hola' }
                ],
                annotations: [{ sentenceIndex: 0, sentence: 'foo', origin: 'manual' }],
                alertDecisions: []
            },
            decisions: [],
            comments: []
        });

        assert.equal(dto.triples.length, 2);
        assert.deepEqual(dto.englishSentences, ['hello']);
        assert.equal(dto.criteria.length, 4);
        assert.equal(dto.annotations[0].sentence, 'foo');
    });

    it('soporta entry null sin lanzar', () => {
        const dto = buildReviewContextDTO({
            review: { id: 1, entryId: 2, reviewerId: 3, annotatorId: 4, status: REVIEW_PENDING, currentCriterionIndex: 0 },
            entry: null,
            decisions: null,
            comments: null
        });
        assert.deepEqual(dto.triples, []);
        assert.deepEqual(dto.englishSentences, []);
        assert.deepEqual(dto.reviewDecisions, []);
        assert.deepEqual(dto.reviewComments, []);
    });
});
