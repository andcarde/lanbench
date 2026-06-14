'use strict';

/**
 * T4.7 — Integration tests for block E4.
 *
 * They validate the full review chain (queue → wizard → finalization → feedback)
 * and the exclusivity/expiration between reviewers, exercising HTTP via createApp().
 *
 * Since MySQL credentials are not available in this autonomous environment,
 * the repositories are replaced by in-memory stubs injected through
 * `createApp({ controllers: ... })`. The HTTP layer, the auth middleware, the
 * routers, controllers and services run without mocks. Only the persistent
 * storage is stubbed.
 *
 * The session is injected via sessionMiddleware (same pattern as
 * admin-api.integration.test.js) using the X-Test-User header to select the
 * user on each request.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createReviewsController } = require('../../../controllers/reviews-controller');
const { createReviewsService } = require('../../../services/reviews-service');
const {
    REVIEW_PENDING,
    REVIEW_IN_PROGRESS,
    REVIEW_COMPLETED,
    REVIEW_DISPUTED,
    REVIEW_EXPIRED
} = require('../../../constants/review-status');
const {
    REVIEW_DECISION_ACCEPTED,
    REVIEW_DECISION_REJECTED
} = require('../../../constants/review-decision');
const {
    getPhraseCriterionCodes
} = require('../../../constants/review-criterion');

const PHRASE_CODES = getPhraseCriterionCodes();
const { ENTRY_DISPUTED, ENTRY_ANNOTATED } = require('../../../constants/entry-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = (/** @type {import("node:net").AddressInfo} */ (server.address()));
            server.close(err => err ? reject(err) : resolve(port));
        });
        server.on('error', reject);
    });
}

