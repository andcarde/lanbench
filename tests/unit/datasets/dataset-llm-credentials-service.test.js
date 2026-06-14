'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetLlmCredentialsService } = require('../../../services/dataset-llm-credentials-service');
const { createSecretCrypto } = require('../../../utils/secret-crypto');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const crypto = createSecretCrypto({ secret: 'service-test-secret-1234567890-abcdef' });

/**
 * Builds a permissions repository whose `findPermitForUser` returns a permit.
 * @param {{ isAdmin?:boolean, isOwned?:boolean, llmMode?:string, permit?:any }} [options]
 * @returns {Record<string, any>}
 */
function buildPermissionsRepo({ isAdmin = true, isOwned = false, llmMode = 'generation', permit } = {}) {
    return {
        async findPermitForUser() {
            if (permit !== undefined)
                return permit;
            return { isAdmin, isOwned, dataset: { id: 1, name: 'D', llmMode } };
        }
    };
}

/**
 * Builds a stateful in-memory credentials repository.
 * @param {Array<Record<string, any>>} [rows] - Seed rows (with apiKeyCipher).
 * @param {string} [llmMode] - Parent dataset llm_mode.
 * @returns {Record<string, any>}
 */
function buildCredentialsRepo(rows = [], llmMode = 'generation') {
    return /** @type {CredentialsRepoStub} */ ({
        async upsertByProvider(payload) {
            const row = { id: 1, isActive: false, ...payload };
            rows.push(row);
            return row;
        },
        async listByDataset() { return rows.map(({ apiKeyCipher: _omit, ...rest }) => rest); },
        async findActiveByDataset() { return rows.find(r => r.isActive) || null; },
        async findByProvider({ provider }) { return rows.find(r => r.provider === provider) || null; },
        async setActive({ provider }) {
            let count = 0;
            for (const row of rows) {
                row.isActive = row.provider === provider;
                if (row.isActive) count += 1;
            }
            return count;
        },
        async deleteByProvider({ provider }) {
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i -= 1)
                if (rows[i].provider === provider) rows.splice(i, 1);
            return { count: before - rows.length };
        },
        async findDatasetLlmMode() { return llmMode; }
    });
}

