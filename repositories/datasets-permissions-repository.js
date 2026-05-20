'use strict';

/**
 * @file Repository for the `Permit` table — the join between `User` and
 * `Dataset` that grants a per-dataset role (annotator/reviewer/admin/owner).
 *
 * Sibling of [datasets-repository.js](./datasets-repository.js): split out
 * per AUDIT-4 §15 so the permissions bounded context (US-22 and the
 * `assertDatasetAdminPermission` gate used by `deleteDataset`) has its
 * own repository surface.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} PermitRow
 * @property {number} userId
 * @property {number} datasetId
 * @property {boolean} isOwned
 * @property {boolean} isAnnotator
 * @property {boolean} isReviewer
 * @property {boolean} isAdmin
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the dataset-permissions repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetsPermissionsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Retrieves the unique `Permit` for `(datasetId, userId)`, including the
     * dataset (canonical fields) and the user.
     *
     * @param {{ datasetId:number, userId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findPermitForUser({ datasetId, userId }) {
        return deps.prisma.permit.findUnique({
            where: {
                datasetId_userId: { datasetId, userId }
            },
            include: {
                dataset: {
                    select: {
                        id: true,
                        name: true,
                        llmMode: true,
                        isReviewEnabled: true,
                        hasAdditionalReviews: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Lists users with some active permission over a dataset.
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<Array<Record<string, any>>>}
     */
    async function findPermissionRowsByDataset({ datasetId }) {
        return deps.prisma.permit.findMany({
            where: {
                datasetId,
                OR: activePermissionConditions()
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isModerator: true
                    }
                }
            },
            orderBy: { userId: 'asc' }
        });
    }

    /**
     * Creates or updates a user's permissions on a dataset. Only writes the
     * booleans passed; `isOwned` is honored on `create` and never changes on
     * `update`.
     *
     * @param {{ datasetId:number, userId:number, isAnnotator?:boolean, isReviewer?:boolean, isAdmin?:boolean }} payload
     * @returns {Promise<PermitRow>}
     */
    async function upsertDatasetPermission(payload) {
        const data = {
            isAnnotator: Boolean(payload.isAnnotator),
            isReviewer: Boolean(payload.isReviewer),
            isAdmin: Boolean(payload.isAdmin)
        };

        return deps.prisma.permit.upsert({
            where: {
                datasetId_userId: {
                    datasetId: payload.datasetId,
                    userId: payload.userId
                }
            },
            create: {
                datasetId: payload.datasetId,
                userId: payload.userId,
                isOwned: false,
                ...data
            },
            update: data,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isModerator: true
                    }
                }
            }
        });
    }

    /**
     * Deletes any `Permit` for `(datasetId, userId)` (revokes access).
     *
     * @param {{ datasetId:number, userId:number }} input
     * @returns {Promise<{ count: number }>}
     */
    async function deleteDatasetPermission({ datasetId, userId }) {
        return deps.prisma.permit.deleteMany({
            where: { datasetId, userId }
        });
    }

    return {
        findPermitForUser,
        findPermissionRowsByDataset,
        upsertDatasetPermission,
        deleteDatasetPermission
    };
}

/**
 * Returns the list of OR subconditions that delimit "effective permission".
 *
 * @returns {Array<Record<string, true>>}
 */
function activePermissionConditions() {
    return [
        { isOwned: true },
        { isAnnotator: true },
        { isReviewer: true },
        { isAdmin: true }
    ];
}

module.exports = {
    createDatasetsPermissionsRepository
};
