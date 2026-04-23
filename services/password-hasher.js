'use strict';

const { promisify } = require('node:util');
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');

const scryptAsync = promisify(scrypt);
const HASH_PREFIX = 'scrypt';
const DEFAULT_SCRYPT_PARAMS = {
    N: 16384,
    r: 8,
    p: 1,
    keyLength: 64
};

function createPasswordHasher() {
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

    return {
        hashPassword,
        verifyPassword,
        isPasswordHash
    };
}

async function deriveKey(password, salt, params) {
    const derivedKey = await scryptAsync(password, salt, params.keyLength, {
        N: params.N,
        r: params.r,
        p: params.p
    });

    return Buffer.from(derivedKey);
}

function isPasswordHash(value) {
    return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

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

function safeComparePlaintext(storedPassword, candidatePassword) {
    if (typeof storedPassword !== 'string')
        return false;

    const left = Buffer.from(storedPassword);
    const right = Buffer.from(candidatePassword);
    if (left.length !== right.length)
        return false;

    return timingSafeEqual(left, right);
}

function normalizePassword(value) {
    if (typeof value !== 'string')
        return '';
    return value;
}

module.exports = {
    createPasswordHasher
};