describe('dataset-llm-credentials-service (T4)', () => {
    it('rejects a non-admin with a 403 ServiceError', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo({ isAdmin: false, isOwned: false }),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {}
        });

        await assert.rejects(() => service.listForAdmin(9, 1), (/** @type {any} */ error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, 'dataset_admin_required');
            return true;
        });
    });

    it('saveCredential returns a masked DTO that never contains the clear key nor the cipher', async () => {
        /** @type {any[]} */
        const rows = [];
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(rows),
            secretCrypto: crypto,
            llmClient: {}
        });

        const dto = await service.saveCredential(9, 1, { provider: 'Groq', model: 'llama-3.3-70b', apiKey: 'gsk_super_secret_KEY' });

        assert.deepEqual(Object.keys(dto).sort(), ['apiBase', 'isActive', 'keyLast4', 'model', 'provider']);
        assert.equal(dto.provider, 'groq');
        assert.equal(dto.keyLast4, '_KEY');
        const serialized = JSON.stringify(dto);
        assert.equal(serialized.includes('gsk_super_secret_KEY'), false);
        assert.equal(serialized.includes(rows[0].apiKeyCipher), false);
        // The stored cipher decrypts back to the original key.
        assert.equal(crypto.decryptSecret(rows[0].apiKeyCipher), 'gsk_super_secret_KEY');
    });

    it('rejects an invalid payload (missing apiKey) with 400', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {}
        });

        await assert.rejects(() => service.saveCredential(9, 1, { provider: 'groq', model: 'm' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 400);
            return true;
        });
    });

    it('resolveActiveProviderConfig decrypts the active credential, and returns null when none is active', async () => {
        const cipher = crypto.encryptSecret('active-key-9999');
        const rows = [
            { provider: 'groq', apiBase: null, model: 'm1', apiKeyCipher: crypto.encryptSecret('x'), isActive: false },
            { provider: 'anthropic', apiBase: 'https://api.anthropic.com', model: 'claude', apiKeyCipher: cipher, isActive: true }
        ];
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(rows),
            secretCrypto: crypto,
            llmClient: {}
        });

        const config = await service.resolveActiveProviderConfig(1);
        assert.deepEqual(config, { provider: 'anthropic', apiBase: 'https://api.anthropic.com', model: 'claude', apiKey: 'active-key-9999' });

        rows.forEach(r => { r.isActive = false; });
        assert.equal(await service.resolveActiveProviderConfig(1), null);
    });

    it('with llm_mode = "none": listForAdmin returns [] and resolveActiveProviderConfig returns null even with rows', async () => {
        const rows = [{ provider: 'groq', model: 'm', apiKeyCipher: crypto.encryptSecret('k'), isActive: true }];
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo({ llmMode: 'none' }),
            credentialsRepository: buildCredentialsRepo(rows, 'none'),
            secretCrypto: crypto,
            llmClient: {}
        });

        assert.deepEqual(await service.listForAdmin(9, 1), []);
        assert.equal(await service.resolveActiveProviderConfig(1), null);
    });

    it('with llm_mode = "none": writes and check are rejected with 409', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo({ llmMode: 'none' }),
            credentialsRepository: buildCredentialsRepo([], 'none'),
            secretCrypto: crypto,
            llmClient: {}
        });

        for (const run of [
            () => service.saveCredential(9, 1, { provider: 'groq', model: 'm', apiKey: 'k' }),
            () => service.activateCredential(9, 1, 'groq'),
            () => service.deleteCredential(9, 1, 'groq'),
            () => service.checkCredential(9, 1, 'groq')
        ]) {
            await assert.rejects(run, (/** @type {any} */ error) => {
                assert.equal(error.status, 409);
                assert.equal(error.code, 'llm_disabled');
                return true;
            });
        }
    });

    it('checkCredential calls the model with the decrypted key and returns its message', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'llama-3.3-70b', apiKeyCipher: crypto.encryptSecret('the-real-key'), isActive: true }];
        /** @type {any} */
        let captured = null;
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(rows),
            secretCrypto: crypto,
            llmClient: {
                async generateText(/** @type {*} */ options) { captured = options; return "I'm llama-3.3-70b and I am ready to work"; }
            }
        });

        const result = await service.checkCredential(9, 1, 'groq');

        assert.equal(result.ok, true);
        assert.equal(result.message, "I'm llama-3.3-70b and I am ready to work");
        assert.equal(captured.providerConfig.apiKey, 'the-real-key');
        assert.equal(captured.prompt, 'Respond "I\'m llama-3.3-70b and I am ready to work"');
    });

    it('checkCredential returns { ok:false, error } without leaking the key on provider failure', async () => {
        const rows = [{ provider: 'groq', apiBase: null, model: 'm', apiKeyCipher: crypto.encryptSecret('leak-me-not'), isActive: true }];
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(rows),
            secretCrypto: crypto,
            llmClient: {
                async generateText() { throw new Error('provider 401 with token leak-me-not in body'); }
            }
        });

        /** @type {any} */
        const result = await service.checkCredential(9, 1, 'groq');
        assert.equal(result.ok, false);
        assert.equal(result.error.includes('leak-me-not'), false);
        assert.equal(result.error.includes('[REDACTED]'), true);
    });

    it('saveCredential rejects an apiBase pointing to Groq website (console.groq.com / groq.com) with 400', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {}
        });

        for (const apiBase of [
            'https://console.groq.com/openai/v1',
            'https://console.groq.com',
            'https://groq.com',
            'https://www.groq.com/openai/v1'
        ]) {
            await assert.rejects(
                () => service.saveCredential(9, 1, { provider: 'groq', model: 'm', apiKey: 'k', apiBase }),
                (/** @type {any} */ error) => {
                    assert.equal(error.status, 400);
                    assert.equal(error.code, 'invalid_payload');
                    return true;
                },
                `expected reject for ${apiBase}`
            );
        }

        // Sanity: the canonical API URL is still accepted.
        const ok = await service.saveCredential(9, 1, { provider: 'groq', model: 'm', apiKey: 'k', apiBase: 'https://api.groq.com/openai/v1' });
        assert.equal(ok.apiBase, 'https://api.groq.com/openai/v1');
    });

    it('activate and delete reject an unknown provider with 404', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo([]),
            secretCrypto: crypto,
            llmClient: {}
        });

        await assert.rejects(() => service.activateCredential(9, 1, 'groq'), (/** @type {any} */ e) => (assert.equal(e.code, 'credential_not_found'), true));
        await assert.rejects(() => service.deleteCredential(9, 1, 'groq'), (/** @type {any} */ e) => (assert.equal(e.code, 'credential_not_found'), true));
    });
});

