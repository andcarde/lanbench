'use strict';

/**
 * @file Repository for the `ActiveSession` table.
 *
 * An `ActiveSession` represents the progress (`sectionNumber` + `entryNumber`)
 * of a `userId` over a `datasetId` in a specific `mode`
 * (`annotation`/`review`). The unique key `datasetId_userId_mode` guarantees
 * that only one active session exists per triple.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} ActiveSessionKey
 * @property {number} datasetId
 * @property {number} userId
 * @property {string} mode
 *
 * @typedef {ActiveSessionKey & { sectionNumber:number, entryNumber:number }} ActiveSessionUpsertInput
 *
 * @typedef {Object} ActiveSessionRow
 * @property {number} datasetId
 * @property {number} userId
 * @property {string} mode
 * @property {number} sectionNumber
 * @property {number} entryNumber
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the `ActiveSession` repository. Accepts `prisma` to inject an
 * alternative client (tests).
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 * @returns {{
 *   findSession: (key: ActiveSessionKey) => Promise<ActiveSessionRow|null>,
 *   upsertSession: (input: ActiveSessionUpsertInput) => Promise<ActiveSessionRow>,
 *   deleteSession: (key: ActiveSessionKey) => Promise<ActiveSessionRow|null>
 * }}
 */
function createActiveSessionsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Retrieves the active session identified by `(datasetId, userId, mode)`.
     *
     * @param {ActiveSessionKey} key
     * @returns {Promise<ActiveSessionRow|null>}
     */
    async function findSession({ datasetId, userId, mode }) {
        return deps.prisma.activeSession.findUnique({
            where: { datasetId_userId_mode: { datasetId, userId, mode } }
        });
    }

    /**
     * Creates or updates the active session for `(datasetId, userId, mode)`.
     *
     * @param {ActiveSessionUpsertInput} input
     * @returns {Promise<ActiveSessionRow>}
     */
    async function upsertSession({ datasetId, userId, mode, sectionNumber, entryNumber }) {
        return deps.prisma.activeSession.upsert({
            where: { datasetId_userId_mode: { datasetId, userId, mode } },
            create: { datasetId, userId, mode, sectionNumber, entryNumber },
            update: { sectionNumber, entryNumber }
        });
    }

    /**
     * Deletes the active session for `(datasetId, userId, mode)`. If the row
     * does not exist, returns `null` instead of propagating the Prisma error.
     *
     * @param {ActiveSessionKey} key
     * @returns {Promise<ActiveSessionRow|null>}
     */
    async function deleteSession({ datasetId, userId, mode }) {
        return deps.prisma.activeSession.delete({
            where: { datasetId_userId_mode: { datasetId, userId, mode } }
        }).catch(() => null);
    }

    return {
        findSession,
        upsertSession,
        deleteSession
    };
}

module.exports = {
    createActiveSessionsRepository
};
