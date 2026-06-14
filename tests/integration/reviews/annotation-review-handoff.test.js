'use strict';

/**
 * Integration test for the annotation → review handoff.
 *
 * Regression guard for the defect where the review workflow was unreachable:
 * no production code path ever set `Entry.status = 'annotated'`, so the review
 * queue (`reviews-repository.findReviewableEntries`, which filters
 * `status = 'annotated'`) always returned an empty set and
 * `POST /api/reviews/request` always answered `404 no_review_available`.
 *
 * Unlike `reviews-workflow.test.js`, which seeds entries already at
 * `status='annotated'`, this test drives the REAL annotation chain over HTTP
 * (`POST /api/annotations/send` → annotations-service → spanish-service →
 * annotations-repository) and then the REAL review chain
 * (`POST /api/reviews/request` → reviews-service → reviews-repository), sharing
 * one in-memory Prisma stub between them. It therefore exercises exactly the
 * transition that used to be missing.
 *
 * It also checks Fix B: an annotated entry that belongs to a dataset whose
 * admin left review disabled (`isReviewEnabled = false`) is never surfaced.
 *
 * No MySQL is needed: only the persistence layer is stubbed; routers,
 * controllers and services run unmocked. Sessions are injected through the
 * `X-Test-User` header (same pattern as the other in-memory integration tests).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createAnnotationsController } = require('../../../controllers/annotations-controller');
const { createReviewsController } = require('../../../controllers/reviews-controller');
const { createAnnotationsService } = require('../../../services/annotations-service');
const { createReviewsService } = require('../../../services/reviews-service');
const { createSpanishService } = require('../../../domain/spanish/spanish-service');
const { createAnnotationsRepository } = require('../../../repositories/annotations-repository');
const { createReviewsRepository } = require('../../../repositories/reviews-repository');
const { ENTRY_ANNOTATED, ENTRY_PENDING } = require('../../../constants/entry-status');
const { REVIEW_PENDING } = require('../../../constants/review-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

/**
 * Minimal in-memory Prisma double covering exactly the query shapes used by
 * `annotations-repository.replaceForAccessibleEntry` and the review-queue
 * methods of `reviews-repository`. Not a general Prisma emulator.
 *
 * @param {{ datasets:any[], entries:any[], permits:any[] }} seed
 */
