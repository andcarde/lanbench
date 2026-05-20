'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService } = require('../../../services/annotations-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Builds spanish service from the received data.
 * @param {Object<string, *>} [overrides] - Value of overrides used by the function.
 * @returns {*} Result produced by the function.
 */
function buildSpanishService(overrides = {}) {
    return {
        /**
         * Checks check and returns the validation result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async check() { return { valid: true, reason: null, suggestion: null }; },
        /**
         * Asynchronously runs save against the corresponding persistence layer or API.
         * @returns {Promise<*>} Result produced by the function.
         */
        async save() { return { ok: true }; },
        ...overrides
    };
}

/**
 * Test Prisma client that runs the `$transaction` callback with a
 * fake `tx`. The section-closing writes are stubbed at the
 * service/repository level, so the `tx` does not need real behavior.
 */
const passthroughPrisma = {
    /**
     * @param {(tx: any) => Promise<*>} run - Transactional callback.
     * @returns {Promise<*>}
     */
    async $transaction(run) {
        return run({});
    }
};

describe('annotations-workflow (integración de asignación de sección)', () => {
    describe('saveSentences con sectionAssignmentsRepository inyectado', () => {
        it('lanza 403 si no hay asignación activa para la sección', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentsRepository: {
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() { return null; }
                }
            });

            await assert.rejects(
                () => service.saveSentences({
                    userId: 1,
                    datasetId: 5,
                    rdfId: 10,
                    sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                    sectionNumber: 2
                }),
                { message: 'Seccion no asignada al usuario.' }
            );
        });

        it('lanza 403 si la asignación activa es de otra sección', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentsRepository: {
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() {
                        return { id: 1, sectionIndex: 3, status: 'active' };
                    }
                }
            });

            await assert.rejects(
                () => service.saveSentences({
                    userId: 1,
                    datasetId: 5,
                    rdfId: 10,
                    sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                    sectionNumber: 2
                }),
                { message: 'Seccion no asignada al usuario.' }
            );
        });

        it('guarda correctamente cuando la asignación coincide', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentsRepository: {
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() {
                        return { id: 1, sectionIndex: 2, status: 'active' };
                    }
                },
                prismaClient: passthroughPrisma
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                sectionNumber: 2
            });

            assert.equal(result.entryId, 10);
            assert.equal(result.datasetId, 5);
            assert.equal(result.sectionCompleted, false);
        });

        it('omite la validación de asignación si no hay sectionNumber', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentsRepository: {
                    /**
                     * Gets active assignment from the corresponding source.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async findActiveAssignment() { return null; }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: [{ sentence: 'Hola.', rejectionReason: null }]
            });

            assert.equal(result.entryId, 10);
        });
    });

    describe('saveSentences con sectionAssignmentService inyectado', () => {
        it('propaga sectionCompleted=true cuando el servicio lo confirma', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentService: {
                    /**
                     * Asynchronously runs the logic of complete assignment if section done.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async completeAssignmentIfSectionDone() { return true; }
                },
                prismaClient: passthroughPrisma
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                sectionNumber: 1
            });

            assert.equal(result.sectionCompleted, true);
        });

        it('propaga sectionCompleted=false cuando quedan entries por anotar', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentService: {
                    /**
                     * Asynchronously runs the logic of complete assignment if section done.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async completeAssignmentIfSectionDone() { return false; }
                },
                prismaClient: passthroughPrisma
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                sectionNumber: 1
            });

            assert.equal(result.sectionCompleted, false);
        });

        it('propaga el error del sectionAssignmentService y revierte la transacción de cierre', async () => {
            const failure = new Error('Error inesperado');
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentService: {
                    /**
                     * Asynchronously runs the logic of complete assignment if section done.
                     * @returns {Promise<*>} Result produced by the function.
                     */
                    async completeAssignmentIfSectionDone() {
                        throw failure;
                    }
                },
                prismaClient: passthroughPrisma
            });

            await assert.rejects(
                () => service.saveSentences({
                    userId: 1,
                    datasetId: 5,
                    rdfId: 10,
                    sentences: [{ sentence: 'Hola.', rejectionReason: null }],
                    sectionNumber: 1
                }),
                failure
            );
        });
    });
});
