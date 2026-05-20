'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsRepository } = require('../../../repositories/datasets-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('datasets-repository deleteDatasetRecursively', () => {
    it('borra el grafo dependiente antes de eliminar el dataset', async () => {
        /** @type {any[]} */
        const calls = [];
        const tx = buildTransactionRecorder(calls);
        const repository = createDatasetsRepository({
            prisma: {
                async $transaction(/** @type {*} */ callback) {
                    return callback(tx);
                }
            }
        });

        const deleted = await repository.deleteDatasetRecursively({ datasetId: 7 });

        assert.deepEqual(deleted, { datasetId: 7 });
        assert.deepEqual(calls.map(call => call.name), [
            'reviewDecision.deleteMany',
            'reviewComment.deleteMany',
            'review.deleteMany',
            'annotationAlertDecision.deleteMany',
            'annotation.deleteMany',
            'triple.deleteMany',
            'tripleset.deleteMany',
            'lex.deleteMany',
            'dbpediaLink.deleteMany',
            'link.deleteMany',
            'entry.deleteMany',
            'sectionAssignment.deleteMany',
            'section.deleteMany',
            'permit.deleteMany',
            'dataset.delete'
        ]);
        assert.deepEqual(calls[0].args, {
            where: { review: { entry: { datasetId: 7 } } }
        });
        assert.deepEqual(calls.at(-1).args, {
            where: { id: 7 }
        });
    });
});

describe('datasets-repository createOwnedDataset', () => {
    it('usa una transacción amplia y divide las inserciones masivas en lotes', async () => {
        /** @type {any[]} */
        const calls = [];
        /** @type {any} */
        let transactionOptions = null;
        const tx = buildCreateTransactionRecorder(calls);
        const repository = createDatasetsRepository({
            prisma: {
                async $transaction(/** @type {*} */ callback, /** @type {*} */ options) {
                    transactionOptions = options;
                    return callback(tx);
                }
            }
        });

        const entryRecords = Array.from({ length: 501 }, (_, position) => ({
            eid: position + 1,
            category: 'Airport',
            shape: null,
            shapeType: null,
            size: 1,
            position,
            originalTriplesets: [],
            modifiedTriplesets: [],
            lexes: [],
            dbpediaLinks: [],
            links: []
        }));

        const created = await repository.createOwnedDataset({
            userId: 42,
            datasetData: {
                name: 'Dataset grande',
                totalEntries: entryRecords.length,
                content: Buffer.from('<benchmark />')
            },
            entryRecords,
            resolveColorClass: () => 'dataset-blue'
        });

        const entryCreateManyCalls = calls.filter(call => call.name === 'entry.createMany');

        assert.equal(created.id, 7);
        assert.deepEqual(transactionOptions, {
            maxWait: 20000,
            timeout: 120000
        });
        assert.equal(entryCreateManyCalls.length, 2);
        assert.equal(entryCreateManyCalls[0].args.data.length, 500);
        assert.equal(entryCreateManyCalls[1].args.data.length, 1);
    });
});

/**
 * Builds a fake tx that records Prisma calls.
 * @param {Array<*>} calls - Captured calls.
 * @returns {*} Fake transaction.
 */
function buildTransactionRecorder(calls) {
    /** @type {Record<string, any>} */
    const tx = {};
    const deleteManyModels = [
        'reviewDecision',
        'reviewComment',
        'review',
        'annotationAlertDecision',
        'annotation',
        'triple',
        'tripleset',
        'lex',
        'dbpediaLink',
        'link',
        'entry',
        'sectionAssignment',
        'section',
        'permit'
    ];

    for (const model of deleteManyModels) {
        tx[model] = {
            async deleteMany(/** @type {*} */ args) {
                calls.push({ name: `${model}.deleteMany`, args });
                return { count: 1 };
            }
        };
    }

    tx.dataset = {
        async delete(/** @type {*} */ args) {
            calls.push({ name: 'dataset.delete', args });
            return { id: args.where.id };
        }
    };

    return tx;
}

/**
 * Builds a fake tx for dataset creation.
 * @param {Array<*>} calls - Captured calls.
 * @returns {*} Fake transaction.
 */
function buildCreateTransactionRecorder(calls) {
    /** @type {any[]} */
    const entryRows = [];

    return {
        dataset: {
            async create(/** @type {*} */ args) {
                calls.push({ name: 'dataset.create', args });
                return {
                    id: 7,
                    colorClass: 'dataset-purple',
                    ...args.data
                };
            },
            async update(/** @type {*} */ args) {
                calls.push({ name: 'dataset.update', args });
                return {
                    id: args.where.id,
                    colorClass: args.data.colorClass
                };
            }
        },
        permit: {
            async create(/** @type {*} */ args) {
                calls.push({ name: 'permit.create', args });
                return args.data;
            }
        },
        entry: {
            async createMany(/** @type {*} */ args) {
                calls.push({ name: 'entry.createMany', args });
                entryRows.push(...args.data.map((/** @type {*} */ row, /** @type {*} */ index) => ({
                    id: entryRows.length + index + 1,
                    position: row.position
                })));
                return { count: args.data.length };
            },
            async findMany(/** @type {*} */ args) {
                calls.push({ name: 'entry.findMany', args });
                return entryRows;
            }
        },
        tripleset: createEmptyCreateManyModel(calls, 'tripleset'),
        triple: createEmptyCreateManyModel(calls, 'triple'),
        lex: createEmptyCreateManyModel(calls, 'lex'),
        dbpediaLink: createEmptyCreateManyModel(calls, 'dbpediaLink'),
        link: createEmptyCreateManyModel(calls, 'link')
    };
}

/**
 * Creates a fake model for createMany with no rows.
 * @param {Array<*>} calls - Captured calls.
 * @param {string} model - Model name.
 * @returns {*} Fake model.
 */
function createEmptyCreateManyModel(calls, model) {
    return {
        async createMany(/** @type {*} */ args) {
            calls.push({ name: `${model}.createMany`, args });
            return { count: args.data.length };
        },
        async findMany(/** @type {*} */ args) {
            calls.push({ name: `${model}.findMany`, args });
            return [];
        }
    };
}