function buildPrismaStub({ datasets, entries, permits }) {
    const datasetsMap = new Map(datasets.map(d => [d.id, { ...d }]));
    const entryList = entries.map(e => ({ ...e }));
    const permitList = permits.map(p => ({ ...p }));
    /** @type {any[]} */
    const annotations = [];
    /** @type {any[]} */
    const reviews = [];
    let nextReviewId = 1;
    let annSeq = 0;

    const prisma = {
        async $transaction(/** @type {*} */ fn) { return fn(prisma); },
        entry: {
            // Used by replaceForAccessibleEntry: resolves an accessible entry.
            async findFirst(/** @type {*} */ { where }) {
                const userId = where.dataset?.permits?.some?.userId;
                const found = entryList.find(e =>
                    e.datasetId === where.datasetId &&
                    e.eid === where.eid &&
                    (userId === undefined || permitList.some(p => p.datasetId === e.datasetId && p.userId === userId)));
                return found ? { id: found.id } : null;
            },
            async findUnique(/** @type {*} */ { where }) {
                const e = entryList.find(x => x.id === where.id);
                return e ? { ...e } : null;
            },
            // Used by the review queue.
            async findMany(/** @type {*} */ { where, take, include }) {
                let result = entryList.filter(e => {
                    if (where.status && e.status !== where.status) return false;
                    if (where.dataset && where.dataset.isReviewEnabled !== undefined) {
                        const d = datasetsMap.get(e.datasetId);
                        if (!d || d.isReviewEnabled !== where.dataset.isReviewEnabled) return false;
                    }
                    if (where.datasetId && where.datasetId.in && !where.datasetId.in.includes(e.datasetId)) return false;
                    if (where.annotations?.none) {
                        const noneUser = where.annotations.none.userId;
                        if (annotations.some(a => a.entryId === e.id && a.userId === noneUser)) return false;
                    }
                    if (where.reviews?.none) {
                        const blocking = where.reviews.none.status.in;
                        if (reviews.some(r => r.entryId === e.id && blocking.includes(r.status))) return false;
                    }
                    return true;
                });
                result.sort((a, b) => a.datasetId - b.datasetId || a.position - b.position);
                if (take) result = result.slice(0, take);
                return result.map(e => {
                    const out = { ...e };
                    if (include?.annotations) {
                        const anns = annotations
                            .filter(a => a.entryId === e.id)
                            .sort((x, y) => x._seq - y._seq);
                        out.annotations = anns.slice(0, include.annotations.take || anns.length).map(a => ({ userId: a.userId }));
                    }
                    return out;
                });
            },
            async update(/** @type {*} */ { where, data }) {
                const e = entryList.find(x => x.id === where.id);
                if (e) Object.assign(e, data);
                return e ? { ...e } : null;
            }
        },
        annotation: {
            async deleteMany(/** @type {*} */ { where }) {
                for (let i = annotations.length - 1; i >= 0; i--) {
                    const a = annotations[i];
                    if (a.entryId === where.entryId && a.datasetId === where.datasetId && a.userId === where.userId)
                        annotations.splice(i, 1);
                }
                return { count: 0 };
            },
            async createMany(/** @type {*} */ { data }) {
                for (const row of data) annotations.push({ ...row, _seq: annSeq++ });
                return { count: data.length };
            }
        },
        review: {
            async updateMany(/** @type {*} */ { where, data }) {
                let count = 0;
                for (const r of reviews) {
                    const statusMatch = where.status?.in ? where.status.in.includes(r.status) : true;
                    const expMatch = where.expiresAt?.lt ? r.expiresAt < where.expiresAt.lt : true;
                    if (statusMatch && expMatch) { Object.assign(r, data); count++; }
                }
                return { count };
            },
            async findFirst(/** @type {*} */ { where }) {
                return reviews.find(r => {
                    if (where.reviewerId !== undefined && r.reviewerId !== where.reviewerId) return false;
                    if (where.status?.in && !where.status.in.includes(r.status)) return false;
                    if (where.entry?.datasetId) {
                        const e = entryList.find(x => x.id === r.entryId);
                        if (!e || e.datasetId !== where.entry.datasetId) return false;
                    }
                    return true;
                }) || null;
            },
            async findUnique(/** @type {*} */ { where }) { return reviews.find(r => r.id === where.id) || null; },
            async create(/** @type {*} */ { data }) {
                const r = { id: nextReviewId++, assignedAt: new Date(), completedAt: null, ...data };
                reviews.push(r);
                return { ...r };
            },
            async update(/** @type {*} */ { where, data }) {
                const r = reviews.find(x => x.id === where.id);
                if (r) Object.assign(r, data);
                return r ? { ...r } : null;
            }
        },
        _entries: entryList,
        _annotations: annotations,
        _reviews: reviews
    };

    return prisma;
}

/**
 * Builds an HTTP agent bound to a fixed test user (injected via header).
 * @param {string} baseUrl - Server base URL.
 * @param {*} user - Session user payload.
 */
function makeAgent(baseUrl, user) {
    const headerUser = JSON.stringify(user);
    return {
        async post(/** @type {*} */ path, /** @type {*} */ body = {}) {
            const res = await fetch(`${baseUrl}${path}`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'content-type': 'application/json', 'X-Test-User': headerUser },
                body: JSON.stringify(body),
                redirect: 'manual'
            });
            const text = await res.text();
            let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
            return { status: res.status, data };
        }
    };
}

/**
 * Returns a free TCP port.
 * @returns {Promise<number>}
 */
function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
            server.close(err => err ? reject(err) : resolve(port));
        });
        server.on('error', reject);
    });
}

