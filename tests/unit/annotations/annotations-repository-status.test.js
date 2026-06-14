'use strict';

/**
 * Unit coverage for the entry-lifecycle transition introduced so the review
 * workflow is reachable: `replaceForAccessibleEntry` must mark the entry
 * `annotated` when at least one sentence is saved, and revert it to `pending`
 * when every sentence is cleared. Before this transition existed,
 * `Entry.status` never left `pending` through any production path, so
 * `reviews-repository.findReviewableEntries` (which filters `status =
 * 'annotated'`) always returned an empty set and no review could ever start.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsRepository } = require('../../../repositories/annotations-repository');
const { ENTRY_ANNOTATED, ENTRY_PENDING } = require('../../../constants/entry-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds a Prisma stub whose `$transaction` runs the callback with a tx client
 * that records every `entry.update` and the create/delete calls.
 *
 * @param {{ entry?: { id:number }|null }} [options]
 * @returns {{ prisma:any, calls:any }}
 */
function buildPrisma({ entry = { id: 10 } } = {}) {
    const calls = {
        statusUpdates: /** @type {any[]} */ ([]),
        created: /** @type {any[]} */ ([]),
        deleted: /** @type {any[]} */ ([])
    };

    const tx = {
        entry: {
            async findFirst() { return entry; },
            async update(/** @type {*} */ args) {
                calls.statusUpdates.push(args.data.status);
                return { id: args.where.id, ...args.data };
            }
        },
        annotation: {
            async deleteMany(/** @type {*} */ args) { calls.deleted.push(args.where); return { count: 0 }; },
            async createMany(/** @type {*} */ args) { calls.created.push(args.data); return { count: args.data.length }; }
        }
    };

    return {
        prisma: {
            async $transaction(/** @type {*} */ fn) { return fn(tx); }
        },
        calls
    };
}

describe('annotations-repository — entry lifecycle transition', () => {
    it('marca la entry como annotated cuando se guarda al menos una frase', async () => {
        const { prisma, calls } = buildPrisma();
        const repo = createAnnotationsRepository({ prisma });

        const result = await repo.replaceForAccessibleEntry({
            userId: 7,
            datasetId: 3,
            eid: 1,
            sentences: [{ sentence: 'Una frase.', rejectionReason: null }]
        });

        assert.deepEqual(result, { entryId: 10, savedCount: 1 });
        assert.equal(calls.created.length, 1, 'debería crear las filas de anotación');
        assert.deepEqual(calls.statusUpdates, [ENTRY_ANNOTATED]);
    });

    it('revierte la entry a pending cuando se borran todas las frases', async () => {
        const { prisma, calls } = buildPrisma();
        const repo = createAnnotationsRepository({ prisma });

        const result = await repo.replaceForAccessibleEntry({
            userId: 7,
            datasetId: 3,
            eid: 1,
            sentences: []
        });

        assert.deepEqual(result, { entryId: 10, savedCount: 0 });
        assert.equal(calls.created.length, 0, 'no debería crear filas si no hay frases');
        assert.deepEqual(calls.statusUpdates, [ENTRY_PENDING]);
    });

    it('no toca el estado cuando la entry no es accesible', async () => {
        const { prisma, calls } = buildPrisma({ entry: null });
        const repo = createAnnotationsRepository({ prisma });

        const result = await repo.replaceForAccessibleEntry({
            userId: 7,
            datasetId: 3,
            eid: 999,
            sentences: [{ sentence: 'x', rejectionReason: null }]
        });

        assert.equal(result, null);
        assert.deepEqual(calls.statusUpdates, []);
    });
});
