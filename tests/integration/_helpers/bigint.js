'use strict';

/**
 * @file Shared helper for integration tests: recursively converts any
 * `BigInt` values returned by Prisma into `Number`. Lifted from the per-suite
 * copies tracked by AUDITORY-5 §1.12.
 */

/**
 * Recursively converts the BigInt values returned by Prisma into Number.
 * Walks arrays and plain objects without mutating the original.
 *
 * @param {*} value - Value to normalize.
 * @returns {*} Value without BigInt.
 */
function normalizeBigInts(value) {
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return value.map(normalizeBigInts);
    if (value && typeof value === 'object') {
        /** @type {Record<string, *>} */
        const result = {};
        for (const key of Object.keys(value))
            result[key] = normalizeBigInts(value[key]);
        return result;
    }
    return value;
}

module.exports = {
    normalizeBigInts
};
