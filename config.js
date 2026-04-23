
// config.js
'use strict';

const { randomBytes } = require('node:crypto');

const config = {
    // MySQL
    mysql: {
        host: normalizeString(process.env.DB_HOST, 'localhost'),
        user: normalizeString(process.env.DB_USER, 'root'),
        password: normalizeString(process.env.DB_PASSWORD, ''),
        database: normalizeString(process.env.DB_NAME, 'lanbench'),
        port: normalizePositiveInteger(process.env.DB_PORT, 3306)
    },

    // Server Port
    port: normalizePositiveInteger(process.env.PORT, 3000),

    // Session
    session: {
        secret: normalizeSessionSecret(process.env.SESSION_SECRET),
        cookie: {
            httpOnly: true,
            secure: normalizeBoolean(process.env.SESSION_COOKIE_SECURE, isProductionEnvironment()),
            sameSite: normalizeSameSite(process.env.SESSION_COOKIE_SAME_SITE, 'lax')
        }
    },

    // Ollama
    ollama: {
        host: normalizeString(process.env.OLLAMA_HOST, 'http://127.0.0.1:11434'),
        model: normalizeString(process.env.OLLAMA_MODEL, 'llama3.2:3b'),
        requestTimeoutMs: normalizePositiveInteger(process.env.OLLAMA_TIMEOUT_MS, 30000)
    },

    debugMode: normalizeBoolean(process.env.DEBUG_MODE, true),
    isProduction: isProductionEnvironment()
}

function normalizeString(value, fallback) {
    if (typeof value === 'string' && value.trim().length > 0)
        return value.trim();
    return fallback;
}

function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return fallback;
    return parsed;
}

function normalizeBoolean(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes')
        return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no')
        return false;

    return fallback;
}

function normalizeSameSite(value, fallback) {
    if (typeof value !== 'string')
        return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'strict' || normalized === 'lax' || normalized === 'none')
        return normalized;

    return fallback;
}

function normalizeSessionSecret(value) {
    if (typeof value === 'string' && value.trim().length >= 32)
        return value.trim();

    return randomBytes(64).toString('hex');
}

function isProductionEnvironment() {
    return typeof process.env.NODE_ENV === 'string'
        && process.env.NODE_ENV.trim().toLowerCase() === 'production';
}

module.exports = config;
