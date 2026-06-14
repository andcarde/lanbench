'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createDatasetsApiRouter } = require('../../../routes/datasets-api');
const { createDatasetLlmCredentialsController } = require('../../../controllers/dataset-llm-credentials-controller');
const { createDatasetLlmCredentialsService } = require('../../../services/dataset-llm-credentials-service');
const { createSecretCrypto } = require('../../../utils/secret-crypto');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const crypto = createSecretCrypto({ secret: 'router-test-secret-1234567890-abcdef' });

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
 * Builds an in-memory credentials repository seeded with `rows`.
 * @param {Array<Record<string, any>>} rows - Seed rows.
 * @param {string} llmMode - Parent dataset llm_mode.
 * @returns {Record<string, any>}
 */
function buildCredentialsRepo(rows, llmMode) {
    return /** @type {CredentialsRepoStub} */ ({
        async upsertByProvider(payload) { const row = { id: rows.length + 1, isActive: false, ...payload }; rows.push(row); return row; },
        async listByDataset() { return rows.map(({ apiKeyCipher: _omit, ...rest }) => rest); },
        async findActiveByDataset() { return rows.find(r => r.isActive) || null; },
        async findByProvider({ provider }) { return rows.find(r => r.provider === provider) || null; },
        async setActive({ provider }) { let c = 0; for (const r of rows) { r.isActive = r.provider === provider; if (r.isActive) c += 1; } return c; },
        async deleteByProvider({ provider }) { const n = rows.length; for (let i = rows.length - 1; i >= 0; i -= 1) { if (rows[i].provider === provider) rows.splice(i, 1); } return { count: n - rows.length }; },
        async findDatasetLlmMode() { return llmMode; }
    });
}

/**
 * Builds an Express app mounting the real credentials router/controller/service
 * over in-memory fakes (no DB).
 * @param {{ sessionUser?:any, isAdmin?:boolean, llmMode?:string, rows?:any[], llmClient?:any }} [options]
 * @returns {import('express').Express}
 */
function buildApp({ sessionUser = { id: 7, email: 'admin@example.com' }, isAdmin = true, llmMode = 'generation', rows = [], llmClient, modelCatalog } = {}) {
    const permissionsRepo = {
        async findPermitForUser() { return { isAdmin, isOwned: false, dataset: { id: 1, name: 'D', llmMode } }; }
    };
    const service = createDatasetLlmCredentialsService({
        datasetsPermissionsRepository: permissionsRepo,
        credentialsRepository: buildCredentialsRepo(rows, llmMode),
        secretCrypto: crypto,
        llmClient: llmClient || { async generateText() { return "I'm m and I am ready to work"; } },
        modelCatalog
    });
    const controller = createDatasetLlmCredentialsController({ datasetLlmCredentialsService: service });

    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => { request.session = sessionUser ? { user: sessionUser } : {}; next(); });
    app.use('/api/datasets', createDatasetsApiRouter({
        datasetsController: new Proxy({}, { get: () => (/** @type {*} */ _req, /** @type {*} */ res) => res.status(200).json({}) }),
        datasetLlmCredentialsController: controller
    }));
    return app;
}

