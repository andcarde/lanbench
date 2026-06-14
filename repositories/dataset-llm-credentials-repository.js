'use strict';

/**
 * @file Repository for the `DatasetLlmCredential` table — per-dataset LLM
 * credentials (US-31).
 *
 * Enforces the data-access invariants the service relies on:
 *   - uniqueness `(datasetId, provider)` via `upsertByProvider`;
 *   - "at most one active per dataset" via `setActive` inside a transaction.
 *
 * Metadata-only reads (`listByDataset`) never project `apiKeyCipher`; the
 * internal reads (`findActiveByDataset`, `findByProvider`) do include it so the
 * service can decrypt the key.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} CredentialMetadataRow
 * @property {number} id
 * @property {number} datasetId
 * @property {string} provider
 * @property {string|null} apiBase
 * @property {string} model
 * @property {string} keyLast4
 * @property {boolean} isActive
 */

const defaultPrisma = require('../prisma/client');

/** Columns returned to the outside (never the cipher). */
const METADATA_SELECT = {
    id: true,
    datasetId: true,
    provider: true,
    apiBase: true,
    model: true,
    keyLast4: true,
    isActive: true
};

/**
 * Builds the dataset-LLM-credentials repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetLlmCredentialsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Creates or updates the credential for `(datasetId, provider)`. The active
     * flag is honoured on create (defaults to inactive) and left untouched on
     * update, so re-saving a provider's key does not silently (de)activate it.
     *
     * @param {{ datasetId:number, provider:string, apiBase:string|null, model:string, apiKeyCipher:string, keyLast4:string }} payload
     * @returns {Promise<CredentialMetadataRow>}
     */
    async function upsertByProvider({ datasetId, provider, apiBase, model, apiKeyCipher, keyLast4 }) {
        return deps.prisma.datasetLlmCredential.upsert({
            where: { datasetId_provider: { datasetId, provider } },
            create: {
                datasetId,
                provider,
                apiBase: apiBase || null,
                model,
                apiKeyCipher,
                keyLast4,
                isActive: false
            },
            update: {
                apiBase: apiBase || null,
                model,
                apiKeyCipher,
                keyLast4
            },
            select: METADATA_SELECT
        });
    }

    /**
     * Lists every credential of a dataset (metadata only, no cipher).
     *
     * @param {number} datasetId
     * @returns {Promise<CredentialMetadataRow[]>}
     */
    async function listByDataset(datasetId) {
        return deps.prisma.datasetLlmCredential.findMany({
            where: { datasetId },
            orderBy: { provider: 'asc' },
            select: METADATA_SELECT
        });
    }

    /**
     * Returns the active credential of a dataset including `apiKeyCipher` for
     * internal use, or `null` if there is none active.
     *
     * @param {number} datasetId
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findActiveByDataset(datasetId) {
        return deps.prisma.datasetLlmCredential.findFirst({
            where: { datasetId, isActive: true }
        });
    }

    /**
     * Returns a specific credential including `apiKeyCipher` for internal use
     * (e.g. the "check" action), or `null`.
     *
     * @param {{ datasetId:number, provider:string }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findByProvider({ datasetId, provider }) {
        return deps.prisma.datasetLlmCredential.findUnique({
            where: { datasetId_provider: { datasetId, provider } }
        });
    }

    /**
     * Marks `(datasetId, provider)` as the single active credential: deactivates
     * the rest and activates the chosen one, atomically. Returns how many rows
     * were activated (0 if the provider does not exist).
     *
     * @param {{ datasetId:number, provider:string }} input
     * @returns {Promise<number>}
     */
    async function setActive({ datasetId, provider }) {
        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            await tx.datasetLlmCredential.updateMany({
                where: { datasetId },
                data: { isActive: false }
            });

            const activated = await tx.datasetLlmCredential.updateMany({
                where: { datasetId, provider },
                data: { isActive: true }
            });

            return Number(activated?.count ?? 0);
        });
    }

    /**
     * Deletes the credential for `(datasetId, provider)`.
     *
     * @param {{ datasetId:number, provider:string }} input
     * @returns {Promise<{ count: number }>}
     */
    async function deleteByProvider({ datasetId, provider }) {
        return deps.prisma.datasetLlmCredential.deleteMany({
            where: { datasetId, provider }
        });
    }

    /**
     * Reads the parent dataset's `llm_mode` (the gate for the whole panel),
     * normalised to a string. Returns `null` if the dataset does not exist.
     *
     * @param {number} datasetId
     * @returns {Promise<string|null>}
     */
    async function findDatasetLlmMode(datasetId) {
        const row = await deps.prisma.dataset.findUnique({
            where: { id: datasetId },
            select: { llmMode: true }
        });
        return row ? (row.llmMode || 'none') : null;
    }

    /**
     * Returns the subset of `datasetIds` that have at least one active
     * credential. A single batched query, used by the dataset listing to gate
     * the "Anotar" button without N+1 round-trips.
     *
     * @param {{ datasetIds: number[] }} input
     * @returns {Promise<Set<number>>}
     */
    async function findDatasetIdsWithActiveCredential({ datasetIds }) {
        const ids = (Array.isArray(datasetIds) ? datasetIds : [])
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value > 0);

        if (!ids.length)
            return new Set();

        const rows = await deps.prisma.datasetLlmCredential.findMany({
            where: { datasetId: { in: ids }, isActive: true },
            select: { datasetId: true }
        });

        return new Set(rows.map((/** @type {*} */ row) => Number(row.datasetId)));
    }

    return {
        upsertByProvider,
        listByDataset,
        findActiveByDataset,
        findByProvider,
        setActive,
        deleteByProvider,
        findDatasetLlmMode,
        findDatasetIdsWithActiveCredential
    };
}

module.exports = {
    createDatasetLlmCredentialsRepository
};
