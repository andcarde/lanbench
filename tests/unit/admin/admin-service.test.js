'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAdminService } = require('../../../services/admin-service');
const { ServiceError } = require('../../../services/service-error');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('admin-service (E5)', () => {
    it('calcula resumen administrativo normalizado de datasets', async () => {
        const service = createAdminService({
            datasetsRepository: {
                /**
                 * Gets admin dataset summaries from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findAdminDatasetSummaries() {
                    return [{
                        id: 3,
                        name: 'Dataset E5',
                        totalEntries: 100,
                        reservedEntries: 80,
                        annotatedEntries: 60,
                        reviewedEntries: 40,
                        disputedEntries: 1,
                        activeAssignments: 1,
                        sectionsCompleted: 4,
                        sectionsInReview: 2,
                        sectionsPending: 4,
                        isReviewEnabled: true,
                        updatedAt: '2026-04-25T10:00:00.000Z'
                    }];
                }
            },
            evaluationCriteriaRepository: fakeCriteriaRepository()
        });

        const summaries = await service.listDatasetSummaries();

        assert.deepEqual(summaries, [{
            datasetId: 3,
            name: 'Dataset E5',
            totalEntries: 100,
            reservedEntries: 80,
            annotatedEntries: 60,
            reviewedEntries: 40,
            disputedEntries: 1,
            activeAssignments: 1,
            progress: {
                completed: 40,
                withoutReview: 20,
                remaining: 40
            },
            updatedAt: '2026-04-25T10:00:00.000Z'
        }]);
    });

    it('exporta avances reales en JSON incluyendo anotaciones y decisiones', async () => {
        const service = createAdminService({
            now: () => new Date('2026-04-25T11:00:00.000Z'),
            datasetsRepository: {
                /**
                 * Gets dataset export graph by id from the corresponding source.
                 * @param {*} datasetId - Value of datasetId used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findDatasetExportGraphById(datasetId) {
                    assert.equal(datasetId, 8);
                    return exportGraphFixture();
                }
            },
            evaluationCriteriaRepository: fakeCriteriaRepository()
        });

        const exported = await service.exportDatasetProgress(8, { format: 'json' });
        const payload = JSON.parse(exported.body);

        assert.equal(exported.contentType, 'application/json; charset=utf-8');
        assert.equal(payload.dataset.id, 8);
        assert.equal(payload.entries[0].annotations[0].sentence, 'Madrid está en España.');
        assert.equal(payload.entries[0].annotations[0].origin, 'edited');
        assert.equal(payload.entries[0].alertDecisions[0].alertCode, 'semantic_review');
        assert.equal(payload.entries[0].review, null);
    });

    it('exporta avances reales en XML simple', async () => {
        const service = createAdminService({
            now: () => new Date('2026-04-25T11:00:00.000Z'),
            datasetsRepository: {
                /**
                 * Gets dataset export graph by id from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findDatasetExportGraphById() {
                    return exportGraphFixture();
                }
            },
            evaluationCriteriaRepository: fakeCriteriaRepository()
        });

        const exported = await service.exportDatasetProgress(8, { format: 'xml' });

        assert.equal(exported.contentType, 'application/xml; charset=utf-8');
        assert.match(exported.body, /<lanbenchExport/);
        assert.match(exported.body, /Madrid está en España\./);
        assert.match(exported.body, /semantic_review/);
    });

    it('rechaza formatos de exportacion desconocidos', async () => {
        const service = createAdminService({
            datasetsRepository: {
                /**
                 * Gets dataset export graph by id from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findDatasetExportGraphById() {
                    throw new Error('No debería consultar el dataset.');
                }
            },
            evaluationCriteriaRepository: fakeCriteriaRepository()
        });

        await assert.rejects(
            () => service.exportDatasetProgress(8, /** @type {any} */ ({ format: 'zip' })),
            error => error instanceof ServiceError && error.code === 'unsupported_export_format'
        );
    });

    it('crea criterios de evaluacion validos', async () => {
        /** @type {any} */
        let captured = null;
        const service = createAdminService({
            datasetsRepository: fakeDatasetsRepository(),
            evaluationCriteriaRepository: {
                /**
                 * Gets many from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findMany() {
                    return [];
                },
                /**
                 * Creates a criterion with the received configuration.
                 * @param {*} data - Value of data used by the function.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async create(data) {
                    captured = data;
                    return {
                        id: 1,
                        ...data,
                        active: true,
                        version: 1,
                        createdAt: '2026-04-25T12:00:00.000Z',
                        updatedAt: '2026-04-25T12:00:00.000Z'
                    };
                }
            }
        });

        const criterion = await service.createEvaluationCriterion({
            key: 'fluency',
            label: 'Fluidez',
            sortOrder: 2
        });

        assert.deepEqual(captured, {
            key: 'fluency',
            label: 'Fluidez',
            sortOrder: 2
        });
        assert.equal(criterion.version, 1);
    });

    it('actualizar un criterio delega versionado al repositorio', async () => {
        /** @type {any} */
        let captured = null;
        const service = createAdminService({
            datasetsRepository: fakeDatasetsRepository(),
            evaluationCriteriaRepository: {
                /**
                 * Gets many from the corresponding source.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async findMany() {
                    return [];
                },
                /**
                 * Creates a criterion with the received configuration.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async create() {
                    throw new Error('No debería crear.');
                },
                /**
                 * Updates update with the given data.
                 * @param {*} id - Value of id used by the function.
                 * @param {*} data - Value of data used by the function.
                 */
                async update(id, data) {
                    captured = { id, data };
                    return {
                        id,
                        key: 'fluency',
                        label: data.label,
                        description: null,
                        sortOrder: 1,
                        active: true,
                        version: 2,
                        createdAt: '2026-04-25T12:00:00.000Z',
                        updatedAt: '2026-04-25T12:10:00.000Z'
                    };
                }
            }
        });

        const criterion = await service.updateEvaluationCriterion(4, { label: 'Fluidez revisada' });

        assert.deepEqual(captured, {
            id: 4,
            data: { label: 'Fluidez revisada' }
        });
        assert.equal(criterion.version, 2);
    });

    it('rechaza criterios con clave vacia o invalida', async () => {
        const service = createAdminService({
            datasetsRepository: fakeDatasetsRepository(),
            evaluationCriteriaRepository: fakeCriteriaRepository()
        });

        await assert.rejects(
            () => service.createEvaluationCriterion({ key: '1-invalid', label: 'Naturalidad' }),
            error => error instanceof ServiceError && error.code === 'invalid_criterion_key'
        );
    });
});

/**
 * Runs the logic of the export graph fixture.
 * @returns {*} Result produced by the function.
 */
function exportGraphFixture() {
    return {
        id: 8,
        name: 'Dataset Export',
        totalEntries: 1,
        sectionsCompleted: 1,
        sectionsInReview: 0,
        sectionsPending: 0,
        isReviewEnabled: false,
        entries: [{
            id: 12,
            eid: 1,
            category: 'City',
            size: 1,
            status: 'annotated',
            triplesets: [{
                type: 'original',
                triples: [{
                    subject: 'Madrid',
                    predicate: 'country',
                    object: 'Spain',
                    position: 0
                }]
            }],
            lexes: [{
                lid: 'Id1',
                lang: 'en',
                text: 'Madrid is in Spain.',
                comment: ''
            }],
            annotations: [{
                entryId: 12,
                datasetId: 8,
                id: 7,
                user: { id: 7, email: 'ann@example.com' },
                sentenceIndex: 0,
                sentence: 'Madrid está en España.',
                origin: 'edited',
                rejectionReason: 'La sugerencia era literal.',
                createdAt: '2026-04-25T10:00:00.000Z',
                updatedAt: '2026-04-25T10:05:00.000Z'
            }],
            alertDecisions: [{
                id: 6,
                userId: 7,
                user: { id: 7, email: 'ann@example.com' },
                sentenceIndex: 0,
                alertCode: 'semantic_review',
                alertType: 'semantic',
                decision: 'rejected',
                reason: 'Correcto en contexto.',
                suggestion: 'Madrid se encuentra en España.',
                appliedSentence: 'Madrid está en España.',
                createdAt: '2026-04-25T10:03:00.000Z'
            }]
        }]
    };
}

/**
 * Runs the logic of the fake datasets repository.
 * @returns {*} Result produced by the function.
 */
function fakeDatasetsRepository() {
    return {
        /**
         * Gets admin dataset summaries from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findAdminDatasetSummaries() {
            return [];
        },
        /**
         * Gets dataset export graph by id from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findDatasetExportGraphById() {
            return null;
        }
    };
}

/**
 * Runs the logic of the fake criteria repository.
 * @returns {*} Result produced by the function.
 */
function fakeCriteriaRepository() {
    return {
        /**
         * Gets many from the corresponding source.
         * @returns {Promise<*>} Result produced by the function.
         */
        async findMany() {
            return [];
        },
        /**
         * Creates a criterion with the received configuration.
         * @param {*} data - Value of data used by the function.
         * @returns {Promise<*>} Result produced by the function.
         */
        async create(data) {
            return {
                id: 1,
                ...data,
                version: 1,
                active: data.active !== false,
                createdAt: '2026-04-25T12:00:00.000Z',
                updatedAt: '2026-04-25T12:00:00.000Z'
            };
        },
        /**
         * Updates update with the given data.
         * @param {*} id - Value of id used by the function.
         * @param {*} data - Value of data used by the function.
         */
        async update(id, data) {
            return {
                id,
                key: 'criterion',
                label: data.label || 'Criterion',
                description: null,
                sortOrder: data.sortOrder || 0,
                active: data.active !== false,
                version: 2,
                createdAt: '2026-04-25T12:00:00.000Z',
                updatedAt: '2026-04-25T12:00:00.000Z'
            };
        }
    };
}
