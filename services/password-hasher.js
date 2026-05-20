'use strict';

/**
 * @file Password hasher — wrapper over `scrypt` with a self-contained textual
 * format.
 *
 * The produced hash has the form:
 *   `scrypt$<N>$<r>$<p>$<saltBase64>$<keyBase64>`
 *
 * It also accepts plain-text passwords stored by the old system and signals
 * `needsRehash` when a plain-text login should be re-hashed.
 */

const { promisify } = require('node:util');
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');

/**
 * @type {(password: string|Buffer, salt: Buffer, keylen: number, options?: import('node:crypto').ScryptOptions) => Promise<Buffer>}
 */
const scryptAsync = promisify(scrypt);

/** Prefix of the textual format used to recognize one of our own hashes. */
const HASH_PREFIX = 'scrypt';

/**
 * Default scrypt parameters. `N` is CPU cost; `r` memory cost; `p`
 * parallelism; `keyLength` the length of the final hash in bytes.
 *
 * @type {{ N:number, r:number, p:number, keyLength:number }}
 */
const DEFAULT_SCRYPT_PARAMS = {
    N: 16384,
    r: 8,
    p: 1,
    keyLength: 64
};

/**
 * Result of `verifyPassword`.
 *
 * @typedef {Object} VerifyResult
 * @property {boolean} matches      - `true` if the passwords match.
 * @property {boolean} needsRehash  - `true` if the stored hash should be regenerated.
 */

/**
 * Hashes a password with scrypt and returns it in textual format.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
    const normalizedPassword = normalizePassword(password);
    const salt = randomBytes(16);
    const derivedKey = await deriveKey(normalizedPassword, salt, DEFAULT_SCRYPT_PARAMS);

    return [
        HASH_PREFIX,
        DEFAULT_SCRYPT_PARAMS.N,
        DEFAULT_SCRYPT_PARAMS.r,
        DEFAULT_SCRYPT_PARAMS.p,
        salt.toString('base64'),
        derivedKey.toString('base64')
    ].join('$');
}

/**
 * Checks that `password` corresponds to `storedPassword` (scrypt hash or
 * legacy plain text).
 *
 * @param {string} password
 * @param {string} storedPassword
 * @returns {Promise<VerifyResult>}
 */
async function verifyPassword(password, storedPassword) {
    const normalizedPassword = normalizePassword(password);

    if (!isPasswordHash(storedPassword)) {
        const matches = safeComparePlaintext(storedPassword, normalizedPassword);
        return {
            matches,
            needsRehash: matches
        };
    }

    try {
        const parsedHash = parseStoredHash(storedPassword);
        const derivedKey = await deriveKey(
            normalizedPassword,
            parsedHash.salt,
            {
                N: parsedHash.N,
                r: parsedHash.r,
                p: parsedHash.p,
                keyLength: parsedHash.expectedKey.length
            }
        );

        if (derivedKey.length !== parsedHash.expectedKey.length)
            return { matches: false, needsRehash: false };

        return {
            matches: timingSafeEqual(derivedKey, parsedHash.expectedKey),
            needsRehash: false
        };
    } catch (error) {
        console.error('[password-hasher] verifyPassword failed:', error);
        return {
            matches: false,
            needsRehash: false
        };
    }
}

/**
 * Builds a facade with `hashPassword`/`verifyPassword`/`isPasswordHash`.
 *
 * @returns {{
 *   hashPassword: typeof hashPassword,
 *   verifyPassword: typeof verifyPassword,
 *   isPasswordHash: typeof isPasswordHash
 * }}
 */
function createPasswordHasher() {
    return {
        hashPassword,
        verifyPassword,
        isPasswordHash
    };
}

/**
 * Derives a key from `password` and `salt` with `scrypt`.
 *
 * @param {string} password
 * @param {Buffer} salt
 * @param {{ N:number, r:number, p:number, keyLength:number }} params
 * @returns {Promise<Buffer>}
 */
async function deriveKey(password, salt, params) {
    const derivedKey = await scryptAsync(password, salt, params.keyLength, {
        N: params.N,
        r: params.r,
        p: params.p
    });

    return Buffer.from(derivedKey);
}

/**
 * Returns `true` if `value` has the recognized scrypt hash form.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPasswordHash(value) {
    return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

/**
 * Parses the textual format and extracts the parameters + buffers.
 *
 * @param {string} value
 * @returns {{ N:number, r:number, p:number, salt:Buffer, expectedKey:Buffer }}
 * @throws {Error} If the format is invalid.
 */
function parseStoredHash(value) {
    const parts = String(value).split('$');
    if (parts.length !== 6 || parts[0] !== HASH_PREFIX)
        throw new Error('Stored password hash is malformed.');

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p))
        throw new Error('Stored password hash parameters are invalid.');

    return {
        N,
        r,
        p,
        salt: Buffer.from(parts[4], 'base64'),
        expectedKey: Buffer.from(parts[5], 'base64')
    };
}

/**
 * Compares two strings in constant time (defense against timing attacks).
 *
 * @param {string} storedPassword
 * @param {string} candidatePassword
 * @returns {boolean}
 */
function safeComparePlaintext(storedPassword, candidatePassword) {
    if (typeof storedPassword !== 'string')
        return false;

    const left = Buffer.from(storedPassword);
    const right = Buffer.from(candidatePassword);
    if (left.length !== right.length)
        return false;

    return timingSafeEqual(left, right);
}

/**
 * Ensures the password is a string (empty if it is not).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizePassword(value) {
    if (typeof value !== 'string')
        return '';
    return value;
}

module.exports = {
    createPasswordHasher
};
