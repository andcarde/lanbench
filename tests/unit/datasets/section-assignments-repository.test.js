'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSectionAssignmentsRepository } = require('../../../repositories/section-assignments-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds fake prisma from the received data.
 * @param {Object<string, *>} [overrides] - Value of overrides used by the function.
 * @returns {*} Result produced by the function.
 */
function buildFakePrisma(overrides = {}) {
    return {
        sectionAssignment: {
            /**
             * Gets first from the corresponding source.
             * @returns {Promise<*>} Result produced by the function.
             */
            async findFirst() { return null; },
            /**
             * Gets many from the corresponding source.
             * @returns {Promise<*>} Result produced by the function.
             */
            async findMany() { return []; },
            /**
             * Creates create with the received configuration.
             * @param {*} payload - Value of payload used by the function.
             * @returns {Promise<*>} Result produced by the function.
             */
            async create(payload) { return { id: 1, ...payload.data }; },
            /**
             * Updates update with the given data.
             * @param {*} payload - Value of payload used by the function.
             */
            async update(payload) { return payload.data; },
            /**
             * Updates many with the given data.
             */
            async updateMany() { return { count: 0 }; },
            ...overrides
        }
    };
}

describe('section-assignments-repository', () => {
    describe('findActiveAssignment', () => {
        it('llama a prisma con los filtros correctos', async () => {
            /** @type {any[]} */
            const calls = [];
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Gets first from the corresponding source.
                     * @param {*} args - Value of args used by the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findFirst(args) {
                        calls.push(args);
                        return { id: 5, sectionIndex: 2 };
                    }
                })
            });

            const result = await repo.findActiveAssignment({ userId: 1, datasetId: 3 });

            assert.equal(/** @type {any} */ (result).id, 5);
            assert.equal(calls[0].where.userId, 1);
            assert.equal(calls[0].where.datasetId, 3);
            assert.equal(calls[0].where.status, 'active');
        });
    });

    describe('createAssignment', () => {
        it('persiste la asignación con status active', async () => {
            /** @type {any[]} */
            const creates = [];
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Creates create with the received configuration.
                     * @param {*} payload - Value of payload used by the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async create(payload) {
                        creates.push(payload);
                        return { id: 10, ...payload.data };
                    }
                })
            });

            const expiresAt = new Date('2026-05-01T00:00:00Z');
            await repo.createAssignment({ userId: 2, datasetId: 4, sectionIndex: 1, expiresAt });

            assert.equal(creates.length, 1);
            assert.equal(creates[0].data.userId, 2);
            assert.equal(creates[0].data.datasetId, 4);
            assert.equal(creates[0].data.sectionIndex, 1);
            assert.equal(creates[0].data.status, 'active');
        });
    });

    describe('expireStaleAssignments', () => {
        it('actualiza a expired las asignaciones activas vencidas', async () => {
            /** @type {any[]} */
            const updateManyCalls = [];
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Updates many with the given data.
                     * @param {*} payload - Value of payload used by the function.
                     */
                    async updateMany(payload) {
                        updateManyCalls.push(payload);
                        return { count: 2 };
                    }
                })
            });

            const cutoff = new Date('2026-04-23T00:00:00Z');
            await repo.expireStaleAssignments(cutoff);

            assert.equal(updateManyCalls.length, 1);
            assert.equal(updateManyCalls[0].where.status, 'active');
            assert.deepEqual(updateManyCalls[0].where.expiresAt, { lt: cutoff });
            assert.equal(updateManyCalls[0].data.status, 'expired');
        });
    });

    describe('updateUserDatasetAssignmentStatus', () => {
        it('actualiza con los filtros correctos de usuario y dataset', async () => {
            /** @type {any[]} */
            const updateManyCalls = [];
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Updates many with the given data.
                     * @param {*} payload - Value of payload used by the function.
                     */
                    async updateMany(payload) {
                        updateManyCalls.push(payload);
                        return { count: 1 };
                    }
                })
            });

            await repo.updateUserDatasetAssignmentStatus({
                userId: 3,
                datasetId: 9,
                currentStatus: 'active',
                newStatus: 'released'
            });

            assert.equal(updateManyCalls[0].where.userId, 3);
            assert.equal(updateManyCalls[0].where.datasetId, 9);
            assert.equal(updateManyCalls[0].where.status, 'active');
            assert.equal(updateManyCalls[0].data.status, 'released');
        });
    });
});