describe('annotation → review handoff integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    /** @type {any} */
    let httpServer = null;
    let baseUrl = '';
    /** @type {any} */
    let prisma = null;
    const annotator = { id: 100, email: 'annot@test', isModerator: false };
    const reviewer = { id: 200, email: 'rev@test', isModerator: true };

    before(async () => {
        prisma = buildPrismaStub({
            datasets: [
                { id: 9, isReviewEnabled: true },
                { id: 11, isReviewEnabled: false }
            ],
            entries: [
                { id: 1, datasetId: 9, eid: 1, position: 0, status: ENTRY_PENDING },
                { id: 2, datasetId: 11, eid: 1, position: 0, status: ENTRY_PENDING }
            ],
            permits: [
                { datasetId: 9, userId: annotator.id },
                { datasetId: 11, userId: annotator.id }
            ]
        });

        const annotationsService = createAnnotationsService({
            spanishService: createSpanishService({
                annotationsRepository: createAnnotationsRepository({ prisma })
            })
        });
        const reviewsService = createReviewsService({
            reviewsRepository: createReviewsRepository({ prisma }),
            prismaClient: prisma,
            reviewDurationMs: 60_000
        });

        const app = createApp({
            controllers: {
                annotationsController: createAnnotationsController({ annotationsService, continueDatasetService: /** @type {any} */ (null) }),
                reviewsController: createReviewsController({ reviewsService })
            },
            sessionMiddleware(/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) {
                const header = request.headers['x-test-user'];
                request.session = header ? { user: JSON.parse(String(header)) } : {};
                next();
            }
        });

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port}`;
        await new Promise((resolve, reject) => {
            httpServer = app.listen(port, '127.0.0.1', (/** @type {*} */ err) => err ? reject(err) : resolve(undefined));
        });
    });

    after(async () => {
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));
    });

    it('before annotating, the review queue is empty (404 no_review_available)', async () => {
        const res = await makeAgent(baseUrl, reviewer).post('/api/reviews/request');
        assert.equal(res.status, 404);
        assert.equal(res.data.code, 'no_review_available');
    });

    it('saving an annotation flips the entry to "annotated"', async () => {
        const res = await makeAgent(baseUrl, annotator).post('/api/annotations/send', {
            datasetId: 9,
            entryId: 1,
            sentences: [{ sentence: 'Una frase anotada.', rejectionReason: null }]
        });
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(prisma._entries.find((/** @type {*} */ e) => e.id === 1).status, ENTRY_ANNOTATED);
    });

    it('the reviewer is now served that annotated entry, with the right annotator', async () => {
        const res = await makeAgent(baseUrl, reviewer).post('/api/reviews/request');
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.status, REVIEW_PENDING);
        assert.equal(res.data.entryId, 1);
        assert.equal(res.data.annotatorId, annotator.id);
        assert.ok(res.data.reviewId > 0);
    });

    it('an annotated entry in a review-disabled dataset is never served (Fix B)', async () => {
        // Annotate the entry of dataset 11 (isReviewEnabled = false).
        const saved = await makeAgent(baseUrl, annotator).post('/api/annotations/send', {
            datasetId: 11,
            entryId: 1,
            sentences: [{ sentence: 'Otra frase.', rejectionReason: null }]
        });
        assert.equal(saved.status, 200);
        assert.equal(prisma._entries.find((/** @type {*} */ e) => e.id === 2).status, ENTRY_ANNOTATED);

        // A second, fresh reviewer must not be offered entry 2 (review disabled),
        // and entry 1 is already taken by the first reviewer's pending review.
        const other = { id: 201, email: 'rev2@test', isModerator: true };
        const res = await makeAgent(baseUrl, other).post('/api/reviews/request');
        assert.equal(res.status, 404);
        assert.equal(res.data.code, 'no_review_available');
    });
});

/**
 * P5: completing EVERY entry of a section in a review-enabled dataset must make
 * the whole section reviewable — the reviewer is served each annotated entry.
 */
describe('full-section → review handoff (P5)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    /** @type {any} */
    let httpServer = null;
    let baseUrl = '';
    /** @type {any} */
    let prisma = null;
    const annotator = { id: 300, email: 'sec-annot@test', isModerator: false };
    const reviewer = { id: 400, email: 'sec-rev@test', isModerator: true };
    const SECTION_ENTRY_IDS = [1, 2, 3];

    before(async () => {
        prisma = buildPrismaStub({
            datasets: [{ id: 30, isReviewEnabled: true }],
            entries: SECTION_ENTRY_IDS.map((id, position) => ({ id, datasetId: 30, eid: id, position, status: ENTRY_PENDING })),
            permits: [{ datasetId: 30, userId: annotator.id }]
        });

        const annotationsService = createAnnotationsService({
            spanishService: createSpanishService({ annotationsRepository: createAnnotationsRepository({ prisma }) })
        });
        const reviewsService = createReviewsService({
            reviewsRepository: createReviewsRepository({ prisma }),
            prismaClient: prisma,
            reviewDurationMs: 60_000
        });

        const app = createApp({
            controllers: {
                annotationsController: createAnnotationsController({ annotationsService, continueDatasetService: /** @type {any} */ (null) }),
                reviewsController: createReviewsController({ reviewsService })
            },
            sessionMiddleware(/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) {
                const header = request.headers['x-test-user'];
                request.session = header ? { user: JSON.parse(String(header)) } : {};
                next();
            }
        });

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port}`;
        await new Promise((resolve, reject) => {
            httpServer = app.listen(port, '127.0.0.1', (/** @type {*} */ err) => err ? reject(err) : resolve(undefined));
        });
    });

    after(async () => {
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));
    });

    it('annotating every entry of the section flips them all to "annotated"', async () => {
        for (const entryId of SECTION_ENTRY_IDS) {
            const res = await makeAgent(baseUrl, annotator).post('/api/annotations/send', {
                datasetId: 30,
                entryId,
                sentences: [{ sentence: `Frase anotada ${entryId}.`, rejectionReason: null }]
            });
            assert.equal(res.status, 200, JSON.stringify(res.data));
        }

        for (const entryId of SECTION_ENTRY_IDS)
            assert.equal(prisma._entries.find((/** @type {*} */ e) => e.id === entryId).status, ENTRY_ANNOTATED);
    });

    it('every entry of the completed section is independently reviewable, then the queue drains', async () => {
        // A distinct moderator-reviewer per request, so each holds a pending
        // review on a different entry (a reviewer never reviews their own work,
        // and an entry under a pending review is excluded from the queue).
        const reviewers = [reviewer, { id: 401, email: 'sec-rev2@test', isModerator: true }, { id: 402, email: 'sec-rev3@test', isModerator: true }];
        const servedEntryIds = [];

        for (const currentReviewer of reviewers) {
            const res = await makeAgent(baseUrl, currentReviewer).post('/api/reviews/request');
            assert.equal(res.status, 200, JSON.stringify(res.data));
            assert.equal(res.data.status, REVIEW_PENDING);
            assert.equal(res.data.annotatorId, annotator.id);
            servedEntryIds.push(res.data.entryId);
        }

        assert.deepEqual(servedEntryIds.slice().sort((a, b) => a - b), SECTION_ENTRY_IDS,
            'all three section entries were served to reviewers');

        // Every entry of the section now has a pending review: a fresh reviewer
        // gets no candidate.
        const drained = await makeAgent(baseUrl, { id: 403, email: 'sec-rev4@test', isModerator: true }).post('/api/reviews/request');
        assert.equal(drained.status, 404);
        assert.equal(drained.data.code, 'no_review_available');
    });
});

