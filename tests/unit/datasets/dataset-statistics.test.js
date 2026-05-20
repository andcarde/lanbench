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