function buildInMemoryRepo(/** @type {any[]} */ initialEntries = []) {
    const reviews = new Map();
    const decisionsByReview = new Map();
    const commentsByReview = new Map();
    const entries = new Map(initialEntries.map(e => [e.id, { ...e }]));
    let nextReviewId = 1;

    return {
        async expireStaleReviews(/** @type {*} */ cutoff) {
            let count = 0;
            for (const r of reviews.values()) {
                if ((r.status === REVIEW_PENDING || r.status === REVIEW_IN_PROGRESS) && r.expiresAt < cutoff) {
                    r.status = REVIEW_EXPIRED;
                    count++;
                }
            }
            return { count };
        },
        async findActiveReviewByReviewer(/** @type {*} */ { reviewerId }) {
            for (const r of reviews.values())
                if (r.reviewerId === reviewerId && (r.status === REVIEW_PENDING || r.status === REVIEW_IN_PROGRESS))
                    return { ...r };
            return null;
        },
        async findReviewById(/** @type {*} */ reviewId) {
            return reviews.has(reviewId) ? { ...reviews.get(reviewId) } : null;
        },
        async findReviewableEntries(/** @type {*} */ { reviewerId, limit = 1 }) {
            /** @type {any[]} */
            const result = [];
            for (const e of entries.values()) {
                if (e.status !== ENTRY_ANNOTATED) continue;
                const ownAnnotation = (e.annotations || []).some((/** @type {*} */ a) => a.userId === reviewerId);
                if (ownAnnotation) continue;
                const blocked = [...reviews.values()].some(r =>
                    r.entryId === e.id &&
                    [REVIEW_PENDING, REVIEW_IN_PROGRESS, REVIEW_COMPLETED, REVIEW_DISPUTED].includes(r.status)
                );
                if (blocked) continue;
                result.push({ ...e });
                if (result.length >= limit) break;
            }
            return result;
        },
        async createReview(/** @type {*} */ { entryId, reviewerId, annotatorId, expiresAt }) {
            const id = nextReviewId++;
            const r = {
                id, entryId, reviewerId, annotatorId,
                status: REVIEW_PENDING, currentCriterionIndex: 0,
                expiresAt, assignedAt: new Date(), completedAt: null
            };
            reviews.set(id, r);
            return { ...r };
        },
        async updateReviewStatus(/** @type {*} */ { reviewId, status, completedAt = null }) {
            const r = reviews.get(reviewId);
            r.status = status;
            if (completedAt !== null) r.completedAt = completedAt;
            return { ...r };
        },
        async updateReviewProgress(/** @type {*} */ { reviewId, currentCriterionIndex, status }) {
            const r = reviews.get(reviewId);
            r.currentCriterionIndex = currentCriterionIndex;
            if (status) r.status = status;
            return { ...r };
        },
        async upsertDecision(/** @type {*} */ { reviewId, sentenceIndex = null, criterionCode, decision, comment = null }) {
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
        async findDecisionsByReview(/** @type {*} */ { reviewId }) {
            return (decisionsByReview.get(reviewId) || []).map((/** @type {*} */ d) => ({ ...d }));
        },
        async findAnnotatedSentenceIndexes(/** @type {*} */ { entryId, annotatorId }) {
            const e = entries.get(entryId);
            if (!e) return [];
            return (e.annotations || [])
                .filter((/** @type {*} */ a) => a.userId === annotatorId)
                .map((/** @type {*} */ a) => a.sentenceIndex)
                .sort((/** @type {*} */ a, /** @type {*} */ b) => a - b);
        },
        async createComment(/** @type {*} */ payload) {
            const list = commentsByReview.get(payload.reviewId) || [];
            list.push({ ...payload, id: list.length + 1, createdAt: new Date() });
            commentsByReview.set(payload.reviewId, list);
            return list[list.length - 1];
        },
        async findCommentsByReview(/** @type {*} */ { reviewId }) {
            return (commentsByReview.get(reviewId) || []).map((/** @type {*} */ c) => ({ ...c }));
        },
        async findCompletedReviewsForAnnotator(/** @type {*} */ { annotatorId, datasetId = null, limit = 50 }) {
            /** @type {any[]} */
            const result = [];
            for (const r of reviews.values()) {
                if (r.annotatorId !== annotatorId) continue;
                if (![REVIEW_COMPLETED, REVIEW_DISPUTED].includes(r.status)) continue;
                const entry = entries.get(r.entryId);
                if (datasetId && (!entry || entry.datasetId !== datasetId)) continue;
                result.push(/** @type {*} */ {
                    ...r,
                    entry: entry ? { entryId: entry.id, datasetId: entry.datasetId, eid: entry.eid } : null,
                    decisions: decisionsByReview.get(r.id) || [],
                    comments: commentsByReview.get(r.id) || []
                });
                if (result.length >= limit) break;
            }
            return result;
        },
        // Test-only helpers
        _entries: entries,
        _reviews: reviews,
        _setReviewExpired(/** @type {*} */ reviewId) {
            const r = reviews.get(reviewId);
            if (r) r.expiresAt = new Date(Date.now() - 60_000);
        }
    };
}

function buildPrismaStub(/** @type {*} */ repo) {
    return {
        async $transaction(/** @type {*} */ fn) {
            return fn(/** @type {*} */ {
                review: {
                    async update(/** @type {*} */ { where, data }) {
                        const r = repo._reviews.get(where.id);
                        Object.assign(r, data);
                        return { ...r };
                    }
                },
                entry: {
                    async update(/** @type {*} */ { where, data }) {
                        const e = repo._entries.get(where.id);
                        Object.assign(e, data);
                        return { ...e };
                    }
                }
            });
        },
        entry: {
            async findUnique(/** @type {*} */ { where }) {
                const e = repo._entries.get(where.id);
                if (!e) return null;
                return {
                    ...e,
                    triplesets: e.triplesets || [],
                    lexes: e.lexes || [],
                    annotations: (e.annotations || []).filter(() => true),
                    alertDecisions: e.alertDecisions || []
                };
            }
        }
    };
}

function makeAgent(/** @type {*} */ baseUrl, /** @type {*} */ user) {
    const headerUser = JSON.stringify(user);
    return {
        async raw(/** @type {*} */ method, /** @type {*} */ path, body = undefined) {
            /** @type {Record<string, string>} */
            const headers = { Accept: 'application/json', 'X-Test-User': headerUser };
            if (body !== undefined) headers['content-type'] = 'application/json';
            const res = await fetch(`${baseUrl}${path}`, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                redirect: 'manual'
            });
            const text = await res.text();
            /** @type {any} */
            let data;
            try { data = text ? JSON.parse(text) : null; } catch { data = text; }
            return { status: res.status, data };
        },
        async get(/** @type {*} */ path) { return this.raw('GET', path); },
        async post(/** @type {*} */ path, /** @type {*} */ body = undefined) { return this.raw('POST', path, body || {}); }
    };
}

