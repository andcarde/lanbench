'use strict';

/**
 * Integration coverage for the statistics endpoint backing the admin panel's
 * Anotación / Revisión tabs (P2). Drives `GET /api/datasets/:id/statistics`
 * through the real Express app with a faked session and an injected datasets
 * controller wired to the real statistics service over in-memory repositories
 * (no DB required).
 *
 * The contract the frontend relies on: the response always carries a `review`
 * array (empty allowed) for a review-enabled dataset, so the Revisión pane has
 * data to bind and can render its "Sin datos todavía." empty state.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createDatasetsController } = require('../../../controllers/datasets-controller');
const { createDatasetsStatisticsService } = require('../../../services/datasets-statistics-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Allocates a free TCP port.
 * @returns {Promise<number>}
 */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = /** @type {import('node:net').AddressInfo} */ (server.address());
            server.close(error => (error ? reject(error) : resolve(address.port)));
        });
        server.on('error', reject);
    });
}

/**
 * Builds the real app with a faked session and an injected datasets controller
 * whose statistics service runs over an in-memory dataset graph.
 * @param {{ isReviewEnabled?:boolean, datasetGraph:any }} options
 * @returns {import('express').Application}
 */
function buildApp({ isReviewEnabled = true, datasetGraph }) {
    const statisticsService = createDatasetsStatisticsService({
        datasetsRepository: {
            async findAccessibleById() { return { id: datasetGraph.id, isReviewEnabled }; }
        },
        datasetsStatisticsRepository: {
            async findDatasetStatisticsGraph() { return datasetGraph; }
        }
    });

    return createApp({
        sessionMiddleware: (request, _response, next) => { request.session = { user: { id: 7, email: 'admin@example.com' } }; next(); },
        controllers: {
            datasetsController: createDatasetsController({ datasetsStatisticsService: statisticsService })
        }
    });
}

/**
 * Starts the app, runs `requestFn(baseUrl)`, then closes the server.
 * @param {import('express').Application} app
 * @param {(baseUrl:string)=>Promise<any>} requestFn
 * @returns {Promise<any>}
 */
async function withServer(app, requestFn) {
    const port = await getFreePort();
    const server = app.listen(port, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        return await requestFn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

describe('dataset statistics endpoint — review bucket (P2 integration)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('returns an empty review array for a review-enabled dataset with no reviews', async () => {
        const datasetGraph = {
            id: 5,
            name: 'Dataset 5',
            totalEntries: 2,
            sectionAssignments: [{ userId: 10, timeSpentSeconds: 30 }],
            entries: [
                { id: 1, annotations: [{ userId: 10, user: { email: 'a@x.com' }, isAcceptedFirstTry: true }], reviews: [] },
                { id: 2, annotations: [{ userId: 10, user: { email: 'a@x.com' }, isAcceptedFirstTry: true }], reviews: [] }
            ]
        };

        await withServer(buildApp({ isReviewEnabled: true, datasetGraph }), async (baseUrl) => {
            const response = await fetch(`${baseUrl}/api/datasets/5/statistics`);
            assert.equal(response.status, 200);
            const stats = await response.json();
            assert.ok(Array.isArray(stats.review), 'review must always be an array');
            assert.equal(stats.review.length, 0, 'no terminal reviews → empty review bucket');
            assert.equal(stats.annotation.length, 1, 'the annotation bucket still reports the annotator');
            assert.equal(stats.dataset.datasetId, 5);
        });
    });

    it('returns review rows when terminal reviews exist', async () => {
        const datasetGraph = {
            id: 6,
            name: 'Dataset 6',
            totalEntries: 1,
            sectionAssignments: [],
            entries: [
                {
                    id: 1,
                    annotations: [{ userId: 10, user: { email: 'a@x.com' }, isAcceptedFirstTry: true }],
                    reviews: [
                        { reviewerId: 20, reviewer: { email: 'r@x.com' }, status: 'completed', timeSpentSeconds: 40, comments: [] }
                    ]
                }
            ]
        };

        await withServer(buildApp({ isReviewEnabled: true, datasetGraph }), async (baseUrl) => {
            const response = await fetch(`${baseUrl}/api/datasets/6/statistics`);
            assert.equal(response.status, 200);
            const stats = await response.json();
            assert.equal(stats.review.length, 1);
            assert.equal(stats.review[0].email, 'r@x.com');
        });
    });
});
