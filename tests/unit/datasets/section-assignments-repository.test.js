'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSectionAssignmentsRepository } = require('../../../repositories/section-assignments-repository');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Construye fake prisma a partir de los datos recibidos.
 * @param {Object<string, *>} [overrides] - Valor de overrides usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildFakePrisma(overrides = {}) {
    return {
        sectionAssignment: {
            /**
             * Obtiene first desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findFirst() { return null; },
            /**
             * Obtiene many desde la fuente correspondiente.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async findMany() { return []; },
            /**
             * Crea create con la configuracion recibida.
             * @param {*} payload - Valor de payload usado por la funcion.
             * @returns {Promise<*>} Resultado producido por la funcion.
             */
            async create(payload) { return { id: 1, ...payload.data }; },
            /**
             * Actualiza update con los datos indicados.
             * @param {*} payload - Valor de payload usado por la funcion.
             */
            async update(payload) { return payload.data; },
            /**
             * Actualiza many con los datos indicados.
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
                     * Obtiene first desde la fuente correspondiente.
                     * @param {*} args - Valor de args usado por la funcion.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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

    describe('findActiveSectionIndexes', () => {
        it('devuelve un Set con los índices de sección activos', async () => {
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Obtiene many desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findMany() {
                        return [{ sectionIndex: 1 }, { sectionIndex: 3 }];
                    }
                })
            });

            const result = await repo.findActiveSectionIndexes(7);

            assert.ok(result instanceof Set);
            assert.ok(result.has(1));
            assert.ok(result.has(3));
            assert.equal(result.size, 2);
        });

        it('devuelve Set vacío si no hay asignaciones activas', async () => {
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma()
            });

            const result = await repo.findActiveSectionIndexes(7);
            assert.equal(result.size, 0);
        });
    });

    describe('createAssignment', () => {
        it('persiste la asignación con status active', async () => {
            /** @type {any[]} */
            const creates = [];
            const repo = createSectionAssignmentsRepository({
                prisma: buildFakePrisma({
                    /**
                     * Crea create con la configuracion recibida.
                     * @param {*} payload - Valor de payload usado por la funcion.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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
                     * Actualiza many con los datos indicados.
                     * @param {*} payload - Valor de payload usado por la funcion.
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
                     * Actualiza many con los datos indicados.
                     * @param {*} payload - Valor de payload usado por la funcion.
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