describe('reviews workflow integration (T4.7)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    /** @type {any} */

    let httpServer = null;
    let baseUrl = '';
    /** @type {any} */
    let repo = null;
    /** @type {any} */
    let users = null;

    before(async () => {
        users = {
            annotator: { id: 100, email: 'annot@test', isModerator: false },
            reviewer1: { id: 200, email: 'r1@test', isModerator: true },
            reviewer2: { id: 201, email: 'r2@test', isModerator: true }
        };

        repo = buildInMemoryRepo([
            {
                id: 1, datasetId: 9, eid: 1, position: 0, status: ENTRY_ANNOTATED,
                triplesets: [{ type: 'original', triples: [{ subject: 'A', predicate: 'p', object: 'B' }] }],
                lexes: [{ lang: 'en', text: 'reference one' }],
                annotations: [{ userId: users.annotator.id, sentenceIndex: 0, sentence: 'frase 1', origin: 'manual' }],
                alertDecisions: []
            },
            {
                id: 2, datasetId: 9, eid: 2, position: 1, status: ENTRY_ANNOTATED,
                triplesets: [{ type: 'original', triples: [{ subject: 'C', predicate: 'p', object: 'D' }] }],
                lexes: [{ lang: 'en', text: 'reference two' }],
                annotations: [{ userId: users.annotator.id, sentenceIndex: 0, sentence: 'frase 2', origin: 'manual' }],
                alertDecisions: []
            }
        ]);

        const reviewsService = createReviewsService({
            reviewsRepository: repo,
            prismaClient: buildPrismaStub(repo),
            reviewDurationMs: 60_000
        });
        const reviewsController = createReviewsController({ reviewsService });

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port}`;

        const app = createApp({
            controllers: { reviewsController },
            sessionMiddleware(/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) {
                const header = request.headers['x-test-user'];
                if (header) {
                    try {
                        request.session = { user: JSON.parse(header) };
                    } catch {
                        request.session = {};
                    }
                } else {
                    request.session = {};
                }
                next();
            }
        });

        await new Promise((resolve, reject) => {
            httpServer = app.listen(port, '127.0.0.1', err => err ? reject(err) : resolve(undefined));
        });
    });

    after(async () => {
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));
    });

    it('Escenario 1 — reviewer pide siguiente y recibe entry anotada', async () => {
        const agent = makeAgent(baseUrl, users.reviewer1);

        const res = await agent.post('/api/reviews/request');
        assert.equal(res.status, 200);
        assert.equal(res.data.status, REVIEW_PENDING);
        assert.ok(res.data.reviewId > 0);
        assert.equal(res.data.annotatorId, users.annotator.id);
    });

    it('Escenario 2 — wizard secuencial bloquea saltos y exige comentario', async () => {
        const agent = makeAgent(baseUrl, users.reviewer1);

        const requestRes = await agent.post('/api/reviews/request');
        const reviewId = requestRes.data.reviewId;

        // Skipping the 2nd criterion of phrase #0 before the 1st is decided.
        const skip = await agent.post(`/api/reviews/${reviewId}/decisions`, {
            sentenceIndex: 0,
            criterionCode: PHRASE_CODES[1],
            decision: REVIEW_DECISION_ACCEPTED
        });
        assert.equal(skip.status, 409);
        assert.equal(skip.data.code, 'criterion_locked');

        const ok1 = await agent.post(`/api/reviews/${reviewId}/decisions`, {
            sentenceIndex: 0,
            criterionCode: PHRASE_CODES[0],
            decision: REVIEW_DECISION_ACCEPTED
        });
        assert.equal(ok1.status, 200);
        assert.equal(ok1.data.status, REVIEW_IN_PROGRESS);

        const noComment = await agent.post(`/api/reviews/${reviewId}/decisions`, {
            sentenceIndex: 0,
            criterionCode: PHRASE_CODES[1],
            decision: REVIEW_DECISION_REJECTED
        });
        assert.equal(noComment.status, 400);
        assert.equal(noComment.data.code, 'comment_required');

        const withComment = await agent.post(`/api/reviews/${reviewId}/decisions`, {
            sentenceIndex: 0,
            criterionCode: PHRASE_CODES[1],
            decision: REVIEW_DECISION_REJECTED,
            comment: 'falta entidad'
        });
        assert.equal(withComment.status, 200);
        assert.equal(withComment.data.status, REVIEW_IN_PROGRESS);
    });

    it('Escenario 3 — correccion de texto: comentario opcional, texto obligatorio', async () => {
        const agent = makeAgent(baseUrl, users.reviewer1);

        const requestRes = await agent.post('/api/reviews/request');
        const reviewId = requestRes.data.reviewId;

        // The justification lives in the rejected criterion's "Motivo": a
        // correction without its own comment is now accepted.
        const withoutComment = await agent.post(`/api/reviews/${reviewId}/corrections`, {
            sentenceIndex: 0,
            correctedSentence: 'frase corregida'
        });
        assert.equal(withoutComment.status, 200);
        assert.equal(withoutComment.data.comments.length, 1);

        const emptyCorrection = await agent.post(`/api/reviews/${reviewId}/corrections`, {
            sentenceIndex: 0,
            correctedSentence: '   '
        });
        assert.equal(emptyCorrection.status, 400);
        assert.equal(emptyCorrection.data.code, 'invalid_correction');
    });

    it('Escenario 4 — finalizacion clasifica entry como disputed cuando hay rechazo', async () => {
        const agent = makeAgent(baseUrl, users.reviewer1);

        const requestRes = await agent.post('/api/reviews/request');
        const reviewId = requestRes.data.reviewId;
        const entryId = requestRes.data.entryId;

        // Single annotated phrase (#0): decide its five criteria, one rejected.
        for (let i = 0; i < PHRASE_CODES.length; i++) {
            const decision = i === 1 ? REVIEW_DECISION_REJECTED : REVIEW_DECISION_ACCEPTED;
            /** @type {Record<string, any>} */
            const body = { sentenceIndex: 0, criterionCode: PHRASE_CODES[i], decision };
            if (decision === REVIEW_DECISION_REJECTED) body.comment = 'rev';
            const res = await agent.post(`/api/reviews/${reviewId}/decisions`, body);
            assert.equal(res.status, 200, `criterio ${PHRASE_CODES[i]} ${decision}`);
        }

        const finalize = await agent.post(`/api/reviews/${reviewId}/finalize`);
        assert.equal(finalize.status, 200);
        assert.equal(finalize.data.status, REVIEW_DISPUTED);
        assert.equal(repo._entries.get(entryId).status, ENTRY_DISPUTED);
    });

    it('Escenario 5 — annotator consulta feedback con criterios fallidos y correcciones', async () => {
        const agent = makeAgent(baseUrl, users.annotator);

        const res = await agent.get('/api/reviews/feedback?datasetId=9');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.data.feedback));
        assert.ok(res.data.feedback.length >= 1);
        const item = res.data.feedback[0];
        assert.ok(['completed', 'disputed'].includes(item.status));
        assert.ok(Array.isArray(item.failedCriteria));
        assert.ok(Array.isArray(item.corrections));
    });

    it('Escenario 6 — exclusividad y expiracion entre dos reviewers', async () => {
        const agent2 = makeAgent(baseUrl, users.reviewer2);
        const r2Initial = await agent2.post('/api/reviews/request');
        assert.equal(r2Initial.status, 200);
        const idReviewR2 = r2Initial.data.reviewId;
        const idEntryR2 = r2Initial.data.entryId;
        assert.equal(idEntryR2, 2);

        const agent1 = makeAgent(baseUrl, users.reviewer1);
        const r1Second = await agent1.post('/api/reviews/request');
        assert.equal(r1Second.status, 404);
        assert.equal(r1Second.data.code, 'no_review_available');

        repo._setReviewExpired(idReviewR2);
        const r1Retry = await agent1.post('/api/reviews/request');
        assert.equal(r1Retry.status, 200);
        assert.equal(r1Retry.data.entryId, 2);
    });
});
