'use strict';

/**
 * Integration coverage for the per-dataset custom providers (US-36).
 *
 * Drives the real Express app with the controller wired to the real service
 * over in-memory fakes (no DB), through HTTP. Covers the full lifecycle
 * (list → create → list → delete) plus duplicate detection against built-in
 * providers and against the existing custom rows.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
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
 * Builds the real app with a faked session and the injected controller.
 * @param {{ sessionUser?:any, isAdmin?:boolean, rows?:any[] }} [options]
 * @returns {import('express').Application}
 */
function buildApp({ sessionUser = { id: 7, email: 'admin@example.com' }, isAdmin = true, rows = [] } = {}) {
    const service = createDatasetCustomProvidersService({
        datasetsPermissionsRepository: { async findPermitForUser() { return { isAdmin, isOwned: false, dataset: { id: 1, name: 'D', llmMode: 'generation' } }; } },
        customProvidersRepository: buildRepo(rows)
    });

    return createApp({
        sessionMiddleware: (request, _response, next) => { request.session = sessionUser ? { user: sessionUser } : {}; next(); },
        controllers: {
            datasetCustomProvidersController: createDatasetCustomProvidersController({ datasetCustomProvidersService: service })
        }
    });
}

/**
 * Runs `requestFn(baseUrl)` against an ephemeral server.
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
 * Performs a JSON request and returns `{ status, body }`.
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function jsonRequest(url, init = {}) {
    const response = await fetch(url, { redirect: 'manual', ...init });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
}

describe('US-36 per-dataset custom providers (integration)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(15000);

    it('full lifecycle: list → create → list → delete → 404', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const empty = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`);
            assert.equal(empty.status, 200);
            assert.deepEqual(empty.body, []);

            const created = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'gateway', urlBase: 'https://gateway.example.com/v1' })
            });
            assert.equal(created.status, 201);
            assert.equal(created.body.name, 'gateway');

            const listed = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`);
            assert.equal(listed.status, 200);
            assert.equal(listed.body.length, 1);

            const removed = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/gateway`, { method: 'DELETE' });
            assert.equal(removed.status, 200);

            const missing = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers/gateway`, { method: 'DELETE' });
            assert.equal(missing.status, 404);
        });
    });

    it('rejects a duplicate name (built-in collision and custom collision) with 409', async () => {
        const rows = [{ datasetId: 1, name: 'gateway', urlBase: 'https://a.b' }];
        await withServer(buildApp({ rows }), async (baseUrl) => {
            const builtin = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'groq', urlBase: 'https://x' })
            });
            assert.equal(builtin.status, 409);
            assert.equal(builtin.body.code, 'provider_already_exists');

            const dup = await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'gateway', urlBase: 'https://other.example.com' })
            });
            assert.equal(dup.status, 409);
            assert.equal(dup.body.code, 'provider_already_exists');
        });
    });

    it('requires authentication and admin role', async () => {
        await withServer(buildApp({ sessionUser: null }), async (baseUrl) => {
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`)).status, 401);
        });
        await withServer(buildApp({ isAdmin: false }), async (baseUrl) => {
            assert.equal((await jsonRequest(`${baseUrl}/api/datasets/1/custom-providers`)).status, 403);
        });
    });
});
