'use strict';

/**
 * @file Repository for the `RegisterCode` table.
 *
 * Los codigos de registro son strings de un solo uso que permiten registrar
 * usuarios. La unica forma de "usarlos" es borrar la fila atomicamente —
 * por eso `consumeCode` traga el `P2025` ("record not found") como `false`
 * en lugar de propagarlo.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 */

const defaultPrisma = require('../prisma/client');

/**
 * Construye el repositorio de `RegisterCode`.
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
     * Inserta una lista de codigos dentro de una unica transaccion. Cada
     * fila se crea con `prisma.registerCode.create` (no `createMany`) para
     * que un duplicado aborte el lote completo.
     *
     * @param {string[]} codes
     * @returns {Promise<string[]>} Los mismos codigos persistidos (copia segura).
     * @throws {TypeError} Si `codes` no es un array.
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
     * Consume (borra) un codigo de forma atomica.
     *
     * @param {string} code
     * @returns {Promise<boolean>} `true` si el codigo existia y fue borrado;
     *   `false` si no existia.
     * @throws Cualquier error distinto a `P2025` se propaga.
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
