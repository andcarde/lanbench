'use strict';

/**
 * @file Repository for dataset statistics queries — provides the dataset
 * graph (entries + annotations + reviews + section assignments) used by
 * `datasets-statistics-service` to compute US-21 per-user metrics.
 *
 * Sibling of [datasets-repository.js](./datasets-repository.js): split out
 * per AUDIT-4 §15 so the statistics bounded context has its own
 * repository surface.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the dataset-statistics repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetsStatisticsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Gets the minimal graph needed to compute dataset statistics
     * (annotations per user, reviews with resolutions and times).
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findDatasetStatisticsGraph({ datasetId }) {
        return deps.prisma.dataset.findUnique({
            where: { id: datasetId },
            select: {
                id: true,
                name: true,
                totalEntries: true,
                sectionAssignments: {
                    select: {
                        userId: true,
                        timeSpentSeconds: true
                    }
                },
                entries: {
                    select: {
                        id: true,
                        annotations: {
                            select: {
                                userId: true,
                                isAcceptedFirstTry: true,
                                user: {
                                    select: {
                                        id: true,
                                        email: true
                                    }
                                }
                            }
                        },
                        reviews: {
                            select: {
                                id: true,
                                reviewerId: true,
                                status: true,
                                timeSpentSeconds: true,
                                reviewer: {
                                    select: {
                                        id: true,
                                        email: true
                                    }
                                },
                                comments: {
                                    select: {
                                        isAcceptedFirstTry: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    return {
        findDatasetStatisticsGraph
    };
}

module.exports = {
    createDatasetsStatisticsRepository
};