/**
 * Regression for the reported defect: a user who is BOTH an annotator and a
 * reviewer of the same dataset must be served only the entries OTHER people
 * annotated — never their own — and their own annotated entries must still be
 * reviewable by a different reviewer (USER-STORIES §US-13 self-review rule).
 *
 * Earlier suites only ever used a reviewer who never annotated; this is the
 * first to exercise the "reviewer is also an annotator" overlap that the bug
 * report described (Admin A annotated some sections, then expected to review
 * the section User B annotated).
 */
describe('reviewer who is also an annotator (self-review exclusion)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    /** @type {any} */
    let httpServer = null;
    let baseUrl = '';
    /** @type {any} */
    let prisma = null;
    // `reviewerAnnotator` plays Admin A: annotates entry 1 and is a reviewer.
    const reviewerAnnotator = { id: 300, email: 'a@test', isModerator: true };
    // `otherAnnotator` plays User B: annotates entry 2.
    const otherAnnotator = { id: 100, email: 'b@test', isModerator: false };
    // A second, pure reviewer to prove A's own work is reviewable by someone else.
    const secondReviewer = { id: 301, email: 'rev2@test', isModerator: true };

    before(async () => {
        prisma = buildPrismaStub({
            datasets: [{ id: 60, isReviewEnabled: true }],
            entries: [
                { id: 1, datasetId: 60, eid: 1, position: 0, status: ENTRY_PENDING },
                { id: 2, datasetId: 60, eid: 2, position: 1, status: ENTRY_PENDING }
            ],
            // Both annotators need a permit on the dataset to save annotations.
            permits: [
                { datasetId: 60, userId: reviewerAnnotator.id },
                { datasetId: 60, userId: otherAnnotator.id }
            ]
        });

        const annotationsService = createAnnotationsService({
            spanishService: createSpanishService({ annotationsRepository: createAnnotationsRepository({ prisma }) })
        });
        const reviewsService = createReviewsService({
            reviewsRepository: createReviewsRepository({ prisma }),
            prismaClient: prisma,
            reviewDurationMs: 60_000
        });

        const app = createApp({
            controllers: {
                annotationsController: createAnnotationsController({ annotationsService, continueDatasetService: /** @type {any} */ (null) }),
                reviewsController: createReviewsController({ reviewsService })
            },
            sessionMiddleware(/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) {
                const header = request.headers['x-test-user'];
                request.session = header ? { user: JSON.parse(String(header)) } : {};
                next();
            }
        });

        const port = await freePort();
        baseUrl = `http://127.0.0.1:${port}`;
        await new Promise((resolve, reject) => {
            httpServer = app.listen(port, '127.0.0.1', (/** @type {*} */ err) => err ? reject(err) : resolve(undefined));
        });
    });

    after(async () => {
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));
    });

    it('both users annotate their own entry', async () => {
        const a = await makeAgent(baseUrl, reviewerAnnotator).post('/api/annotations/send', {
            datasetId: 60, entryId: 1, sentences: [{ sentence: 'Frase de A.', rejectionReason: null }]
        });
        assert.equal(a.status, 200, JSON.stringify(a.data));

        const b = await makeAgent(baseUrl, otherAnnotator).post('/api/annotations/send', {
            datasetId: 60, entryId: 2, sentences: [{ sentence: 'Frase de B.', rejectionReason: null }]
        });
        assert.equal(b.status, 200, JSON.stringify(b.data));
        assert.equal(prisma._entries.find((/** @type {*} */ e) => e.id === 1).status, ENTRY_ANNOTATED);
        assert.equal(prisma._entries.find((/** @type {*} */ e) => e.id === 2).status, ENTRY_ANNOTATED);
    });

    it('the reviewer-annotator is served the OTHER person\'s entry, never their own', async () => {
        const res = await makeAgent(baseUrl, reviewerAnnotator).post('/api/reviews/request');
        assert.equal(res.status, 200, JSON.stringify(res.data));
        assert.equal(res.data.entryId, 2, 'must be User B\'s entry, not A\'s own entry 1');
        assert.equal(res.data.annotatorId, otherAnnotator.id);
    });

    it('the reviewer-annotator\'s own entry is still reviewable by a different reviewer', async () => {
        const res = await makeAgent(baseUrl, secondReviewer).post('/api/reviews/request');
        assert.equal(res.status, 200, JSON.stringify(res.data));
        // Entry 2 is now under A's pending review (blocking); entry 1 — annotated
        // by A — is correctly offered to the other reviewer.
        assert.equal(res.data.entryId, 1);
        assert.equal(res.data.annotatorId, reviewerAnnotator.id);
    });
});