/**
 * Starts the app, runs `requestFn(baseUrl)`, then closes the server.
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

describe('dataset-llm-credentials router (T7)', () => {
    it('POST creates a credential (201) and the response is masked (no clear key)', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'llama-3.3', apiKey: 'gsk_secret_KEY9' })
            });

            assert.equal(status, 201);
            assert.equal(body.provider, 'groq');
            assert.equal(body.keyLast4, 'KEY9');
            assert.equal(JSON.stringify(body).includes('gsk_secret_KEY9'), false);
        });
    });

    it('GET lists masked credentials for an admin (200)', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'm', keyLast4: '1234', apiKeyCipher: crypto.encryptSecret('k'), isActive: true }];
        await withServer(buildApp({ rows }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(status, 200);
            assert.equal(Array.isArray(body), true);
            assert.equal(body[0].keyLast4, '1234');
            assert.equal('apiKeyCipher' in body[0], false);
        });
    });

    it('non-admin gets 403 on list and create', async () => {
        await withServer(buildApp({ isAdmin: false }), async (baseUrl) => {
            const list = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(list.status, 403);

            const create = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'm', apiKey: 'k' })
            });
            assert.equal(create.status, 403);
        });
    });

    it('no session returns 401', async () => {
        await withServer(buildApp({ sessionUser: null }), async (baseUrl) => {
            const { status } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(status, 401);
        });
    });

    it('PATCH activate and DELETE work for an admin', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'm', keyLast4: '1234', apiKeyCipher: crypto.encryptSecret('k'), isActive: false }];
        await withServer(buildApp({ rows }), async (baseUrl) => {
            const activate = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/groq/activate`, { method: 'PATCH' });
            assert.equal(activate.status, 200);
            assert.equal(activate.body.isActive, true);

            const remove = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/groq`, { method: 'DELETE' });
            assert.equal(remove.status, 200);
            assert.equal(remove.body.removed, true);
        });
    });

    it('POST check returns the model message', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'llama', keyLast4: '1234', apiKeyCipher: crypto.encryptSecret('k'), isActive: true }];
        const llmClient = { async generateText() { return "I'm llama and I am ready to work"; } };
        await withServer(buildApp({ rows, llmClient }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/groq/check`, { method: 'POST' });
            assert.equal(status, 200);
            assert.equal(body.ok, true);
            assert.equal(body.message, "I'm llama and I am ready to work");
        });
    });

    it('invalid payload (missing apiKey) returns 400', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const { status } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'm' })
            });
            assert.equal(status, 400);
        });
    });

    it('POST models lists the provider catalog with a typed key (US-35)', async () => {
        const modelCatalog = {
            supportsModelCatalog: (/** @type {*} */ provider) => provider === 'groq',
            async listModels(/** @type {*} */ options) {
                assert.equal(options.apiKey, 'gsk_typed');
                return [{ id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }];
            }
        };
        await withServer(buildApp({ modelCatalog }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/models`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', apiKey: 'gsk_typed' })
            });
            assert.equal(status, 200);
            assert.equal(body.ok, true);
            assert.deepEqual(body.models, [{ id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }]);
            assert.equal(JSON.stringify(body).includes('gsk_typed'), false);
        });
    });

    it('POST models falls back to the stored credential key and surfaces catalog failures as ok:false (US-35)', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'm', keyLast4: 'k234', apiKeyCipher: crypto.encryptSecret('stored-k234'), isActive: true }];
        const modelCatalog = {
            supportsModelCatalog: () => true,
            async listModels(/** @type {*} */ options) {
                assert.equal(options.apiKey, 'stored-k234');
                throw Object.assign(new Error('Groq rechazó la API key.'), { code: 'invalid_key' });
            }
        };
        await withServer(buildApp({ rows, modelCatalog }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/models`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq' })
            });
            assert.equal(status, 200);
            assert.equal(body.ok, false);
            assert.equal(body.code, 'invalid_key');
            assert.equal(JSON.stringify(body).includes('stored-k234'), false);
        });
    });

    it('POST models rejects a provider without catalog (400) and a missing key (400) (US-35)', async () => {
        await withServer(buildApp({ modelCatalog: { supportsModelCatalog: (/** @type {*} */ p) => p === 'groq', async listModels() { return []; } } }), async (baseUrl) => {
            const unsupported = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/models`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'anthropic', apiKey: 'k' })
            });
            assert.equal(unsupported.status, 400);

            const missingKey = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/models`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq' })
            });
            assert.equal(missingKey.status, 400);
        });
    });

    it('with llm_mode = none, GET returns [] and POST is rejected (409)', async () => {
        await withServer(buildApp({ llmMode: 'none' }), async (baseUrl) => {
            const list = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(list.status, 200);
            assert.deepEqual(list.body, []);

            const create = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'm', apiKey: 'k' })
            });
            assert.equal(create.status, 409);
        });
    });
});
