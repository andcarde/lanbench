'use strict';

/**
 * @file Repository for the `Annotation` table.
 *
 * La tabla `Annotation` almacena una fila por (`userId`, `datasetId`,
 * `entryId`, `sentenceIndex`). Las anotaciones se reemplazan en bloque por
 * entry — nunca se aplican parches por oracion individual.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} AnnotationSentenceInput
 * @property {string} [sentence]               - Texto de la oracion.
 * @property {string|null} [rejectionReason]   - Razon de rechazo (opcional).
 * @property {number} [sentenceIndex]          - Indice explicito; si falta se usa el del array.
 *
 * @typedef {Object} AnnotationRow
 * @property {number} datasetId
 * @property {number} userId
 * @property {number} sentenceIndex
 * @property {string} sentence
 * @property {string|null} rejectionReason
 * @property {'manual'} origin
 */

const defaultPrisma = require('../prisma/client');

/**
 * Construye el repositorio de `Annotation`.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 * @returns {{
 *   replaceForAccessibleEntry: (input: { userId:number, datasetId:number, eid:number, sentences: AnnotationSentenceInput[] }) => Promise<{ entryId:number, savedCount:number }|null>,
 *   countAnnotatedEntriesByUser: (input: { userId:number, entryIds:number[] }) => Promise<number>
 * }}
 */
function createAnnotationsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Reemplaza, dentro de una transaccion, las anotaciones existentes de
     * una entry, siempre que el usuario tenga permisos sobre el dataset.
     *
     * Devuelve `{ entryId, savedCount }` cuando la operacion se aplica, o
     * `null` cuando la entry no es accesible (no existe o el usuario no
     * tiene permisos).
     *
     * @param {{ userId:number, datasetId:number, eid:number, sentences: AnnotationSentenceInput[] }} input
     * @returns {Promise<{ entryId:number, savedCount:number }|null>}
     */
    async function replaceForAccessibleEntry({ userId, datasetId, eid, sentences }) {
        const rows = buildAnnotationRows({ userId, datasetId, sentences });

        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            const entry = await tx.entry.findFirst({
                where: {
                    datasetId,
                    eid,
                    dataset: {
                        permits: {
                            some: { userId }
                        }
                    }
                },
                select: { id: true }
            });

            if (!entry)
                return null;

            await tx.annotation.deleteMany({
                where: {
                    entryId: entry.id,
                    datasetId,
                    userId
                }
            });

            if (rows.length === 0) {
                return {
                    entryId: entry.id,
                    savedCount: 0
                };
            }

            await tx.annotation.createMany({
                data: rows.map(row => ({ ...row, entryId: entry.id }))
            });

            return {
                entryId: entry.id,
                savedCount: rows.length
            };
        });
    }

    /**
     * Cuenta entries con al menos una anotacion del usuario, restringido al
     * conjunto `entryIds`.
     *
     * @param {{ userId:number, entryIds:number[] }} options
     * @returns {Promise<number>}
     */
    async function countAnnotatedEntriesByUser({ userId, entryIds }) {
        if (!Array.isArray(entryIds) || entryIds.length === 0)
            return 0;

        const rows = await deps.prisma.annotation.findMany({
            where: { entryId: { in: entryIds }, userId },
            distinct: ['entryId'],
            select: { entryId: true }
        });
        return rows.length;
    }

    return {
        replaceForAccessibleEntry,
        countAnnotatedEntriesByUser
    };
}

/**
 * Construye una fila `Annotation` por `sentenceIndex`, descartando entradas
 * sin texto. La funcion no toca BD: se exporta solo para que los tests
 * puedan validar la conversion.
 *
 * @param {{ userId:number, datasetId:number, sentences: AnnotationSentenceInput[] }} options
 * @returns {AnnotationRow[]}
 */
function buildAnnotationRows({ userId, datasetId, sentences }) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];

    return normalizedSentences
        .map((entry, index) => {
            const sentenceText = entry && typeof entry.sentence === 'string'
                ? entry.sentence
                : '';
            const rejectionReason = entry && typeof entry.rejectionReason === 'string'
                && entry.rejectionReason.trim().length > 0
                ? entry.rejectionReason.trim()
                : null;
            const sentenceIndex = entry && Number.isInteger(entry.sentenceIndex)
                ? /** @type {number} */ (entry.sentenceIndex)
                : index;

            return {
                datasetId,
                userId,
                sentenceIndex,
                sentence: sentenceText,
                rejectionReason,
                origin: /** @type {'manual'} */ ('manual')
            };
        });
}

module.exports = {
    createAnnotationsRepository,
    buildAnnotationRows
};