/**
 * Builds a recording model-catalog stub (US-35).
 * @param {{ models?:Array<{id:string,label:string}>, error?:Error }} [options]
 * @returns {Record<string, any> & { calls: any[] }}
 */
function buildModelCatalogStub({ models, error } = {}) {
    /** @type {any[]} */
    const calls = [];
    return {
        calls,
        supportsModelCatalog(/** @type {*} */ provider) {
            return ['groq', 'google-ai-studio'].includes(String(provider));
        },
        async listModels(/** @type {*} */ options) {
            calls.push(options);
            if (error)
                throw error;
            return models || [];
        }
    };
}

describe('dataset-llm-credentials-service — listProviderModels (US-35)', () => {
    it('usa la clave tecleada en el formulario cuando está presente', async () => {
        const catalog = buildModelCatalogStub({ models: [{ id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }] });
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: catalog
        });

        const result = await service.listProviderModels(9, 1, { provider: 'Groq', apiKey: '  gsk_typed  ' });

        assert.equal(result.ok, true);
        assert.deepEqual(result.models, [{ id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' }]);
        assert.equal(catalog.calls[0].apiKey, 'gsk_typed');
        assert.equal(catalog.calls[0].provider, 'groq');
    });

    it('sin clave tecleada usa la credencial guardada (clave descifrada y apiBase)', async () => {
        const rows = [{
            provider: 'google-ai-studio',
            apiBase: 'https://proxy.example.com/v1beta/openai',
            model: 'gemini-2.0-flash',
            apiKeyCipher: crypto.encryptSecret('stored-key-1234'),
            isActive: true
        }];
        const catalog = buildModelCatalogStub({ models: [] });
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(rows),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: catalog
        });

        const result = await service.listProviderModels(9, 1, { provider: 'google-ai-studio' });

        assert.equal(result.ok, true);
        assert.equal(catalog.calls[0].apiKey, 'stored-key-1234');
        assert.equal(catalog.calls[0].apiBase, 'https://proxy.example.com/v1beta/openai');
    });

    it('sin clave tecleada ni credencial guardada responde 400', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: buildModelCatalogStub()
        });

        await assert.rejects(() => service.listProviderModels(9, 1, { provider: 'groq' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 400);
            assert.equal(error.code, 'invalid_payload');
            return true;
        });
    });

    it('rechaza con 400 un proveedor sin catálogo consultable (anthropic)', async () => {
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: buildModelCatalogStub()
        });

        await assert.rejects(() => service.listProviderModels(9, 1, { provider: 'anthropic', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 400);
            return true;
        });
    });

    it('devuelve { ok:false, code } ante un fallo del proveedor, con la clave redactada', async () => {
        const failure = Object.assign(new Error('Groq rechazó la clave gsk_typed_secret'), { code: 'invalid_key' });
        const service = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: buildModelCatalogStub({ error: failure })
        });

        const result = await service.listProviderModels(9, 1, { provider: 'groq', apiKey: 'gsk_typed_secret' });

        assert.equal(result.ok, false);
        assert.equal(result.code, 'invalid_key');
        assert.equal(result.error.includes('gsk_typed_secret'), false);
        assert.equal(result.error.includes('[REDACTED]'), true);
    });

    it('con llm_mode = none responde 409 y un no-admin recibe 403', async () => {
        const blocked = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo({ llmMode: 'none' }),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: buildModelCatalogStub()
        });
        await assert.rejects(() => blocked.listProviderModels(9, 1, { provider: 'groq', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 409);
            assert.equal(error.code, 'llm_disabled');
            return true;
        });

        const nonAdmin = createDatasetLlmCredentialsService({
            datasetsPermissionsRepository: buildPermissionsRepo({ isAdmin: false, isOwned: false }),
            credentialsRepository: buildCredentialsRepo(),
            secretCrypto: crypto,
            llmClient: {},
            modelCatalog: buildModelCatalogStub()
        });
        await assert.rejects(() => nonAdmin.listProviderModels(9, 1, { provider: 'groq', apiKey: 'k' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 403);
            return true;
        });
    });
});
