'use strict';

/**
 * Integration coverage for declarative per-dataset section size (P4). Drives
 * `GET /api/datasets/:id/sections/:section` through the real Express app with a
 * faked session and an injected datasets controller wired to the real service
 * over an in-memory dataset graph (no DB required).
 *
 * The full create→persist flow is exercised by the DB-gated madure suite; here
 * we prove the HTTP partitioning contract: a dataset declared with
 * `sectionSize=4` slices its entries into windows of 4.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createDatasetsController } = require('../../../controllers/datasets-controller');
const { createDatasetsService } = require('../../../services/datasets-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
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
 * Builds N minimal persisted-entry rows.
 * @param {number} count
 * @returns {Array<*>}
 */
function buildEntries(count) {
    return Array.from({ length: count }, (_value, index) => ({
        eid: index + 1,
        category: 'City',
        shape: null,
        shapeType: null,
        size: 1,
        triplesets: [{ type: 'original', triples: [{ subject: 'S', predicate: 'p', object: 'O' }] }],
        lexes: [],
        dbpediaLinks: [],
        links: []
    }));
}

/**
 * @param {{ sectionSize:number, entryCount:number }} options
 * @returns {import('express').Application}
 */
function buildApp({ sectionSize, entryCount }) {
    const datasetsService = createDatasetsService(/** @type {any} */ ({
        datasetsRepository: {
            async findAccessibleDatasetGraphById() {
                return { id: 1, name: 'D', sectionSize, entries: buildEntries(entryCount) };
            }
        }
    }));

    return createApp({
        sessionMiddleware: (request, _response, next) => { request.session = { user: { id: 7, email: 'admin@example.com' } }; next(); },
        controllers: { datasetsController: createDatasetsController({ datasetsService }) }
    });
}

/**
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

describe('dataset section size endpoint (P4 integration)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('GET /:id/sections/1 returns sectionSize entries for a dataset declared with sectionSize=4', async () => {
        await withServer(buildApp({ sectionSize: 4, entryCount: 10 }), async (baseUrl) => {
            const first = await (await fetch(`${baseUrl}/api/datasets/1/sections/1`)).json();
            assert.equal(first.sectionSize, 4);
            assert.equal(first.totalSections, 3, 'ceil(10 / 4) = 3');
            assert.equal(first.entries.length, 4);
            assert.equal(first.startEntry, 1);
            assert.equal(first.endEntry, 4);

            const last = await (await fetch(`${baseUrl}/api/datasets/1/sections/3`)).json();
            assert.equal(last.entries.length, 2, 'last section holds the remaining 2 entries');
            assert.equal(last.isLastSection, true);
        });
    });
});
