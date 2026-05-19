'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService } = require('../../../services/annotations-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Construye spanish service a partir de los datos recibidos.
 * @param {Object<string, *>} [overrides] - Valor de overrides usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildSpanishService(overrides = {}) {
    return {
        /**
         * Comprueba check y devuelve el resultado de la validacion.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async check() { return { valid: true, reason: null, suggestion: null }; },
        /**
         * Ejecuta de forma asincrona save contra la capa de persistencia o API correspondiente.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async save() { return { ok: true }; },
        ...overrides
    };
}

describe('annotations-workflow (integración de asignación de sección)', () => {
    describe('saveSentences con sectionAssignmentsRepository inyectado', () => {
        it('lanza 403 si no hay asignación activa para la sección', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentsRepository: {
                    /**
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return null; }
                }
            });

            await assert.rejects(
                () => service.saveSentences({
                    userId: 1,
                    datasetId: 5,
                    rdfId: 10,
                    sentences: ['Hola.'],
                    rejectionReasons: [null],
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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
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
                    sentences: ['Hola.'],
                    rejectionReasons: [null],
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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() {
                        return { id: 1, sectionIndex: 2, status: 'active' };
                    }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: ['Hola.'],
                rejectionReasons: [null],
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
                     * Obtiene active assignment desde la fuente correspondiente.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async findActiveAssignment() { return null; }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: ['Hola.'],
                rejectionReasons: [null]
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
                     * Ejecuta de forma asincrona la logica de complete assignment if section done.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async completeAssignmentIfSectionDone() { return true; }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: ['Hola.'],
                rejectionReasons: [null],
                sectionNumber: 1
            });

            assert.equal(result.sectionCompleted, true);
        });

        it('propaga sectionCompleted=false cuando quedan entries por anotar', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentService: {
                    /**
                     * Ejecuta de forma asincrona la logica de complete assignment if section done.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async completeAssignmentIfSectionDone() { return false; }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: ['Hola.'],
                rejectionReasons: [null],
                sectionNumber: 1
            });

            assert.equal(result.sectionCompleted, false);
        });

        it('trata errores del sectionAssignmentService como sectionCompleted=false', async () => {
            const service = createAnnotationsService({
                spanishService: buildSpanishService(),
                sectionAssignmentService: {
                    /**
                     * Ejecuta de forma asincrona la logica de complete assignment if section done.
                     * @returns {Promise<*>} Resultado producido por la funcion.
                     */
                    async completeAssignmentIfSectionDone() {
                        throw new Error('Error inesperado');
                    }
                }
            });

            const result = await service.saveSentences({
                userId: 1,
                datasetId: 5,
                rdfId: 10,
                sentences: ['Hola.'],
                rejectionReasons: [null],
                sectionNumber: 1
            });

            assert.equal(result.sectionCompleted, false);
        });
    });
});
