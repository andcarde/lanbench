'use strict';

/**
 * Unit coverage for the dataset custom-providers service (US-36).
 *
 * Verifies authorization (admin-only), name validation (pattern, length,
 * duplicate against built-in catalog, duplicate against existing custom rows
 * in the same dataset), URL validation, and the cascade delete that also
 * removes any credential row referencing the provider.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetCustomProvidersService } = require('../../../services/dataset-custom-providers-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds a permissions repo whose `findPermitForUser` returns a configurable permit.
 * @param {{ isAdmin?:boolean, isOwned?:boolean, permit?:any }} [options]
 * @returns {Record<string, any>}
 */
function buildPermissionsRepo({ isAdmin = true, isOwned = false, permit } = {}) {
    return {
        async findPermitForUser() {
            if (permit !== undefined)
                return permit;
            return { isAdmin, isOwned, dataset: { id: 1, name: 'D', llmMode: 'generation' } };
        }
    };
}

/**
 * Builds a stateful in-memory custom-providers repository for the service tests.
 * @param {Array<{ datasetId:number, name:string, urlBase:string, credentialsRemoved?:number }>} [rows]
 * @returns {Record<string, any> & { rows:any[], deleteCalls:any[] }}
 */
function buildCustomProvidersRepo(rows = []) {
    /** @type {any[]} */
    const deleteCalls = [];
    return {
        rows,
        deleteCalls,
        async listByDataset(datasetId) {
            return rows.filter(row => row.datasetId === datasetId);
        },
        async findByName({ datasetId, name }) {
            return rows.find(row => row.datasetId === datasetId && row.name === name) || null;
        },
        async create(payload) {
            const row = { ...payload, createdAt: new Date() };
            rows.push(row);
            return row;
        },
        async deleteByName({ datasetId, name }) {
            deleteCalls.push({ datasetId, name });
            const before = rows.length;
            for (let i = rows.length - 1; i >= 0; i -= 1)
                if (rows[i].datasetId === datasetId && rows[i].name === name)
                    rows.splice(i, 1);
            return {
                count: before - rows.length,
                credentialsRemoved: typeof this._credentialsRemovedOnDelete === 'number'
                    ? this._credentialsRemovedOnDelete
                    : 0
            };
        }
    };
}

describe('dataset-custom-providers-service (US-36) — authorization', () => {
    it('rejects a non-admin actor with 403', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo({ isAdmin: false }),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        await assert.rejects(() => service.listForAdmin(9, 1), (/** @type {any} */ error) => {
            assert.equal(error.status, 403);
            assert.equal(error.code, 'dataset_admin_required');
            return true;
        });
        await assert.rejects(() => service.createCustomProvider(9, 1, { name: 'x', urlBase: 'https://a.b' }), (/** @type {any} */ error) => {
            assert.equal(error.status, 403);
            return true;
        });
        await assert.rejects(() => service.deleteCustomProvider(9, 1, 'x'), (/** @type {any} */ error) => {
            assert.equal(error.status, 403);
            return true;
        });
    });

    it('treats a missing permit as 404 dataset_not_found', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo({ permit: null }),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        await assert.rejects(() => service.listForAdmin(9, 1), (/** @type {any} */ error) => {
            assert.equal(error.status, 404);
            assert.equal(error.code, 'dataset_not_found');
            return true;
        });
    });
});

