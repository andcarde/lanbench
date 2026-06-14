'use strict';

/**
 * @file At-rest secret encryption for per-dataset LLM credentials (US-31).
 *
 * Provides authenticated encryption with AES-256-GCM over `node:crypto`. The
 * 32-byte key is derived with `scrypt` from a configured secret
 * (`CREDENTIALS_ENCRYPTION_KEY`, or `SESSION_SECRET` as a fallback), so the
 * operator does not have to supply an exact 32-byte value.
 *
 * Serialized format: `iv:authTag:ciphertext`, each part base64. GCM guarantees
 * that any tampering with the ciphertext or the auth tag fails on decrypt.
 *
 * If no secret is configured, encryption/decryption fails explicitly: an
 * ephemeral secret would render every stored credential unreadable after a
 * restart, so we never silently fall back to one.
 */

const { scryptSync, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const config = require('../config');

/** Fixed application salt for the scrypt key derivation (stable across restarts). */
const SCRYPT_SALT = 'lanbench:dataset-llm-credentials:v1';
/** Authenticated cipher used for the credentials at rest. */
const ALGORITHM = 'aes-256-gcm';
/** GCM nonce length in bytes (96-bit, the recommended size). */
const IV_BYTES = 12;
/** Derived key length in bytes (AES-256). */
const KEY_BYTES = 32;
/** Number of components in the serialized payload (`iv:authTag:ciphertext`). */
const PAYLOAD_PARTS = 3;

/**
 * Builds a secret-crypto instance. An explicit `secret` wins; otherwise the
 * configured `config.credentials.encryptionKey` is used. The key is derived
 * lazily on first use, so building an instance without a configured secret does
 * not throw until an actual encrypt/decrypt is attempted.
 *
 * @param {{ secret?: string }} [options]
 * @returns {{ encryptSecret: (plain: string) => string, decryptSecret: (payload: string) => string }}
 */
function createSecretCrypto({ secret } = {}) {
    const configuredSecret = typeof secret === 'string' && secret.trim().length > 0
        ? secret.trim()
        : resolveConfiguredSecret();

    /** @type {Buffer|null} */
    let derivedKey = null;

    /**
     * Derives (and caches) the AES key, failing explicitly if no secret exists.
     * @returns {Buffer} 32-byte key.
     */
    function resolveKey() {
        if (!configuredSecret)
            throw new Error('No hay secreto de cifrado configurado: define CREDENTIALS_ENCRYPTION_KEY (o SESSION_SECRET) para almacenar credenciales.');

        if (!derivedKey)
            derivedKey = scryptSync(configuredSecret, SCRYPT_SALT, KEY_BYTES);

        return derivedKey;
    }

    /**
     * Encrypts a non-empty string and returns the serialized payload.
     * @param {string} plain - Clear secret (e.g. the API key).
     * @returns {string} `iv:authTag:ciphertext` in base64.
     */
    function encryptSecret(plain) {
        if (typeof plain !== 'string' || plain.length === 0)
            throw new Error('encryptSecret requiere una cadena no vacía.');

        const key = resolveKey();
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv(ALGORITHM, key, iv);
        const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return [
            iv.toString('base64'),
            authTag.toString('base64'),
            ciphertext.toString('base64')
        ].join(':');
    }

    /**
     * Decrypts a payload produced by {@link encryptSecret}. Throws if the
     * payload is malformed or has been tampered with (GCM authentication).
     * @param {string} payload - `iv:authTag:ciphertext` in base64.
     * @returns {string} The clear secret.
     */
    function decryptSecret(payload) {
        if (typeof payload !== 'string')
            throw new Error('decryptSecret requiere una cadena.');

        const parts = payload.split(':');
        if (parts.length !== PAYLOAD_PARTS)
            throw new Error('Formato de secreto cifrado inválido.');

        const key = resolveKey();
        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const ciphertext = Buffer.from(parts[2], 'base64');

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plain.toString('utf8');
    }

    return { encryptSecret, decryptSecret };
}

/**
 * Resolves the configured encryption secret from `config`. Empty string when
 * neither `CREDENTIALS_ENCRYPTION_KEY` nor `SESSION_SECRET` was provided.
 * @returns {string} The configured secret, or `''`.
 */
function resolveConfiguredSecret() {
    return (config.credentials && config.credentials.encryptionKey) || '';
}

/** @type {ReturnType<typeof createSecretCrypto>|null} */
let defaultInstance = null;

/**
 * Lazily builds the default instance backed by the application config.
 * @returns {ReturnType<typeof createSecretCrypto>} Default crypto instance.
 */
function getDefaultInstance() {
    if (!defaultInstance)
        defaultInstance = createSecretCrypto();
    return defaultInstance;
}

/**
 * Default {@link createSecretCrypto} `encryptSecret`, backed by `config`.
 * @param {string} plain - Clear secret.
 * @returns {string} Serialized payload.
 */
function encryptSecret(plain) {
    return getDefaultInstance().encryptSecret(plain);
}

/**
 * Default {@link createSecretCrypto} `decryptSecret`, backed by `config`.
 * @param {string} payload - Serialized payload.
 * @returns {string} Clear secret.
 */
function decryptSecret(payload) {
    return getDefaultInstance().decryptSecret(payload);
}

module.exports = {
    createSecretCrypto,
    encryptSecret,
    decryptSecret
};
