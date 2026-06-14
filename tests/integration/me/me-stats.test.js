'use strict';

/**
 * Integration test for `GET /api/me/stats` (US-14, personal statistics).
 *
 * Boots the real app (router → me-controller → me-statistics-service) with an
 * in-memory statistics repository, so the full HTTP contract and the
 * session-derived identity rule are exercised without MySQL. The user is always
 * taken from the session (`X-Test-User` header); there is no way to request
 * another user's stats, which this test pins.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createMeController } = require('../../../controllers/me-controller');
const { createMeStatisticsService } = require('../../../services/me-statistics-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

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

/**
 * Per-user statistics fixtures keyed by userId, mirroring the repository shapes.
 */
/** @type {Record<number, any>} */
const STATS_BY_USER = {
    7: {
        annotatedEntries: [{ datasetId: 1, entryId: 10 }, { datasetId: 1, entryId: 11 }],
        assignmentTimes: [{ datasetId: 1, timeSpentSeconds: 100 }, { datasetId: 1, timeSpentSeconds: 50 }],
        reviews: [{ datasetId: 2, timeSpentSeconds: 200 }],
        datasetNames: [{ id: 1, name: 'Bravo' }, { id: 2, name: 'Alfa' }]
    },
    8: {
        annotatedEntries: [],
        assignmentTimes: [],
        reviews: [],
        datasetNames: []
    }
};

/**
 * In-memory statistics repository serving fixtures for the requested user.
 * @param {number} expectedUserId - User whose fixtures must be served.
 */
function buildStatsRepository(expectedUserId) {
    const data = STATS_BY_USER[expectedUserId] || STATS_BY_USER[8];
    return {
        async findAnnotatedEntries() { return data.annotatedEntries; },
        async findSectionAssignmentTimes() { return data.assignmentTimes; },
        async findTerminalReviews() { return data.reviews; },
        async findDatasetsByIds() { return data.datasetNames; }
    };
}

describe('me stats integration (US-14)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(60000);

    /** @type {any} */
    let httpServer = null;
    let baseUrl = '';

    before(async () => {
        // The session middleware selects fixtures by the header user's id, so
        // each request is answered for exactly that user — never another.
        const app = createApp({
            sessionMiddleware(/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) {
                const header = request.headers['x-test-user'];
                request.session = header ? { user: JSON.parse(String(header)) } : {};
                next();
            },
            controllers: {
                meController: {
                    getMyStats(/** @type {*} */ request, /** @type {*} */ response) {
                        // Rebuild the controller per-request with the fixtures of
                        // the session user, then delegate to it.
                        const userId = request.session?.user?.id;
                        const real = createMeController({
                            meStatisticsService: createMeStatisticsService({
                                meStatisticsRepository: buildStatsRepository(userId)
                            })
                        });
                        return real.getMyStats(request, response);
                    }
                }
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

    /**
     * Performs a GET as the given user.
     * @param {*} user - Session user payload (or null for no session).
     */
    async function getStats(user) {
        /** @type {Record<string, string>} */
        const headers = { Accept: 'application/json' };
        if (user) headers['X-Test-User'] = JSON.stringify(user);
        const res = await fetch(`${baseUrl}/api/me/stats`, { headers });
        const text = await res.text();
        let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { status: res.status, data };
    }

    it('rejects an unauthenticated request with 401', async () => {
        const res = await getStats(null);
        assert.equal(res.status, 401);
    });

    it('returns the session user\'s aggregated totals and per-dataset breakdown', async () => {
        const res = await getStats({ id: 7, email: 'seven@test', isModerator: false });
        assert.equal(res.status, 200);
        assert.equal(res.data.user.id, 7);
        assert.equal(res.data.user.email, 'seven@test');
        assert.equal(res.data.totals.annotations, 2);
        assert.equal(res.data.totals.reviews, 1);
        assert.equal(res.data.totals.datasetsAnnotated, 1);
        assert.equal(res.data.totals.datasetsReviewed, 1);
        assert.equal(res.data.totals.avgAnnotationSeconds, 75);
        assert.equal(res.data.totals.avgReviewSeconds, 200);
        // Only datasets with activity appear, sorted by name.
        assert.deepEqual(res.data.datasets.map((/** @type {*} */ d) => d.datasetName), ['Alfa', 'Bravo']);
    });

    it('returns empty totals for a user with no activity', async () => {
        const res = await getStats({ id: 8, email: 'eight@test', isModerator: false });
        assert.equal(res.status, 200);
        assert.equal(res.data.user.id, 8);
        assert.equal(res.data.totals.annotations, 0);
        assert.equal(res.data.totals.reviews, 0);
        assert.deepEqual(res.data.datasets, []);
    });
});