describe('dataset-custom-providers-service (US-36) — createCustomProvider validation', () => {
    it('rejects an invalid name (uppercase, special chars, too long)', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        for (const name of ['', 'Has Space', 'with$char', 'x'.repeat(41)]) {
            await assert.rejects(
                () => service.createCustomProvider(9, 1, { name, urlBase: 'https://a.b' }),
                (/** @type {any} */ error) => {
                    assert.equal(error.status, 400);
                    assert.equal(error.code, 'invalid_payload');
                    return true;
                },
                `expected reject for ${name}`
            );
        }
    });

    it('rejects an invalid URL (no http(s), too long, empty)', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        for (const urlBase of ['', 'ftp://x', 'gateway.example.com', 'https://' + 'a'.repeat(260)]) {
            await assert.rejects(
                () => service.createCustomProvider(9, 1, { name: 'gateway', urlBase }),
                (/** @type {any} */ error) => {
                    assert.equal(error.status, 400);
                    assert.equal(error.code, 'invalid_payload');
                    return true;
                },
                `expected reject for ${urlBase}`
            );
        }
    });

    it('rejects a name that collides with a built-in provider (409)', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        for (const name of ['groq', 'GROQ', ' Anthropic ', 'openai-compatible', 'google-ai-studio']) {
            await assert.rejects(
                () => service.createCustomProvider(9, 1, { name, urlBase: 'https://a.b' }),
                (/** @type {any} */ error) => {
                    assert.equal(error.status, 409);
                    assert.equal(error.code, 'provider_already_exists');
                    assert.equal(error.message, 'Proveedor ya añadido');
                    return true;
                }
            );
        }
    });

    it('rejects a duplicate name already registered for the dataset (409)', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo([
                { datasetId: 1, name: 'gateway', urlBase: 'https://a.b' }
            ])
        });

        await assert.rejects(
            () => service.createCustomProvider(9, 1, { name: 'gateway', urlBase: 'https://other.example.com' }),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 409);
                assert.equal(error.code, 'provider_already_exists');
                return true;
            }
        );
    });

    it('translates a Prisma P2002 unique-constraint race into a clean 409', async () => {
        const repo = buildCustomProvidersRepo();
        repo.create = async () => { throw Object.assign(new Error('Unique constraint'), { code: 'P2002' }); };
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: repo
        });

        await assert.rejects(
            () => service.createCustomProvider(9, 1, { name: 'newone', urlBase: 'https://a.b' }),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 409);
                assert.equal(error.code, 'provider_already_exists');
                return true;
            }
        );
    });

    it('persists a valid provider and returns the row', async () => {
        const repo = buildCustomProvidersRepo();
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: repo
        });

        const result = await service.createCustomProvider(9, 1, { name: ' GATEWAY ', urlBase: 'https://gateway.example.com/v1' });
        assert.equal(result.name, 'gateway');
        assert.equal(result.urlBase, 'https://gateway.example.com/v1');
        assert.equal(repo.rows.length, 1);
        assert.equal(repo.rows[0].datasetId, 1);
    });
});

describe('dataset-custom-providers-service (US-36) — deleteCustomProvider', () => {
    it('rejects deleting a built-in provider name with 400', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        await assert.rejects(
            () => service.deleteCustomProvider(9, 1, 'groq'),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 400);
                assert.equal(error.code, 'invalid_payload');
                return true;
            }
        );
    });

    it('returns 404 when the custom provider does not exist for the dataset', async () => {
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: buildCustomProvidersRepo()
        });

        await assert.rejects(
            () => service.deleteCustomProvider(9, 1, 'gateway'),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 404);
                assert.equal(error.code, 'custom_provider_not_found');
                return true;
            }
        );
    });

    it('deletes a custom provider and surfaces the cascaded credentials count', async () => {
        const repo = buildCustomProvidersRepo([
            { datasetId: 1, name: 'gateway', urlBase: 'https://a.b' }
        ]);
        repo._credentialsRemovedOnDelete = 1;
        const service = createDatasetCustomProvidersService({
            datasetsPermissionsRepository: buildPermissionsRepo(),
            customProvidersRepository: repo
        });

        const result = await service.deleteCustomProvider(9, 1, 'gateway');
        assert.deepEqual(result, { removed: true, name: 'gateway', credentialsRemoved: 1 });
        assert.equal(repo.rows.length, 0);
        assert.deepEqual(repo.deleteCalls[0], { datasetId: 1, name: 'gateway' });
    });
});
