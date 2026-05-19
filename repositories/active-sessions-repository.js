'use strict';

/**
 * @file Repository for the `ActiveSession` table.
 *
 * Una `ActiveSession` representa el progreso (`sectionNumber` + `entryNumber`)
 * de un `userId` sobre un `datasetId` en un `mode` concreto
 * (`annotation`/`review`). La clave unica `datasetId_userId_mode` garantiza
 * que solo exista una sesion activa por triada.
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
 * Construye el repositorio de `ActiveSession`. Acepta `prisma` para inyectar
 * un cliente alternativo (tests).
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
     * Recupera la sesion activa identificada por `(datasetId, userId, mode)`.
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
     * Crea o actualiza la sesion activa para `(datasetId, userId, mode)`.
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
     * Borra la sesion activa para `(datasetId, userId, mode)`. Si la fila
     * no existe, devuelve `null` en lugar de propagar el error de Prisma.
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
