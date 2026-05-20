'use strict';

/**
 * @file Repository for the `RegisterCode` table.
 *
 * Register codes are single-use strings that allow registering users. The
 * only way to "use" them is to delete the row atomically — that is why
 * `consumeCode` swallows the `P2025` ("record not found") as `false` instead
 * of propagating it.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 */

const defaultPrisma = require('../prisma/client');

/**
 * Builds the `RegisterCode` repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 * @returns {{
 *   insertCodes: (codes: string[]) => Promise<string[]>,
 *   consumeCode: (code: string) => Promise<boolean>
 * }}
 */
function createRegisterCodesRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Inserts a list of codes within a single transaction. Each row is created
     * with `prisma.registerCode.create` (not `createMany`) so that a duplicate
     * aborts the whole batch.
     *
     * @param {string[]} codes
     * @returns {Promise<string[]>} The same persisted codes (safe copy).
     * @throws {TypeError} If `codes` is not an array.
     */
    async function insertCodes(codes) {
        if (!Array.isArray(codes))
            throw new TypeError('register-codes-repository: codes must be an array.');

        const operations = codes.map(code => deps.prisma.registerCode.create({
            data: { code }
        }));

        await deps.prisma.$transaction(operations);
        return codes.slice();
    }

    /**
     * Consumes (deletes) a code atomically.
     *
     * @param {string} code
     * @returns {Promise<boolean>} `true` if the code existed and was deleted;
     *   `false` if it did not exist.
     * @throws Any error other than `P2025` is propagated.
     */
    async function consumeCode(code) {
        try {
            await deps.prisma.registerCode.delete({ where: { code } });
            return true;
        } catch (error) {
            if (/** @type {*} */ (error)?.code === 'P2025')
                return false;
            throw error;
        }
    }

    return {
        insertCodes,
        consumeCode
    };
}

module.exports = {
    createRegisterCodesRepository
};
