'use strict';

/**
 * Integration coverage for the "Nuevo dataset" creation rules (P6). Drives
 * `POST /api/datasets` (multipart) through the real Express app with a faked
 * moderator session and an injected datasets controller wired to the real
 * service over in-memory fakes (no DB, no real XML parsing).
 *
 * Each illegal option combination must be NORMALISED (never rejected): the
 * persisted dataset, reflected back in the response DTO, always satisfies the
 * invariants (review-off ⇒ no additional reviews; correction ⇒ review +
 * additional forced on).
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
 * Builds the real app with a faked moderator session and an injected datasets
 * controller whose service uses in-memory fakes (no DB / no XML reading).
 * @returns {import('express').Application}
 */
function buildApp() {
    const datasetsService = createDatasetsService(/** @type {any} */ ({
        readDataset() { return { entries: [{ eid: 1 }] }; },
        readFileAsBuffer() { return Buffer.from('<benchmark />'); },
        parseDatasetImport() { return { entries: [] }; },
        datasetsRepository: {
            async createOwnedDataset(/** @type {*} */ payload) {
                return { id: 1, ...payload.datasetData, colorClass: 'dataset-purple' };
            }
        }
    }));

    return createApp({
        sessionMiddleware: (request, _response, next) => {
            request.session = { user: { id: 7, email: 'mod@example.com', isModerator: true } };
            next();
        },
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

/**
 * POSTs a dataset-creation multipart request and returns the parsed options.
 * @param {string} baseUrl
 * @param {Record<string,string>} fields
 * @returns {Promise<{ status:number, options:any }>}
 */
async function createDataset(baseUrl, fields) {
    const formData = new FormData();
    formData.append('xmlFile', new Blob(['<benchmark/>'], { type: 'application/xml' }), 'd.xml');
    for (const [key, value] of Object.entries(fields))
        formData.append(key, value);

    const response = await fetch(`${baseUrl}/api/datasets`, { method: 'POST', body: formData });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { status: response.status, options: body && body.dataset ? body.dataset.options : null };
}

describe('dataset creation rules (P6 integration)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('correction ⇒ review + additional forced true, never rejected', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, options } = await createDataset(baseUrl, {
                llmMode: 'correction', isReviewEnabled: 'false', hasAdditionalReviews: 'false'
            });
            assert.equal(status, 201, 'illegal combos are normalised, not rejected');
            assert.deepEqual(options, { llmMode: 'correction', isReviewEnabled: true, hasAdditionalReviews: true });
        });
    });

    it('review disabled ⇒ additional reviews forced false', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, options } = await createDataset(baseUrl, {
                llmMode: 'none', isReviewEnabled: 'false', hasAdditionalReviews: 'true'
            });
            assert.equal(status, 201);
            assert.deepEqual(options, { llmMode: 'none', isReviewEnabled: false, hasAdditionalReviews: false });
        });
    });

    it('generation + review on keeps the requested additional flag', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, options } = await createDataset(baseUrl, {
                llmMode: 'generation', isReviewEnabled: 'true', hasAdditionalReviews: 'true'
            });
            assert.equal(status, 201);
            assert.deepEqual(options, { llmMode: 'generation', isReviewEnabled: true, hasAdditionalReviews: true });
        });
    });
});
