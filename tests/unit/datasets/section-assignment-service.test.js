'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSectionAssignmentService } = require('../../../services/section-assignment-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds mock repo from the received data.
 * @param {Object<string, *>} [overrides] - Value of overrides used by the function.
 * @returns {*} Result produced by the function.
 */
function buildMockRepo(overrides = {}) {
    return {
        /**
         * Gets active assignment from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findActiveAssignment() { return null; },
        /**
         * Creates assignment with the received configuration.
         * @param {*} payload - Value of payload used by the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async createAssignment(payload) { return { id: 1, ...payload, status: 'active' }; },
        /**
         * Updates assignment status with the given data.
         */
        async updateAssignmentStatus() {},
        ...overrides
    };
}

/**
 * Builds mock datasets repo from the received data.
 * @param {Object<string, *>} [overrides] - Value of overrides used by the function.
 * @returns {*} Result produced by the function.
 */
function buildMockDatasetsRepo(overrides = {}) {
    return {
        /**
         * Gets entry ids by section from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findEntryIdsBySection() { return []; },
        ...overrides
    };
}

describe('section-assignment-service', () => {
    describe('completeAssignmentIfSectionDone', () => {
        it('devuelve false si no hay asignación activa para el usuario', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo(),
                datasetsRepository: buildMockDatasetsRepo()
            });

            const result = await service.completeAssignmentIfSectionDone({
                userId: 1, datasetId: 5, sectionIndex: 1, prismaClient: null
            });

            assert.equal(result, false);
        });

        it('devuelve false si la asignación es de otra sección', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() { return { id: 1, sectionIndex: 2 }; }
                }),
                datasetsRepository: buildMockDatasetsRepo()
            });

            const result = await service.completeAssignmentIfSectionDone({
                userId: 1, datasetId: 5, sectionIndex: 1, prismaClient: null
            });

            assert.equal(result, false);
        });

        it('devuelve false si no hay entries en la sección', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() { return { id: 1, sectionIndex: 1 }; }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Gets entry ids by section from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findEntryIdsBySection() { return []; }
                })
            });

            const result = await service.completeAssignmentIfSectionDone({
                userId: 1, datasetId: 5, sectionIndex: 1, prismaClient: null
            });

            assert.equal(result, false);
        });

        it('marca la asignación como completada y devuelve true cuando todas las entries están anotadas', async () => {
            /** @type {any[]} */
            const completedIds = [];
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() { return { id: 7, sectionIndex: 1 }; },
                    /**
                     * Updates assignment status with the given data.
                     * @param {*} payload - Value of payload used by the function.
                     */
                    async updateAssignmentStatus(payload) { completedIds.push(payload); }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Gets entry ids by section from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findEntryIdsBySection() { return [101, 102]; }
                })
            });

            const fakePrisma = {
                annotation: {
                    /**
                     * Gets many from the corresponding source.
                     * @param {*} options - Options object used to configure the function.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findMany({ where }) {
                        return where.entryId.in.map((/** @type {*} */ id) => ({ entryId: id }));
                    }
                }
            };

            const result = await service.completeAssignmentIfSectionDone({
                userId: 1, datasetId: 5, sectionIndex: 1, prismaClient: fakePrisma
            });

            assert.equal(result, true);
            assert.equal(completedIds.length, 1);
            assert.equal(completedIds[0].assignmentId, 7);
            assert.equal(completedIds[0].status, 'completed');
        });
    });
});
