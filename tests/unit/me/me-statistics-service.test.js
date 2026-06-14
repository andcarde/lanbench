'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    createMeStatisticsService,
    buildMyStatisticsDTO
} = require('../../../services/me-statistics-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('me-statistics-service (US-14)', () => {
    describe('buildMyStatisticsDTO', () => {
        it('agrega por dataset, totales y medias (en general y por dataset)', () => {
            const dto = buildMyStatisticsDTO({
                userId: 7,
                email: 'me@lanbench.dev',
                annotatedEntries: [
                    { datasetId: 1, entryId: 10 },
                    { datasetId: 1, entryId: 11 }
                ],
                assignmentTimes: [
                    { datasetId: 1, timeSpentSeconds: 100 },
                    { datasetId: 1, timeSpentSeconds: 50 }
                ],
                reviews: [
                    { datasetId: 1, timeSpentSeconds: 120 },
                    { datasetId: 2, timeSpentSeconds: 200 },
                    { datasetId: 2, timeSpentSeconds: 100 }
                ],
                datasetNames: [
                    { id: 1, name: 'Bravo' },
                    { id: 2, name: 'Alfa' }
                ]
            });

            assert.equal(dto.user.id, 7);
            assert.equal(dto.user.email, 'me@lanbench.dev');

            // Totals.
            assert.equal(dto.totals.annotations, 2);
            assert.equal(dto.totals.reviews, 3);
            assert.equal(dto.totals.datasetsAnnotated, 1);
            assert.equal(dto.totals.datasetsReviewed, 2);
            assert.equal(dto.totals.avgAnnotationSeconds, 75);          // floor(150 / 2)
            assert.equal(dto.totals.avgReviewSeconds, 140);             // floor((120+200+100) / 3)

            // Per-dataset, sorted by name: Alfa (#2), Bravo (#1).
            assert.equal(dto.datasets.length, 2);
            assert.deepEqual(dto.datasets.map((/** @type {*} */ d) => d.datasetName), ['Alfa', 'Bravo']);

            const bravo = dto.datasets.find((/** @type {*} */ d) => d.datasetId === 1);
            assert.equal(bravo.annotations, 2);
            assert.equal(bravo.avgAnnotationSeconds, 75);
            assert.equal(bravo.reviews, 1);
            assert.equal(bravo.avgReviewSeconds, 120);

            const alfa = dto.datasets.find((/** @type {*} */ d) => d.datasetId === 2);
            assert.equal(alfa.annotations, 0);
            assert.equal(alfa.avgAnnotationSeconds, null);              // no annotations -> null
            assert.equal(alfa.reviews, 2);
            assert.equal(alfa.avgReviewSeconds, 150);                   // floor(300 / 2)
        });

        it('excluye datasets sin anotaciones ni revisiones (solo > 0)', () => {
            const dto = buildMyStatisticsDTO({
                userId: 1,
                annotatedEntries: [{ datasetId: 1, entryId: 10 }],
                // dataset 9 has only orphan section time and no tasks -> excluded.
                assignmentTimes: [{ datasetId: 9, timeSpentSeconds: 500 }],
                reviews: [],
                datasetNames: [{ id: 1, name: 'A' }, { id: 9, name: 'Z' }]
            });

            assert.deepEqual(dto.datasets.map((/** @type {*} */ d) => d.datasetId), [1]);
        });

        it('la media general de anotación ignora tiempo sin anotaciones', () => {
            const dto = buildMyStatisticsDTO({
                userId: 1,
                annotatedEntries: [{ datasetId: 1, entryId: 10 }, { datasetId: 1, entryId: 11 }],
                // dataset 9 carries section time but no annotations -> must not skew the average.
                assignmentTimes: [{ datasetId: 1, timeSpentSeconds: 200 }, { datasetId: 9, timeSpentSeconds: 9999 }],
                reviews: [],
                datasetNames: [{ id: 1, name: 'A' }]
            });

            assert.equal(dto.totals.avgAnnotationSeconds, 100);         // floor(200 / 2), not (200+9999)/2
        });

        it('devuelve estructura vacía coherente sin actividad', () => {
            const dto = buildMyStatisticsDTO({
                userId: 3,
                annotatedEntries: [],
                assignmentTimes: [],
                reviews: [],
                datasetNames: []
            });

            assert.equal(dto.totals.annotations, 0);
            assert.equal(dto.totals.reviews, 0);
            assert.equal(dto.totals.avgAnnotationSeconds, null);
            assert.equal(dto.totals.avgReviewSeconds, null);
            assert.deepEqual(dto.datasets, []);
        });
    });

    describe('getMyStatistics', () => {
        it('orquesta el repositorio y resuelve nombres de dataset', async () => {
            /** @type {number[]} */
            let requestedIds = [];
            const service = createMeStatisticsService({
                meStatisticsRepository: {
                    async findAnnotatedEntries(/** @type {*} */ userId) {
                        assert.equal(userId, 42);
                        return [{ datasetId: 4, entryId: 1 }];
                    },
                    async findSectionAssignmentTimes() { return [{ datasetId: 4, timeSpentSeconds: 60 }]; },
                    async findTerminalReviews() { return [{ datasetId: 4, timeSpentSeconds: 30 }]; },
                    async findDatasetsByIds(/** @type {*} */ ids) { requestedIds = ids; return [{ id: 4, name: 'Cuatro' }]; }
                }
            });

            const dto = await service.getMyStatistics({ userId: 42, email: 'x@y.z' });

            assert.deepEqual(requestedIds.sort(), [4]);
            assert.equal(dto.datasets.length, 1);
            assert.equal(dto.datasets[0].datasetName, 'Cuatro');
            assert.equal(dto.datasets[0].avgAnnotationSeconds, 60);
            assert.equal(dto.datasets[0].avgReviewSeconds, 30);
        });
    });
});
