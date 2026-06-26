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
    getPhraseCriterionCodes
} = require('../../../constants/review-criterion');
const {
    ENTRY_ANNOTATED,
    ENTRY_REVIEWED,
    ENTRY_DISPUTED
} = require('../../../constants/entry-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const PHRASE_CODES = getPhraseCriterionCodes();
const FIRST_PHRASE_CRITERION = PHRASE_CODES[0];   // 'naturalness'
const SECOND_PHRASE_CRITERION = PHRASE_CODES[1];  // 'fluency'

/**
 * Builds repo stub from the received data.
 * @param {Array<*>} initialReviews - Reviews to seed the store with.
 * @param {*} options - { reviewableEntries, sentenceIndexes }.
 * @returns {*} The stub plus its internal stores.
 */
function buildRepoStub(initialReviews = [], options = {}) {
    const reviews = new Map(initialReviews.map(r => [r.id, { ...r }]));
    const decisionsByReview = new Map();
    const commentsByReview = new Map();
    let nextId = 1000;

    /** @type {ReviewsRepoStub} */
    const repo = {
        async expireStaleReviews() { return { count: 0 }; },
        async findActiveReviewByReviewer({ reviewerId }) {
            for (const r of reviews.values())
                if (r.reviewerId === reviewerId && (r.status === REVIEW_PENDING || r.status === REVIEW_IN_PROGRESS))
                    return { ...r };
            return null;
        },
        async findReviewById(reviewId) {
            return reviews.has(reviewId) ? { ...reviews.get(reviewId) } : null;
        },
        async findReviewableEntries({ reviewerId: _idReviewer, limit: _limit = 1 }) {
            return options.reviewableEntries || [];
        },
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
        async updateReviewStatus({ reviewId, status, completedAt = null }) {
            const r = reviews.get(reviewId);
            r.status = status;
            if (completedAt !== null) r.completedAt = completedAt;
            return { ...r };
        },
        async updateReviewProgress({ reviewId, currentCriterionIndex, status }) {
            const r = reviews.get(reviewId);
            r.currentCriterionIndex = currentCriterionIndex;
            if (status) r.status = status;
            return { ...r };
        },
        async upsertDecision({ reviewId, sentenceIndex = null, criterionCode, decision, comment }) {
            const normalized = Number.isInteger(sentenceIndex) ? sentenceIndex : null;
            const list = decisionsByReview.get(reviewId) || [];
            const existing = list.find((/** @type {*} */ d) => d.sentenceIndex === normalized && d.criterionCode === criterionCode);
            if (existing) {
                existing.decision = decision;
                existing.comment = comment;
                existing.decidedAt = new Date();
            } else {
                list.push({ reviewId, sentenceIndex: normalized, criterionCode, decision, comment, decidedAt: new Date() });
            }
            decisionsByReview.set(reviewId, list);
            return list[list.length - 1];
        },
        async findDecisionsByReview({ reviewId }) {
            return (decisionsByReview.get(reviewId) || []).map((/** @type {*} */ d) => ({ ...d }));
        },
        async findAnnotatedSentenceIndexes({ entryId: _entryId, annotatorId: _annotatorId }) {
            return options.sentenceIndexes || [0];
        },
        async createComment(payload) {
            const list = commentsByReview.get(payload.reviewId) || [];
            list.push({ ...payload, id: list.length + 1, createdAt: new Date() });
            commentsByReview.set(payload.reviewId, list);
            return list[list.length - 1];
        },
        async findCommentsByReview({ reviewId }) {
            return (commentsByReview.get(reviewId) || []).map((/** @type {*} */ c) => ({ ...c }));
        },
        async findCompletedReviewsForAnnotator() { return []; },
        async findPreviousTerminalReview({ entryId, beforeRoundIndex }) {
            const terminal = [...reviews.values()]
                .filter(r => r.entryId === entryId
                    && Number.isInteger(r.roundIndex)
                    && r.roundIndex < beforeRoundIndex
                    && (r.status === REVIEW_COMPLETED || r.status === REVIEW_DISPUTED))
                .sort((a, b) => b.roundIndex - a.roundIndex);
            return terminal[0] ? { ...terminal[0] } : null;
        }
    };

    return { repo, reviews, decisionsByReview, commentsByReview };
}

/**
 * Builds a minimal prisma stub for the finalize transaction.
 * @param {*} [transactionImpl] - Optional transaction body.
 * @returns {*} Prisma-like stub.
 */
function buildPrismaStub(transactionImpl) {
    return /** @type {PrismaStub} */ ({
        async $transaction(fn) {
            const tx = transactionImpl || {
                review: { async update() {} },
                entry: { async update() {} }
            };
            return fn(tx);
        },
        entry: { async findUnique() { return null; } }
    });
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
            assert.ok(Number.isInteger(result.id) && result.id > 0);
        });

        it('devuelve la review activa existente sin crear otra', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date(), completedAt: null }];
            const { repo, reviews } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            const result = await service.requestNextReview({ reviewerId: 7 });

            assert.equal(result.reviewId, 1);
            assert.equal(result.id, 1);
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
                datasetsPermissionsRepository: {
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
                datasetsPermissionsRepository: {
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
         * Builds a service over one pending review (entry 1, annotator 9).
         * @returns {*} { service, ...stub }.
         */
        function buildPendingService() {
            const initial = [{
                id: 10,
                reviewerId: 7,
                entryId: 1,
                annotatorId: 9,
                status: REVIEW_PENDING,
                expiresAt: new Date(Date.now() + 1000),
                assignedAt: new Date(),
                completedAt: null
            }];
            const stub = buildRepoStub(initial, { sentenceIndexes: [0, 1] });
            const service = createReviewsService({
                reviewsRepository: stub.repo,
                prismaClient: buildPrismaStub()
            });
            return { service, ...stub };
        }

        it('rechaza con criterion_locked si se salta criterios de la frase', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 7,
                    sentenceIndex: 0,
                    criterionCode: SECOND_PHRASE_CRITERION,
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
                    sentenceIndex: 0,
                    criterionCode: FIRST_PHRASE_CRITERION,
                    decision: REVIEW_DECISION_REJECTED
                }),
                (/** @type {any} */ err) => err.code === 'comment_required'
            );
        });

        it('rechaza criterio de frase enviado como nivel de review', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 7,
                    sentenceIndex: null,
                    criterionCode: FIRST_PHRASE_CRITERION,
                    decision: REVIEW_DECISION_ACCEPTED
                }),
                (/** @type {any} */ err) => err.code === 'invalid_criterion'
            );
        });

        it('rechaza con review_not_assigned cuando otro reviewer intenta operar', async () => {
            const { service } = buildPendingService();

            await assert.rejects(
                () => service.submitDecision({
                    reviewId: 10,
                    reviewerId: 999,
                    sentenceIndex: 0,
                    criterionCode: FIRST_PHRASE_CRITERION,
                    decision: REVIEW_DECISION_ACCEPTED
                }),
                (/** @type {any} */ err) => err.code === 'review_not_assigned' && err.status === 403
            );
        });

        it('registra el primer criterio y pasa la review a in_progress', async () => {
            const { service, reviews, decisionsByReview } = buildPendingService();

            const updated = await service.submitDecision({
                reviewId: 10,
                reviewerId: 7,
                sentenceIndex: 0,
                criterionCode: FIRST_PHRASE_CRITERION,
                decision: REVIEW_DECISION_ACCEPTED
            });

            assert.equal(updated.status, REVIEW_IN_PROGRESS);
            assert.equal(reviews.get(10).status, REVIEW_IN_PROGRESS);
            assert.equal(decisionsByReview.get(10)[0].sentenceIndex, 0);
            assert.equal(decisionsByReview.get(10)[0].criterionCode, FIRST_PHRASE_CRITERION);
        });

        it('registra el criterio de review (diversity) con sentenceIndex null', async () => {
            const { service, decisionsByReview } = buildPendingService();

            await service.submitDecision({
                reviewId: 10,
                reviewerId: 7,
                sentenceIndex: null,
                criterionCode: 'diversity',
                decision: REVIEW_DECISION_ACCEPTED
            });

            const stored = decisionsByReview.get(10)[0];
            assert.equal(stored.sentenceIndex, null);
            assert.equal(stored.criterionCode, 'diversity');
        });

        it('permite redecidir un criterio ya resuelto de la misma frase', async () => {
            const { service, decisionsByReview } = buildPendingService();

            await service.submitDecision({ reviewId: 10, reviewerId: 7, sentenceIndex: 0, criterionCode: FIRST_PHRASE_CRITERION, decision: REVIEW_DECISION_ACCEPTED });
            await service.submitDecision({
                reviewId: 10,
                reviewerId: 7,
                sentenceIndex: 0,
                criterionCode: FIRST_PHRASE_CRITERION,
                decision: REVIEW_DECISION_REJECTED,
                comment: 'mejor revisar'
            });

            const list = decisionsByReview.get(10);
            assert.equal(list.length, 1);
            assert.equal(list[0].decision, REVIEW_DECISION_REJECTED);
        });
    });

    describe('submitTextCorrection', () => {
        /**
         * @returns {*} { service, ...stub } over one pending review.
         */
        function buildCorrectionService() {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, entryId: 1, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const stub = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: buildPrismaStub() });
            return { service, ...stub };
        }

        it('persiste la correccion aunque no se aporte comentario', async () => {
            const { service, commentsByReview } = buildCorrectionService();

            const result = await service.submitTextCorrection({
                reviewId: 1, reviewerId: 7, sentenceIndex: 0,
                originalSentence: 'foo', correctedSentence: 'foo bar'
            });

            assert.equal(result.length, 1);
            assert.equal(commentsByReview.get(1)[0].correctedSentence, 'foo bar');
            assert.equal(commentsByReview.get(1)[0].comment, '');
        });

        it('rechaza con invalid_correction si el texto corregido esta vacio', async () => {
            const { service } = buildCorrectionService();

            await assert.rejects(
                () => service.submitTextCorrection({
                    reviewId: 1, reviewerId: 7, sentenceIndex: 0, correctedSentence: '   '
                }),
                (/** @type {any} */ err) => err.code === 'invalid_correction'
            );
        });

        it('persiste corrected y comment cuando se aporta justificacion', async () => {
            const { service, commentsByReview } = buildCorrectionService();

            await service.submitTextCorrection({
                reviewId: 1, reviewerId: 7, sentenceIndex: 0,
                originalSentence: 'foo', correctedSentence: 'foo bar',
                comment: 'añadir contexto'
            });

            assert.equal(commentsByReview.get(1)[0].comment, 'añadir contexto');
        });
    });

    describe('finalizeReview', () => {
        /**
         * Seeds a single-phrase review with every per-phrase criterion accepted.
         * @returns {*} The repo stub.
         */
        function setupAllAccepted() {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const stub = buildRepoStub(initial, { sentenceIndexes: [0] });
            stub.decisionsByReview.set(1, PHRASE_CODES.map(code => ({
                sentenceIndex: 0, criterionCode: code, decision: REVIEW_DECISION_ACCEPTED, comment: null
            })));
            return stub;
        }

        it('rechaza con criteria_incomplete si faltan decisiones de la frase', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, decisionsByReview } = buildRepoStub(initial, { sentenceIndexes: [0] });
            decisionsByReview.set(1, [{ sentenceIndex: 0, criterionCode: FIRST_PHRASE_CRITERION, decision: REVIEW_DECISION_ACCEPTED }]);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.finalizeReview({ reviewId: 1, reviewerId: 7 }),
                (/** @type {any} */ err) => err.code === 'criteria_incomplete'
            );
        });

        it('exige diversity cuando hay mas de una frase', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, decisionsByReview } = buildRepoStub(initial, { sentenceIndexes: [0, 1] });
            // Both phrases fully decided, but the review-level diversity is missing.
            const decisions = [];
            for (const sentenceIndex of [0, 1])
                for (const code of PHRASE_CODES)
                    decisions.push({ sentenceIndex, criterionCode: code, decision: REVIEW_DECISION_ACCEPTED, comment: null });
            decisionsByReview.set(1, decisions);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await assert.rejects(
                () => service.finalizeReview({ reviewId: 1, reviewerId: 7 }),
                (/** @type {any} */ err) => err.code === 'criteria_incomplete'
            );
        });

        it('marca completed + entry reviewed si todo es accepted', async () => {
            const stub = setupAllAccepted();
            const updates = { entryStatus: null, reviewStatus: null };
            /** @type {PrismaStub} */
            const prisma = {
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

        it('registra timeSpentSeconds (acotado a la ventana de reserva) al finalizar', async () => {
            const stub = setupAllAccepted();
            /** @type {any} */
            let recorded = null;
            /** @type {PrismaStub} */
            const prisma = {
                async $transaction(fn) {
                    return fn({
                        review: { async update(/** @type {*} */ args) { recorded = args.data; stub.reviews.get(args.where.id).status = args.data.status; } },
                        entry: { async update() {} }
                    });
                },
                entry: { async findUnique() { return null; } }
            };
            const service = createReviewsService({
                reviewsRepository: stub.repo,
                prismaClient: prisma,
                reviewDurationMs: 600000 // 10 minutes => cap 600s
            });

            await service.finalizeReview({ reviewId: 1, reviewerId: 7, timeSpentSeconds: 245 });
            assert.equal(recorded.timeSpentSeconds, 245);
        });

        it('acota timeSpentSeconds desorbitado a la ventana de reserva', async () => {
            const stub = setupAllAccepted();
            /** @type {any} */
            let recorded = null;
            /** @type {PrismaStub} */
            const prisma = {
                async $transaction(fn) {
                    return fn({
                        review: { async update(/** @type {*} */ args) { recorded = args.data; stub.reviews.get(args.where.id).status = args.data.status; } },
                        entry: { async update() {} }
                    });
                },
                entry: { async findUnique() { return null; } }
            };
            const service = createReviewsService({
                reviewsRepository: stub.repo,
                prismaClient: prisma,
                reviewDurationMs: 600000 // cap 600s
            });

            await service.finalizeReview({ reviewId: 1, reviewerId: 7, timeSpentSeconds: 999999 });
            assert.equal(recorded.timeSpentSeconds, 600);
        });

        it('marca disputed + entry disputed si alguna decision no es accepted', async () => {
            const initial = [{ id: 1, reviewerId: 7, entryId: 5, annotatorId: 9, status: REVIEW_IN_PROGRESS, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const stub = buildRepoStub(initial, { sentenceIndexes: [0] });
            stub.decisionsByReview.set(1, PHRASE_CODES.map((code, i) => ({
                sentenceIndex: 0,
                criterionCode: code,
                decision: i === 0 ? REVIEW_DECISION_REJECTED : REVIEW_DECISION_ACCEPTED,
                comment: i === 0 ? 'fail' : null
            })));
            const updates = { entryStatus: null, reviewStatus: null };
            /** @type {PrismaStub} */
            const prisma = {
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

    describe('finalizeReview (multi-round consensus, §4.6)', () => {
        /**
         * Builds the prisma stub used by the multi-round tests. Tracks the
         * final entry status, review data and `Annotation.updateMany` calls so
         * the assertions can check both branches.
         * @param {*} stub - The repo stub.
         * @param {boolean} hasAdditionalReviews - The dataset opt-in flag.
         * @returns {*} { prisma, captured }
         */
        function buildMultiRoundPrisma(stub, hasAdditionalReviews) {
            /** @type {*} */
            const captured = { entryStatus: null, reviewData: null, annotationCalls: [] };
            /** @type {PrismaStub} */
            const prisma = {
                async $transaction(fn) {
                    return fn({
                        review: { async update(/** @type {*} */ args) {
                            captured.reviewData = args.data;
                            Object.assign(stub.reviews.get(args.where.id), args.data);
                        } },
                        entry: { async update(/** @type {*} */ args) { captured.entryStatus = args.data.status; } },
                        annotation: { async updateMany(/** @type {*} */ args) { captured.annotationCalls.push(args); } }
                    });
                },
                entry: {
                    async findUnique() {
                        return { dataset: { hasAdditionalReviews } };
                    }
                }
            };
            return { prisma, captured };
        }

        /**
         * Seeds a review with `roundIndex` and all phrase criteria accepted.
         * @param {{ id:number, roundIndex:number, entryId?:number }} input
         * @returns {*} stub.
         */
        function seedAcceptedReview({ id, roundIndex, entryId = 5 }) {
            const initial = [{
                id, reviewerId: 7, entryId, annotatorId: 9,
                status: REVIEW_IN_PROGRESS, roundIndex,
                expiresAt: new Date(Date.now() + 1000), assignedAt: new Date()
            }];
            const stub = buildRepoStub(initial, { sentenceIndexes: [0] });
            stub.decisionsByReview.set(id, PHRASE_CODES.map(code => ({
                sentenceIndex: 0, criterionCode: code, decision: REVIEW_DECISION_ACCEPTED, comment: null
            })));
            return stub;
        }

        it('clean + sin ronda previa => entry annotated (re-encolable) y cleanRound=true', async () => {
            const stub = seedAcceptedReview({ id: 1, roundIndex: 0 });
            const { prisma, captured } = buildMultiRoundPrisma(stub, true);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            const result = await service.finalizeReview({ reviewId: 1, reviewerId: 7 });

            assert.equal(result.status, REVIEW_COMPLETED);
            assert.equal(captured.entryStatus, ENTRY_ANNOTATED);
            assert.equal(captured.reviewData.cleanRound, true);
        });

        it('clean tras una ronda clean previa => entry reviewed (terminar cadena)', async () => {
            const stub = seedAcceptedReview({ id: 2, roundIndex: 1 });
            // Seed a previous terminal clean review.
            stub.reviews.set(99, {
                id: 99, entryId: 5, reviewerId: 8, annotatorId: 9,
                status: REVIEW_COMPLETED, roundIndex: 0, cleanRound: true,
                expiresAt: new Date(), assignedAt: new Date(), completedAt: new Date()
            });
            const { prisma, captured } = buildMultiRoundPrisma(stub, true);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            const result = await service.finalizeReview({ reviewId: 2, reviewerId: 7 });

            assert.equal(result.status, REVIEW_COMPLETED);
            assert.equal(captured.entryStatus, ENTRY_REVIEWED);
            assert.equal(captured.reviewData.cleanRound, true);
        });

        it('clean tras una ronda previa NO clean => entry annotated (cadena continua)', async () => {
            const stub = seedAcceptedReview({ id: 3, roundIndex: 1 });
            stub.reviews.set(98, {
                id: 98, entryId: 5, reviewerId: 8, annotatorId: 9,
                status: REVIEW_DISPUTED, roundIndex: 0, cleanRound: false,
                expiresAt: new Date(), assignedAt: new Date(), completedAt: new Date()
            });
            const { prisma, captured } = buildMultiRoundPrisma(stub, true);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            await service.finalizeReview({ reviewId: 3, reviewerId: 7 });

            assert.equal(captured.entryStatus, ENTRY_ANNOTATED);
            assert.equal(captured.reviewData.cleanRound, true);
        });

        it('ronda no-clean => disputed, entry annotated y propaga la corrección al Annotation', async () => {
            const stub = seedAcceptedReview({ id: 4, roundIndex: 0 });
            // Override one decision to make the round non-clean.
            const decisions = stub.decisionsByReview.get(4);
            decisions[0].decision = REVIEW_DECISION_REJECTED;
            decisions[0].comment = 'mejorar';
            // And a text correction was submitted for sentenceIndex 0.
            stub.commentsByReview.set(4, [{
                reviewId: 4, sentenceIndex: 0,
                originalSentence: 'foo', correctedSentence: 'foo corregido',
                comment: 'ajusta sujeto', isAcceptedFirstTry: false, createdAt: new Date()
            }]);
            const { prisma, captured } = buildMultiRoundPrisma(stub, true);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            await service.finalizeReview({ reviewId: 4, reviewerId: 7 });

            assert.equal(captured.entryStatus, ENTRY_ANNOTATED);
            assert.equal(captured.reviewData.cleanRound, false);
            // Two updateMany calls: one isAcceptedFirstTry=false (annotator's
            // rows), one Annotation.sentence rewrite for the corrected phrase.
            assert.equal(captured.annotationCalls.length, 2);
            const correction = captured.annotationCalls.find((/** @type {*} */ c) => c.data.sentence);
            assert.ok(correction, 'esperaba una llamada a Annotation.updateMany con sentence');
            assert.equal(correction.data.sentence, 'foo corregido');
            assert.equal(correction.where.sentenceIndex, 0);
        });

        it('comments presentes => round NO clean aunque todo sea accepted', async () => {
            const stub = seedAcceptedReview({ id: 5, roundIndex: 0 });
            // All accepted, but the reviewer also submitted a text correction.
            stub.commentsByReview.set(5, [{
                reviewId: 5, sentenceIndex: 0,
                originalSentence: 'foo', correctedSentence: 'foo refinado',
                comment: '', isAcceptedFirstTry: true, createdAt: new Date()
            }]);
            const { prisma, captured } = buildMultiRoundPrisma(stub, true);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            await service.finalizeReview({ reviewId: 5, reviewerId: 7 });

            // A correction is a change → not a clean round even if every
            // criterion was accepted.
            assert.equal(captured.reviewData.cleanRound, false);
            assert.equal(captured.entryStatus, ENTRY_ANNOTATED);
        });

        it('hasAdditionalReviews=false respeta el camino single-round (entry reviewed en clean)', async () => {
            const stub = seedAcceptedReview({ id: 6, roundIndex: 0 });
            const { prisma, captured } = buildMultiRoundPrisma(stub, false);
            const service = createReviewsService({ reviewsRepository: stub.repo, prismaClient: prisma });

            await service.finalizeReview({ reviewId: 6, reviewerId: 7 });

            assert.equal(captured.entryStatus, ENTRY_REVIEWED);
            assert.equal(captured.reviewData.cleanRound, true);
        });
    });

    describe('releaseReview', () => {
        it('marca como released cuando pertenece al reviewer', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, entryId: 5, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
            const { repo, reviews } = buildRepoStub(initial);
            const service = createReviewsService({ reviewsRepository: repo, prismaClient: buildPrismaStub() });

            await service.releaseReview({ reviewId: 1, reviewerId: 7 });

            assert.equal(reviews.get(1).status, REVIEW_RELEASED);
        });

        it('rechaza ajeno con review_not_assigned', async () => {
            const initial = [{ id: 1, reviewerId: 7, status: REVIEW_PENDING, entryId: 5, annotatorId: 9, expiresAt: new Date(Date.now() + 1000), assignedAt: new Date() }];
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
                { criterionCode: 'naturalness', decision: REVIEW_DECISION_ACCEPTED, comment: null },
                { criterionCode: 'coverage', decision: REVIEW_DECISION_REJECTED, comment: 'falta entidad' }
            ],
            comments: [{ sentenceIndex: 0, originalSentence: 'a', correctedSentence: 'b', comment: 'fix' }]
        };

        const entry = buildFeedbackEntry(review);

        assert.equal(entry.failedCriteria.length, 1);
        assert.equal(entry.failedCriteria[0].criterionCode, 'coverage');
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
    it('expone catalogos de frase y review, usa solo triples modified y filtra lex inglesas', () => {
        const dto = buildReviewContextDTO({
            review: { id: 1, entryId: 2, reviewerId: 3, annotatorId: 4, status: REVIEW_PENDING, assignedAt: new Date(), expiresAt: new Date(), completedAt: null },
            entry: {
                id: 2, datasetId: 7, eid: 1, position: 0, status: 'annotated',
                dataset: { id: 7, name: 'WebNLG-es' },
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
            comments: [],
            annotatorEmail: 'ana@lanbench.dev'
        });

        assert.deepEqual(dto.triples, [{
            subject: 'C',
            predicate: 'p',
            object: 'D',
            triplesetType: 'modified'
        }]);
        assert.deepEqual(dto.englishSentences, ['hello']);
        assert.equal(dto.phraseCriteria.length, 5);
        assert.equal(dto.reviewCriteria.length, 1);
        assert.equal(dto.annotations[0].sentence, 'foo');
        assert.equal(dto.review.datasetName, 'WebNLG-es');
        assert.equal(dto.review.annotatorEmail, 'ana@lanbench.dev');
    });

    it('mapea sentenceIndex de las decisiones (null = nivel review)', () => {
        const dto = buildReviewContextDTO({
            review: { id: 1, entryId: 2, status: REVIEW_PENDING },
            entry: null,
            decisions: [
                { sentenceIndex: 0, criterionCode: 'naturalness', decision: 'accepted', comment: null },
                { sentenceIndex: null, criterionCode: 'diversity', decision: 'rejected', comment: 'poca variedad' }
            ],
            comments: []
        });

        assert.equal(dto.reviewDecisions.length, 2);
        assert.equal(dto.reviewDecisions[0].sentenceIndex, 0);
        assert.equal(dto.reviewDecisions[1].sentenceIndex, null);
        assert.equal(dto.reviewDecisions[1].criterionCode, 'diversity');
    });

    it('soporta entry null sin lanzar', () => {
        const dto = buildReviewContextDTO({
            review: { id: 1, entryId: 2, reviewerId: 3, annotatorId: 4, status: REVIEW_PENDING },
            entry: null,
            decisions: null,
            comments: null
        });
        assert.deepEqual(dto.triples, []);
        assert.deepEqual(dto.englishSentences, []);
        assert.deepEqual(dto.reviewDecisions, []);
        assert.deepEqual(dto.reviewComments, []);
        assert.equal(dto.review.datasetId, null);
        assert.equal(dto.review.datasetName, null);
    });
});
