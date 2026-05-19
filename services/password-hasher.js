'use strict';

/**
 * @file Password hasher — wrapper sobre `scrypt` con un formato textual
 * autocontenido.
 *
 * El hash producido tiene la forma:
 *   `scrypt$<N>$<r>$<p>$<saltBase64>$<keyBase64>`
 *
 * Acepta tambien contrasenas en texto plano almacenadas por el sistema
 * antiguo y senala `needsRehash` cuando un login con texto plano deberia
 * ser re-hasheado.
 */

const { promisify } = require('node:util');
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');

/**
 * @type {(password: string|Buffer, salt: Buffer, keylen: number, options?: import('node:crypto').ScryptOptions) => Promise<Buffer>}
 */
const scryptAsync = promisify(scrypt);

/** Prefijo del formato textual usado para reconocer un hash propio. */
const HASH_PREFIX = 'scrypt';

/**
 * Parametros scrypt por defecto. `N` es coste CPU; `r` coste memoria; `p`
 * paralelismo; `keyLength` longitud del hash final en bytes.
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
 * Resultado de `verifyPassword`.
 *
 * @typedef {Object} VerifyResult
 * @property {boolean} matches      - `true` si las contrasenas coinciden.
 * @property {boolean} needsRehash  - `true` si el hash almacenado deberia regenerarse.
 */

/**
 * Hashea una contrasena con scrypt y la devuelve en formato textual.
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
 * Comprueba que `password` corresponde a `storedPassword` (hash scrypt o
 * texto plano legacy).
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
    } catch (_error) {
        return {
            matches: false,
            needsRehash: false
        };
    }
}

/**
 * Construye una fachada con `hashPassword`/`verifyPassword`/`isPasswordHash`.
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
 * Deriva una clave a partir de `password` y `salt` con `scrypt`.
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
 * Devuelve `true` si `value` tiene la forma reconocida del hash scrypt.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPasswordHash(value) {
    return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

/**
 * Parsea el formato textual y extrae los parametros + buffers.
 *
 * @param {string} value
 * @returns {{ N:number, r:number, p:number, salt:Buffer, expectedKey:Buffer }}
 * @throws {Error} Si el formato es invalido.
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
 * Compara dos cadenas en tiempo constante (defensa contra timing attacks).
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
 * Garantiza que la contrasena sea una cadena (vacia si no lo es).
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
