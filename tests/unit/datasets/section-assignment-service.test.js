'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSectionAssignmentService, sectionMatchesComplexity } = require('../../../services/section-assignment-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Construye mock repo a partir de los datos recibidos.
 * @param {Object<string, *>} [overrides] - Valor de overrides usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildMockRepo(overrides = {}) {
    return {
        /**
         * Ejecuta de forma asincrona la logica de expire stale assignments.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async expireStaleAssignments() {},
        /**
         * Obtiene active assignment desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findActiveAssignment() { return null; },
        /**
         * Obtiene active section indexes desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findActiveSectionIndexes() { return new Set(); },
        /**
         * Crea assignment con la configuracion recibida.
         * @param {*} payload - Valor de payload usado por la funcion.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async createAssignment(payload) { return { id: 1, ...payload, status: 'active' }; },
        /**
         * Actualiza assignment status con los datos indicados.
         */
        async updateAssignmentStatus() {},
        /**
         * Actualiza user dataset assignment status con los datos indicados.
         */
        async updateUserDatasetAssignmentStatus() {},
        /**
         * Obtiene active assignment for section desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findActiveAssignmentForSection() { return null; },
        ...overrides
    };
}

/**
 * Construye mock datasets repo a partir de los datos recibidos.
 * @param {Object<string, *>} [overrides] - Valor de overrides usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildMockDatasetsRepo(overrides = {}) {
    return {
        /**
         * Obtiene accessible by id desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findAccessibleById() { return { entries: 20 }; },
        /**
         * Obtiene entry sizes by dataset desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findEntrySizesByDataset() { return []; },
        /**
         * Obtiene entry ids by section desde la fuente correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async findEntryIdsBySection() { return []; },
        ...overrides
    };
}

describe('section-assignment-service', () => {
    describe('sectionMatchesComplexity', () => {
        it('devuelve false para array vacío', () => {
            assert.equal(sectionMatchesComplexity([], 'low'), false);
        });

        it('devuelve false para complejidad desconocida', () => {
            assert.equal(sectionMatchesComplexity([1, 2], 'unknown'), false);
        });

        it('low: mayoría de tamaños 1-2 → true', () => {
            assert.equal(sectionMatchesComplexity([1, 1, 2, 1, 4], 'low'), true);
        });

        it('low: mayoría de tamaños > 2 → false', () => {
            assert.equal(sectionMatchesComplexity([3, 4, 5, 1, 2], 'low'), false);
        });

        it('medium: mayoría de tamaños 3-5 → true', () => {
            assert.equal(sectionMatchesComplexity([3, 4, 5, 3, 1], 'medium'), true);
        });

        it('high: mayoría de tamaños ≥ 6 → true', () => {
            assert.equal(sectionMatchesComplexity([6, 7, 8, 6, 1], 'high'), true);
        });
    });

    describe('requestSection', () => {
        it('devuelve la asignación activa existente sin crear otra', async () => {
            const existingAssignment = { id: 42, sectionIndex: 2, status: 'active' };
            /** @type {any[]} */
            const createCalls = [];

            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return existingAssignment; },
                    /**
                     * Crea assignment con la configuracion recibida.
                     * @param {*} p - Valor de p usado por la funcion.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async createAssignment(p) { createCalls.push(p); return p; }
                }),
                datasetsRepository: buildMockDatasetsRepo()
            });

            const result = await service.requestSection({ userId: 1, datasetId: 5 });

            assert.deepEqual(result, existingAssignment);
            assert.equal(createCalls.length, 0);
        });

        it('asigna la primera sección no ocupada cuando complexity=any', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Obtiene active section indexes desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveSectionIndexes() { return new Set([1]); }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Obtiene accessible by id desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findAccessibleById() { return { totalEntries: 30 }; }
                }),
                assignmentDurationMs: 1000
            });

            const result = await service.requestSection({ userId: 1, datasetId: 5, complexity: 'any' });

            assert.equal(result.sectionIndex, 2);
        });

        it('lanza ServiceError 404 si el dataset no existe', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo(),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Obtiene accessible by id desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findAccessibleById() { return null; }
                })
            });

            await assert.rejects(
                () => service.requestSection({ userId: 1, datasetId: 99 }),
                { message: 'Dataset no encontrado.' }
            );
        });

        it('lanza ServiceError 404 si todas las secciones están ocupadas', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Obtiene active section indexes desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveSectionIndexes() { return new Set([1, 2]); }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Obtiene accessible by id desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findAccessibleById() { return { entries: 20 }; }
                })
            });

            await assert.rejects(
                () => service.requestSection({ userId: 1, datasetId: 5 }),
                { message: 'No hay secciones disponibles en este dataset.' }
            );
        });
    });

    describe('releaseSection', () => {
        it('actualiza el estado de la asignación a released', async () => {
            /** @type {any[]} */
            const calls = [];
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Actualiza user dataset assignment status con los datos indicados.
                     * @param {*} payload - Valor de payload usado por la funcion.
                     */
                    async updateUserDatasetAssignmentStatus(payload) { calls.push(payload); }
                }),
                datasetsRepository: buildMockDatasetsRepo()
            });

            await service.releaseSection({ userId: 3, datasetId: 7 });

            assert.equal(calls.length, 1);
            assert.equal(calls[0].userId, 3);
            assert.equal(calls[0].datasetId, 7);
            assert.equal(calls[0].newStatus, 'released');
        });
    });

    describe('resumeSection', () => {
        it('devuelve la asignación activa existente', async () => {
            const assignment = { id: 10, sectionIndex: 3, status: 'active' };
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo({
                    /**
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return assignment; }
                }),
                datasetsRepository: buildMockDatasetsRepo()
            });

            const result = await service.resumeSection({ userId: 1, datasetId: 5 });
            assert.deepEqual(result, assignment);
        });

        it('devuelve null si no hay asignación activa', async () => {
            const service = createSectionAssignmentService({
                sectionAssignmentsRepository: buildMockRepo(),
                datasetsRepository: buildMockDatasetsRepo()
            });

            const result = await service.resumeSection({ userId: 1, datasetId: 5 });
            assert.equal(result, null);
        });
    });

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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return { id: 1, sectionIndex: 1 }; }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Obtiene entry ids by section desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return { id: 7, sectionIndex: 1 }; },
                    /**
                     * Actualiza assignment status con los datos indicados.
                     * @param {*} payload - Valor de payload usado por la funcion.
                     */
                    async updateAssignmentStatus(payload) { completedIds.push(payload); }
                }),
                datasetsRepository: buildMockDatasetsRepo({
                    /**
                     * Obtiene entry ids by section desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findEntryIdsBySection() { return [101, 102]; }
                })
            });

            const fakePrisma = {
                annotation: {
                    /**
                     * Obtiene many desde la fuente correspondiente.
                     * @param {*} options - Objeto de opciones usado para configurar la funcion.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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
