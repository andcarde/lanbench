'use strict';

/**
 * @file Application configuration.
 *
 * Loads `.env` (if present) without overwriting variables already set in the
 * process environment, then exports a frozen-shape `config` object with all
 * values normalised to safe defaults. Every consumer should `require` this
 * module rather than reading `process.env` directly, so that defaults and
 * coercions live in one place.
 */

const { randomBytes } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { trimmedOr, toBoolean } = require('./utils/validators');

loadEnvFile(resolve(__dirname, '.env'));

/**
 * MySQL/MariaDB connection configuration.
 * @typedef {Object} MysqlConfig
 * @property {string} host
 * @property {string} user
 * @property {string} password
 * @property {string} database
 * @property {number} port
 */

/**
 * Session cookie configuration.
 * @typedef {Object} SessionCookieConfig
 * @property {true} httpOnly
 * @property {boolean} secure
 * @property {'strict'|'lax'|'none'} sameSite
 */

/**
 * Session configuration.
 * @typedef {Object} SessionConfig
 * @property {string} secret
 * @property {SessionCookieConfig} cookie
 */

/**
 * Ollama provider configuration (local mode).
 * @typedef {Object} OllamaConfig
 * @property {string} host
 * @property {string} model
 * @property {number} requestTimeoutMs
 */

/**
 * Groq provider configuration (cloud mode).
 * @typedef {Object} GroqConfig
 * @property {string} apiBase
 * @property {string} model
 * @property {string} apiKey
 * @property {number} requestTimeoutMs
 */

/**
 * Global application configuration.
 * @typedef {Object} AppConfig
 * @property {MysqlConfig} mysql
 * @property {number} port
 * @property {SessionConfig} session
 * @property {'local'|'cloud'} model
 * @property {OllamaConfig} ollama
 * @property {GroqConfig} groq
 * @property {boolean} debugMode
 * @property {boolean} isProduction
 */

/** @type {AppConfig} */
const config = {
    mysql: {
        host: trimmedOr(process.env.DB_HOST, 'localhost'),
        user: trimmedOr(process.env.DB_USER, 'root'),
        password: trimmedOr(process.env.DB_PASSWORD, ''),
        database: trimmedOr(process.env.DB_NAME, 'lanbench'),
        port: normalizePositiveInteger(process.env.DB_PORT, 3306)
    },

    port: normalizePositiveInteger(process.env.PORT, 3000),

    session: {
        secret: normalizeSessionSecret(process.env.SESSION_SECRET),
        cookie: {
            httpOnly: true,
            secure: toBoolean(process.env.SESSION_COOKIE_SECURE, isProductionEnvironment()),
            sameSite: normalizeSameSite(process.env.SESSION_COOKIE_SAME_SITE, 'lax')
        }
    },

    // LLM provider selector: 'local' (Ollama) or 'cloud' (Groq).
    model: normalizeModelMode(process.env.MODEL, 'cloud'),

    ollama: {
        host: trimmedOr(process.env.OLLAMA_HOST, 'http://127.0.0.1:11434'),
        model: trimmedOr(process.env.OLLAMA_MODEL, 'llama3.2:3b'),
        requestTimeoutMs: normalizePositiveInteger(process.env.OLLAMA_TIMEOUT_MS, 30000)
    },

    groq: {
        apiBase: trimmedOr(process.env.GROQ_API_BASE, 'https://api.groq.com/openai/v1'),
        model: trimmedOr(process.env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
        apiKey: trimmedOr(process.env.GROQ_API_KEY, ''),
        requestTimeoutMs: normalizePositiveInteger(process.env.GROQ_TIMEOUT_MS, 60000)
    },

    debugMode: toBoolean(process.env.DEBUG_MODE, true),
    isProduction: isProductionEnvironment()
};

/**
 * Converts a value to a positive integer, or returns `fallback` if invalid.
 *
 * @param {string|number|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}

/**
 * Normalizes the cookie's `SameSite` attribute. Accepts `strict|lax|none`.
 *
 * @param {string|undefined} value
 * @param {'strict'|'lax'|'none'} fallback
 * @returns {'strict'|'lax'|'none'}
 */
function normalizeSameSite(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'strict' || normalized === 'lax' || normalized === 'none')
        return /** @type {'strict'|'lax'|'none'} */ (normalized);

    return fallback;
}

/**
 * Loads variables from the `.env` file into `process.env` without overwriting
 * those already defined. Accepts values in single or double quotes and skips
 * empty lines and comments (`#`).
 *
 * @param {string} filePath - Absolute path to the `.env`.
 * @returns {void}
 */
function loadEnvFile(filePath) {
    if (!existsSync(filePath))
        return;

    const content = readFileSync(filePath, 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#'))
            continue;

        const equalsIndex = line.indexOf('=');
        if (equalsIndex === -1)
            continue;

        const key = line.slice(0, equalsIndex).trim();
        if (!key || Object.hasOwn(process.env, key))
            continue;

        let value = line.slice(equalsIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            value = value.slice(1, -1);

        process.env[key] = value;
    }
}

/**
 * Normalizes the LLM model mode selector. Only `local` or `cloud` are valid;
 * any other value returns `fallback`.
 *
 * @param {string|undefined} value
 * @param {'local'|'cloud'} fallback
 * @returns {'local'|'cloud'}
 */
function normalizeModelMode(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'local' || normalized === 'cloud')
        return normalized;

    return fallback;
}

/**
 * Validates the `SESSION_SECRET`. If the variable does not have >= 32
 * characters, generates an ephemeral 64-byte secret (current process only —
 * existing sessions will be invalidated after a restart).
 *
 * @param {string|undefined} value
 * @returns {string}
 */
function normalizeSessionSecret(value) {
    if (typeof value === 'string' && value.trim().length >= 32)
        return value.trim();

    return randomBytes(64).toString('hex');
}

/**
 * Returns `true` if `NODE_ENV === 'production'` (case-insensitive).
 *
 * @returns {boolean}
 */
function isProductionEnvironment() {
    return typeof process.env.NODE_ENV === 'string'
        && process.env.NODE_ENV.trim().toLowerCase() === 'production';
}

module.exports = config;
