'use strict';

/**
 * Integration coverage for the per-dataset LLM credentials block (US-31).
 *
 * Drives the real Express application built by `createApp` (the production
 * wiring, including `requireApiAuth` and the `/api/datasets/:id/llm-credentials`
 * mount) as a black box over HTTP. To stay independent of a live database, the
 * session middleware is faked and the credentials controller is injected wired
 * to the real service over in-memory fakes (repository, crypto, LLM client).
 *
 * Covers verification scenarios 4 (security), 5 (check) and 6 (llm_mode none).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../../../app');
const { createDatasetLlmCredentialsController } = require('../../../controllers/dataset-llm-credentials-controller');
const { createDatasetLlmCredentialsService } = require('../../../services/dataset-llm-credentials-service');
const { createSecretCrypto } = require('../../../utils/secret-crypto');
const { createRequestLogMiddleware } = require('../../../middlewares/request-log-middleware');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const crypto = createSecretCrypto({ secret: 'integration-test-secret-1234567890-abcdef' });

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
 * Builds an in-memory credentials repository.
 * @param {Array<Record<string, any>>} rows
 * @param {string} llmMode
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
 * Builds the real app with a fake session and an injected credentials controller.
 * @param {{ sessionUser?:any, isAdmin?:boolean, llmMode?:string, rows?:any[], llmClient?:any, logsDirectory?:string }} [options]
 * @returns {import('express').Application}
 */
