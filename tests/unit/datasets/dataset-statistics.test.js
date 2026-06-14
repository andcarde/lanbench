'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsStatisticsService } = require('../../../services/datasets-statistics-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('dataset statistics', () => {
    it('calcula rankings, porcentajes truncados, tiempo medio y precision', async () => {
        const service = createDatasetsStatisticsService({
            datasetsRepository: {
                async findAccessibleById() {
                    return {
                        id: 5,
                        name: 'Dataset 5',
                        totalEntries: 3,
                        languages: '["Spanish"]',
                        sectionsCompleted: 0,
                        sectionsInReview: 0,
                        sectionsPending: 1,
                        colorClass: 'dataset-blue'
                    };
                }
            },
            datasetsStatisticsRepository: {
                async findDatasetStatisticsGraph() {
                    return {
                        id: 5,
                        name: 'Dataset 5',
                        totalEntries: 3,
                        sectionAssignments: [
                            { userId: 10, timeSpentSeconds: 125 }
                        ],
                        entries: [
                            {
                                id: 1,
                                annotations: [
                                    { userId: 10, isAcceptedFirstTry: true, user: { email: 'ana@example.com' } }
                                ],
                                reviews: [
                                    {
                                        reviewerId: 20,
                                        status: 'completed',
                                        timeSpentSeconds: 90,
                                        reviewer: { email: 'rev@example.com' },
                                        comments: []
                                    }
                                ]
                            },
                            {
                                id: 2,
                                annotations: [
                                    { userId: 10, isAcceptedFirstTry: false, user: { email: 'ana@example.com' } }
                                ],
                                reviews: [
                                    {
                                        reviewerId: 20,
                                        status: 'disputed',
                                        timeSpentSeconds: 50,
                                        reviewer: { email: 'rev@example.com' },
                                        comments: [{ isAcceptedFirstTry: false }]
                                    }
                                ]
                            },
                            {
                                id: 3,
                                annotations: [
                                    { userId: 11, isAcceptedFirstTry: true, user: { email: 'bea@example.com' } }
                                ],
                                reviews: []
                            }
                        ]
                    };
                }
            }
        });

        const stats = await service.getDatasetStatistics(99, 5);

        assert.deepEqual(stats.annotation, [
            {
                userId: 10,
                email: 'ana@example.com',
                totalEntries: 2,
                datasetPercent: '66.66%',
                averageTime: '1m 02s',
                precision: '50.00%'
            },
            {
                userId: 11,
                email: 'bea@example.com',
                totalEntries: 1,
                datasetPercent: '33.33%',
                averageTime: '-',
                precision: '100.00%'
            }
        ]);

        assert.deepEqual(stats.review, [{
            userId: 20,
            email: 'rev@example.com',
            totalEntries: 2,
            datasetPercent: '66.66%',
            averageTime: '1m 10s',
            precision: '50.00%'
        }]);

        // Dataset-wide weighted general averages (Σ seconds ÷ Σ tasks):
        //   annotation: 125s over 3 annotated entries -> 41s
        //   review:     (90 + 50)s over 2 reviews      -> 1m 10s
        assert.equal(stats.annotationAverage, '41s');
        assert.equal(stats.reviewAverage, '1m 10s');
    });

    it('omite reviewRounds cuando hasAdditionalReviews es false', async () => {
        const service = createDatasetsStatisticsService({
            datasetsRepository: { async findAccessibleById() { return { id: 1 }; } },
            datasetsStatisticsRepository: {
                async findDatasetStatisticsGraph() {
                    return {
                        id: 1, name: 'D', totalEntries: 2,
                        hasAdditionalReviews: false,
                        sectionAssignments: [],
                        entries: [
                            { id: 1, annotations: [], reviews: [{ reviewerId: 1, status: 'completed', timeSpentSeconds: 0, reviewer: { email: 'r@e' }, comments: [] }] }
                        ]
                    };
                }
            }
        });

        const stats = await service.getDatasetStatistics(99, 1);
        assert.equal(stats.reviewRounds, null);
    });

    it('omite reviewRounds cuando ninguna entry tiene revisión terminal', async () => {
        const service = createDatasetsStatisticsService({
            datasetsRepository: { async findAccessibleById() { return { id: 1 }; } },
            datasetsStatisticsRepository: {
                async findDatasetStatisticsGraph() {
                    return {
                        id: 1, name: 'D', totalEntries: 2,
                        hasAdditionalReviews: true,
                        sectionAssignments: [],
                        entries: [
                            { id: 1, annotations: [], reviews: [] },
                            { id: 2, annotations: [], reviews: [{ reviewerId: 1, status: 'pending', timeSpentSeconds: 0, reviewer: { email: 'r@e' }, comments: [] }] }
                        ]
                    };
                }
            }
        });

        const stats = await service.getDatasetStatistics(99, 1);
        assert.equal(stats.reviewRounds, null);
    });

    it('agrega histograma y media de rondas por entry para datasets con consenso', async () => {
        const service = createDatasetsStatisticsService({
            datasetsRepository: { async findAccessibleById() { return { id: 1 }; } },
            datasetsStatisticsRepository: {
                async findDatasetStatisticsGraph() {
                    /** Builds N terminal reviews on a given entry. */
                    const terminalReviews = (n) => Array.from({ length: n }, (_v, i) => ({
                        reviewerId: 100 + i,
                        status: i % 2 === 0 ? 'completed' : 'disputed',
                        roundIndex: i,
                        cleanRound: i === n - 1,
                        timeSpentSeconds: 60,
                        reviewer: { email: `r${i}@e` },
                        comments: []
                    }));
                    return {
                        id: 1, name: 'D', totalEntries: 6,
                        hasAdditionalReviews: true,
                        sectionAssignments: [],
                        entries: [
                            { id: 1, annotations: [], reviews: terminalReviews(1) },   // 1 round
                            { id: 2, annotations: [], reviews: terminalReviews(1) },   // 1 round
                            { id: 3, annotations: [], reviews: terminalReviews(2) },   // 2 rounds
                            { id: 4, annotations: [], reviews: terminalReviews(3) },   // 3 rounds
                            { id: 5, annotations: [], reviews: [] },                    // skipped (no terminal)
                            { id: 6, annotations: [], reviews: terminalReviews(1) }    // 1 round
                        ]
                    };
                }
            }
        });

        const stats = await service.getDatasetStatistics(99, 1);
        // (1 + 1 + 2 + 3 + 1) / 5 = 1.60
        assert.equal(stats.reviewRounds.averageRoundsPerEntry, '1.60');
        assert.deepEqual(stats.reviewRounds.histogram, [
            { rounds: 1, entryCount: 3 },
            { rounds: 2, entryCount: 1 },
            { rounds: 3, entryCount: 1 }
        ]);
    });

    it('trunca porcentajes sin redondear', async () => {
        const service = createDatasetsStatisticsService({
            datasetsRepository: {
                async findAccessibleById() {
                    return {
                        id: 5,
                        name: 'Dataset 5',
                        totalEntries: 10000,
                        sectionsCompleted: 0,
                        sectionsInReview: 0,
                        sectionsPending: 1000
                    };
                }
            },
            datasetsStatisticsRepository: {
                async findDatasetStatisticsGraph() {
                    return {
                        id: 5,
                        name: 'Dataset 5',
                        totalEntries: 10000,
                        sectionAssignments: [],
                        entries: Array.from({ length: 9999 }, (_value, index) => ({
                            entryId: index + 1,
                            annotations: [{
                                userId: 10,
                                isAcceptedFirstTry: true,
                                user: { email: 'ana@example.com' }
                            }],
                            reviews: []
                        }))
                    };
                }
            }
        });

        const stats = await service.getDatasetStatistics(99, 5);

        assert.equal(stats.annotation[0].datasetPercent, '99.99%');
    });
});
