'use strict';

/**
 * Unit coverage for the dataset custom-providers router (US-36).
 *
 * Mounts the real router + controller + service over in-memory fakes and
 * drives the HTTP surface through fetch.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createDatasetsApiRouter } = require('../../../routes/datasets-api');
const { createDatasetCustomProvidersController } = require('../../../controllers/dataset-custom-providers-controller');
const { createDatasetCustomProvidersService } = require('../../../services/dataset-custom-providers-service');

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
 * Builds an in-memory custom-providers repository.
 * @param {Array<{ datasetId:number, name:string, urlBase:string }>} [rows]
 * @returns {Record<string, any>}
 */
function buildRepo(rows = []) {
    return {
        async listByDataset(datasetId) { return rows.filter(row => row.datasetId === datasetId); },
        async findByName({ datasetId, name }) { return rows.find(row => row.datasetId === datasetId && row.name === name) || null; },
        async create(payload) { const row = { ...payload, createdAt: new Date() }; rows.push(row); return row; },
        async deleteByName({ datasetId, name }) {
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i -= 1)
                if (rows[i].datasetId === datasetId && rows[i].name === name) rows.splice(i, 1);
            return { count: before - rows.length, credentialsRemoved: 0 };
        }
    };
}

/**
 * Builds an Express app mounting the real router/controller/service over fakes.
 * @param {{ sessionUser?:any, isAdmin?:boolean, rows?:any[] }} [options]
 * @returns {import('express').Express}
 */
function buildApp({ sessionUser = { id: 7, email: 'admin@example.com' }, isAdmin = true, rows = [] } = {}) {
    const permissionsRepo = {
        async findPermitForUser() { return { isAdmin, isOwned: false, dataset: { id: 1, name: 'D', llmMode: 'generation' } }; }
    };
    const service = createDatasetCustomProvidersService({
        datasetsPermissionsRepository: permissionsRepo,
        customProvidersRepository: buildRepo(rows)
    });
    const controller = createDatasetCustomProvidersController({ datasetCustomProvidersService: service });

    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => { request.session = sessionUser ? { user: sessionUser } : {}; next(); });
    app.use('/api/datasets', createDatasetsApiRouter({
        datasetsController: new Proxy({}, { get: () => (/** @type {*} */ _req, /** @type {*} */ res) => res.status(200).json({}) }),
        datasetCustomProvidersController: controller
    }));
    return app;
}

/**
 * Starts the app, runs `requestFn`, then closes the server.
 * @param {import('express').Express} app
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
 * Performs a JSON request and returns `{ status, body }`.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ status:number, body:any }>}
 */
async function jsonRequest(url, init = {}) {
    const response = await fetch(url, init);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe('dataset custom-providers router (US-36)', () => {
    it('GET lists nothing on a fresh dataset', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`);
            assert.equal(status, 200);
            assert.deepEqual(body, []);
        });
    });

    it('POST creates a provider (201), GET lists it', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const create = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'gateway', urlBase: 'https://gateway.example.com/v1' })
            });
            assert.equal(create.status, 201);
            assert.equal(create.body.name, 'gateway');
            assert.equal(create.body.urlBase, 'https://gateway.example.com/v1');

            const list = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`);
            assert.equal(list.status, 200);
            assert.equal(list.body.length, 1);
            assert.equal(list.body[0].name, 'gateway');
        });
    });

    it('POST rejects a name colliding with a built-in provider with 409', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'groq', urlBase: 'https://x' })
            });
            assert.equal(status, 409);
            assert.equal(body.code, 'provider_already_exists');
        });
    });

    it('POST rejects a duplicate custom name with 409', async () => {
        const rows = [{ datasetId: 1, name: 'gateway', urlBase: 'https://a.b' }];
        await withServer(buildApp({ rows }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'gateway', urlBase: 'https://other.example.com' })
            });
            assert.equal(status, 409);
            assert.equal(body.code, 'provider_already_exists');
        });
    });

    it('POST rejects invalid payloads with 400', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            for (const payload of [
                { name: 'has space', urlBase: 'https://x' },
                { name: 'gateway', urlBase: 'ftp://x' },
                { name: '', urlBase: 'https://x' },
                { name: 'gateway' }
            ]) {
                const { status } = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                assert.equal(status, 400, `expected 400 for ${JSON.stringify(payload)}`);
            }
        });
    });

    it('DELETE removes a custom provider; 404 when it does not exist', async () => {
        const rows = [{ datasetId: 1, name: 'gateway', urlBase: 'https://a.b' }];
        await withServer(buildApp({ rows }), async (baseUrl) => {
            const removed = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/gateway`, { method: 'DELETE' });
            assert.equal(removed.status, 200);
            assert.equal(removed.body.removed, true);

            const second = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/gateway`, { method: 'DELETE' });
            assert.equal(second.status, 404);
        });
    });

    it('DELETE refuses to remove a built-in provider with 400', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status } = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/groq`, { method: 'DELETE' });
            assert.equal(status, 400);
        });
    });

    it('non-admin gets 403 on every action', async () => {
        await withServer(buildApp({ isAdmin: false }), async (baseUrl) => {
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`)).status, 403);
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'x', urlBase: 'https://a.b' })
            })).status, 403);
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/x`, { method: 'DELETE' })).status, 403);
        });
    });

    it('no session returns 401', async () => {
        await withServer(buildApp({ sessionUser: null }), async (baseUrl) => {
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`)).status, 401);
        });
    });
});