function buildApp({ sessionUser = { id: 7, email: 'admin@example.com' }, isAdmin = true, llmMode = 'generation', rows = [], llmClient, logsDirectory } = {}) {
    const service = createDatasetLlmCredentialsService({
        datasetsPermissionsRepository: { async findPermitForUser() { return { isAdmin, isOwned: false, dataset: { id: 1, name: 'D', llmMode } }; } },
        credentialsRepository: buildCredentialsRepo(rows, llmMode),
        secretCrypto: crypto,
        llmClient: llmClient || { async generateText() { return "I'm llama and I am ready to work"; } }
    });

    return createApp({
        sessionMiddleware: (request, _response, next) => { request.session = sessionUser ? { user: sessionUser } : {}; next(); },
        requestLogMiddleware: logsDirectory ? createRequestLogMiddleware({ logsDirectory }) : undefined,
        controllers: {
            datasetLlmCredentialsController: createDatasetLlmCredentialsController({ datasetLlmCredentialsService: service })
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

/**
 * Performs a JSON request and returns `{ status, body }`.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<{ status:number, body:any }>}
 */
async function jsonRequest(url, init = {}) {
    const response = await fetch(url, { redirect: 'manual', ...init });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
}

/**
 * Polls `logsDirectory` until a `*-error.txt` file appears (the request-log
 * middleware writes it asynchronously after the response finishes).
 * @param {string} logsDirectory
 * @param {number} [timeoutMs]
 * @returns {Promise<string|null>} Absolute path to the error log, or null on timeout.
 */
async function waitForErrorLog(logsDirectory, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const errorFile = fs.existsSync(logsDirectory)
            ? fs.readdirSync(logsDirectory).find(name => name.endsWith('-error.txt'))
            : undefined;
        if (errorFile)
            return path.join(logsDirectory, errorFile);
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return null;
}

describe('US-31 per-dataset LLM credentials (integration)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('Scenario 4 — security: admin manages credentials, responses are masked, non-admin is rejected', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const created = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'llama-3.3', apiKey: 'gsk_top_secret_LAST' })
            });
            assert.equal(created.status, 201);
            assert.equal(created.body.keyLast4, 'LAST');
            assert.equal(JSON.stringify(created.body).includes('gsk_top_secret_LAST'), false);

            const listed = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(listed.status, 200);
            assert.equal('apiKeyCipher' in listed.body[0], false);
        });

        await withServer(buildApp({ isAdmin: false }), async (baseUrl) => {
            const denied = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(denied.status, 403);
        });
    });

    it('requires authentication (no session → 401)', async () => {
        await withServer(buildApp({ sessionUser: null }), async (baseUrl) => {
            const { status } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(status, 401);
        });
    });

    it('Scenario 5 — check: the server calls the model with the decrypted key and returns its message', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'llama', keyLast4: 'KEYX', apiKeyCipher: crypto.encryptSecret('the-key'), isActive: true }];
        /** @type {any} */
        let captured = null;
        const llmClient = { async generateText(/** @type {*} */ options) { captured = options; return "I'm llama and I am ready to work"; } };

        await withServer(buildApp({ rows, llmClient }), async (baseUrl) => {
            const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/groq/check`, { method: 'POST' });
            assert.equal(status, 200);
            assert.equal(body.ok, true);
            assert.equal(body.message, "I'm llama and I am ready to work");
        });

        assert.equal(captured.providerConfig.apiKey, 'the-key');
        assert.equal(captured.prompt, 'Respond "I\'m llama and I am ready to work"');
    });

    it('Scenario 6 — llm_mode none: GET returns [] and writes are rejected (409)', async () => {
        const rows = [{ provider: 'groq', model: 'm', keyLast4: '1234', apiKeyCipher: crypto.encryptSecret('k'), isActive: true }];
        await withServer(buildApp({ llmMode: 'none', rows }), async (baseUrl) => {
            const listed = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`);
            assert.equal(listed.status, 200);
            assert.deepEqual(listed.body, []);

            const write = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'groq', model: 'm', apiKey: 'k' })
            });
            assert.equal(write.status, 409);
        });
    });

    it('Scenario 5b — failed check: returns 200 {ok:false}, records an error-log line, and never leaks the API key (P1)', async () => {
        const clearKey = 'gsk_super_secret_value_DEAD';
        const rows = [{ provider: 'groq', apiBase: null, model: 'llama', keyLast4: 'DEAD', apiKeyCipher: crypto.encryptSecret(clearKey), isActive: true }];
        // The provider rejects: this is a genuine, handled failure that must be
        // traceable in /logs even though the HTTP status stays 200.
        const llmClient = { async generateText() { throw new Error('401 Unauthorized: invalid api key'); } };

        const logsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lanbench-logs-'));
        try {
            await withServer(buildApp({ rows, llmClient, logsDirectory }), async (baseUrl) => {
                const { status, body } = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/groq/check`, { method: 'POST' });
                assert.equal(status, 200, 'a handled provider failure is still surfaced to the UI as 200');
                assert.equal(body.ok, false);
                assert.match(body.error, /Unauthorized/);
            });

            // The error log is written asynchronously after the response finishes.
            const errorLog = await waitForErrorLog(logsDirectory);
            assert.ok(errorLog, 'a *-error.txt log file should have been written');
            const contents = fs.readFileSync(errorLog, 'utf8');
            assert.match(contents, /Comprobación de credencial fallida/);
            assert.match(contents, /groq/);
            assert.equal(contents.includes(clearKey), false, 'the clear API key must never appear in the log');
        } finally {
            fs.rmSync(logsDirectory, { recursive: true, force: true });
        }
    });

    it('full admin lifecycle through the real app: create → activate → check → delete', async () => {
        await withServer(buildApp(), async (baseUrl) => {
            const create = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'anthropic', apiBase: 'https://api.anthropic.com', model: 'claude-3', apiKey: 'ant_key_LAST' })
            });
            assert.equal(create.status, 201);

            const activate = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/anthropic/activate`, { method: 'PATCH' });
            assert.equal(activate.status, 200);
            assert.equal(activate.body.isActive, true);

            const check = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/anthropic/check`, { method: 'POST' });
            assert.equal(check.status, 200);
            assert.equal(check.body.ok, true);

            const remove = await jsonRequest(`${baseUrl}/api/datasets/1/llm-credentials/anthropic`, { method: 'DELETE' });
            assert.equal(remove.status, 200);
            assert.equal(remove.body.removed, true);
        });
    });
});
