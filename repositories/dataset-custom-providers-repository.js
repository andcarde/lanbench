'use strict';

/**
 * @file Repository for the `DatasetCustomProvider` table — per-dataset
 * user-defined LLM providers (US-36).
 *
 * A custom provider is just a `(datasetId, name)` pair plus its base URL. The
 * built-in catalog (`constants/llm-providers.js`) is the other half of the
 * available-providers picture; the service composes both lists before exposing
 * them.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} CustomProviderRow
 * @property {number} datasetId
 * @property {string} name
 * @property {string} urlBase
 * @property {Date}   createdAt
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the dataset-custom-providers repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetCustomProvidersRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Lists every custom provider of a dataset, oldest first so the picker
     * displays them in insertion order.
     *
     * @param {number} datasetId
     * @returns {Promise<CustomProviderRow[]>}
     */
    async function listByDataset(datasetId) {
        return deps.prisma.datasetCustomProvider.findMany({
            where: { datasetId },
            orderBy: { createdAt: 'asc' }
        });
    }

    /**
     * Returns the custom provider for `(datasetId, name)`, or `null`.
     *
     * @param {{ datasetId:number, name:string }} input
     * @returns {Promise<CustomProviderRow|null>}
     */
    async function findByName({ datasetId, name }) {
        return deps.prisma.datasetCustomProvider.findUnique({
            where: { datasetId_name: { datasetId, name } }
        });
    }

    /**
     * Creates a custom provider. Lets the unique constraint surface
     * `P2002` so the service can translate it to a clean 409.
     *
     * @param {{ datasetId:number, name:string, urlBase:string }} payload
     * @returns {Promise<CustomProviderRow>}
     */
    async function create(payload) {
        return deps.prisma.datasetCustomProvider.create({
            data: {
                datasetId: payload.datasetId,
                name: payload.name,
                urlBase: payload.urlBase
            }
        });
    }

    /**
     * Deletes the custom provider `(datasetId, name)` together with any
     * credential row that references it (decision 5 of the design plan).
     *
     * @param {{ datasetId:number, name:string }} input
     * @returns {Promise<{ count:number, credentialsRemoved:number }>}
     */
    async function deleteByName({ datasetId, name }) {
        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            const credentialsRemoved = await tx.datasetLlmCredential.deleteMany({
                where: { datasetId, provider: name }
            });
            const removed = await tx.datasetCustomProvider.deleteMany({
                where: { datasetId, name }
            });
            return {
                count: Number(removed?.count ?? 0),
                credentialsRemoved: Number(credentialsRemoved?.count ?? 0)
            };
        });
    }

    return {
        listByDataset,
        findByName,
        create,
        deleteByName
    };
}

module.exports = {
    createDatasetCustomProvidersRepository
};
