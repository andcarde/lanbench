'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetLlmCredentialsRepository } = require('../../../repositories/dataset-llm-credentials-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds an in-memory fake of the Prisma surface used by the repository.
 * `rows` is a live array so tests can observe `setActive` mutations.
 * @param {Array<Record<string, any>>} [rows] - Seed credential rows.
 * @param {string|null} [llmMode] - Parent dataset llm_mode.
 * @returns {{ prisma: Record<string, any>, calls: Record<string, any[]> }}
 */
function buildPrisma(rows = [], llmMode = 'generation') {
    /** @type {Record<string, any[]>} */
    const calls = { upsert: [], findMany: [], findFirst: [], findUnique: [], updateMany: [], deleteMany: [] };

    /** @type {PrismaDelegateStub} */
    const datasetLlmCredential = {
        async upsert(args) { calls.upsert.push(args); return { id: 1, ...args.create }; },
        async findMany(args) { calls.findMany.push(args); return rows.filter(r => r.datasetId === args.where.datasetId); },
        async findFirst(args) {
            calls.findFirst.push(args);
            return rows.find(r => r.datasetId === args.where.datasetId && r.isActive === args.where.isActive) || null;
        },
        async findUnique(args) {
            calls.findUnique.push(args);
            const { datasetId, provider } = args.where.datasetId_provider;
            return rows.find(r => r.datasetId === datasetId && r.provider === provider) || null;
        },
        async updateMany(args) {
            calls.updateMany.push(args);
            let count = 0;
            for (const row of rows) {
                const matchesDataset = row.datasetId === args.where.datasetId;
                const matchesProvider = args.where.provider === undefined || row.provider === args.where.provider;
                if (matchesDataset && matchesProvider) {
                    Object.assign(row, args.data);
                    count += 1;
                }
            }
            return { count };
        },
        async deleteMany(args) {
            calls.deleteMany.push(args);
            const before = rows.length;
            for (let index = rows.length - 1; index >= 0; index -= 1) {
                if (rows[index].datasetId === args.where.datasetId && rows[index].provider === args.where.provider)
                    rows.splice(index, 1);
            }
            return { count: before - rows.length };
        }
    };

    /** @type {PrismaStub} */
    const prisma = {
        datasetLlmCredential,
        dataset: {
            async findUnique() { return llmMode === null ? null : { llmMode }; }
        },
        async $transaction(callback) { return callback(prisma); }
    };

    return { prisma, calls };
}

describe('dataset-llm-credentials-repository (T3)', () => {
    it('upsertByProvider keys by (datasetId, provider), creates inactive and does not touch isActive on update', async () => {
        const { prisma, calls } = buildPrisma();
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        await repo.upsertByProvider({ datasetId: 4, provider: 'groq', apiBase: null, model: 'm', apiKeyCipher: 'c', keyLast4: '1234' });

        const args = calls.upsert[0];
        assert.deepEqual(args.where.datasetId_provider, { datasetId: 4, provider: 'groq' });
        assert.equal(args.create.isActive, false);
        assert.equal('isActive' in args.update, false, 'update must not change isActive');
        assert.equal('apiKeyCipher' in args.select, false, 'select must never expose the cipher');
    });

    it('listByDataset never selects the cipher', async () => {
        const { prisma, calls } = buildPrisma([{ datasetId: 4, provider: 'groq', isActive: false }]);
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        await repo.listByDataset(4);
        assert.equal('apiKeyCipher' in calls.findMany[0].select, false);
    });

    it('setActive deactivates the rest and activates the chosen one (exactly one active)', async () => {
        /** @type {any[]} */
        const rows = [
            { datasetId: 7, provider: 'groq', isActive: true },
            { datasetId: 7, provider: 'anthropic', isActive: false }
        ];
        const { prisma } = buildPrisma(rows);
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        const count = await repo.setActive({ datasetId: 7, provider: 'anthropic' });

        assert.equal(count, 1);
        assert.equal(rows.find(r => r.provider === 'groq').isActive, false);
        assert.equal(rows.find(r => r.provider === 'anthropic').isActive, true);
        assert.equal(rows.filter(r => r.isActive).length, 1);
    });

    it('setActive returns 0 when the provider does not exist', async () => {
        const { prisma } = buildPrisma([{ datasetId: 7, provider: 'groq', isActive: false }]);
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        const count = await repo.setActive({ datasetId: 7, provider: 'missing' });
        assert.equal(count, 0);
    });

    it('findActiveByDataset returns null when none is active', async () => {
        const { prisma } = buildPrisma([{ datasetId: 7, provider: 'groq', isActive: false }]);
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        assert.equal(await repo.findActiveByDataset(7), null);
    });

    it('deleteByProvider removes the matching row', async () => {
        const rows = [{ datasetId: 7, provider: 'groq', isActive: false }];
        const { prisma } = buildPrisma(rows);
        const repo = createDatasetLlmCredentialsRepository({ prisma });

        const result = await repo.deleteByProvider({ datasetId: 7, provider: 'groq' });
        assert.equal(result.count, 1);
        assert.equal(rows.length, 0);
    });

    it('findDatasetLlmMode returns the dataset llm_mode, or null when the dataset is missing', async () => {
        const present = createDatasetLlmCredentialsRepository({ prisma: buildPrisma([], 'correction').prisma });
        assert.equal(await present.findDatasetLlmMode(7), 'correction');

        const missing = createDatasetLlmCredentialsRepository({ prisma: buildPrisma([], null).prisma });
        assert.equal(await missing.findDatasetLlmMode(7), null);
    });
});
