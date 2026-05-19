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

loadEnvFile(resolve(__dirname, '.env'));

/**
 * Configuracion de conexion a MySQL/MariaDB.
 * @typedef {Object} MysqlConfig
 * @property {string} host
 * @property {string} user
 * @property {string} password
 * @property {string} database
 * @property {number} port
 */

/**
 * Configuracion de la cookie de sesion.
 * @typedef {Object} SessionCookieConfig
 * @property {true} httpOnly
 * @property {boolean} secure
 * @property {'strict'|'lax'|'none'} sameSite
 */

/**
 * Configuracion de la sesion.
 * @typedef {Object} SessionConfig
 * @property {string} secret
 * @property {SessionCookieConfig} cookie
 */

/**
 * Configuracion del proveedor Ollama (modo local).
 * @typedef {Object} OllamaConfig
 * @property {string} host
 * @property {string} model
 * @property {number} requestTimeoutMs
 */

/**
 * Configuracion del proveedor Groq (modo cloud).
 * @typedef {Object} GroqConfig
 * @property {string} apiBase
 * @property {string} model
 * @property {string} apiKey
 * @property {number} requestTimeoutMs
 */

/**
 * Configuracion global de la aplicacion.
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
        host: normalizeString(process.env.DB_HOST, 'localhost'),
        user: normalizeString(process.env.DB_USER, 'root'),
        password: normalizeString(process.env.DB_PASSWORD, ''),
        database: normalizeString(process.env.DB_NAME, 'lanbench'),
        port: normalizePositiveInteger(process.env.DB_PORT, 3306)
    },

    port: normalizePositiveInteger(process.env.PORT, 3000),

    session: {
        secret: normalizeSessionSecret(process.env.SESSION_SECRET),
        cookie: {
            httpOnly: true,
            secure: normalizeBoolean(process.env.SESSION_COOKIE_SECURE, isProductionEnvironment()),
            sameSite: normalizeSameSite(process.env.SESSION_COOKIE_SAME_SITE, 'lax')
        }
    },

    // Selector de proveedor LLM: 'local' (Ollama) o 'cloud' (Groq).
    model: normalizeModelMode(process.env.MODEL, 'cloud'),

    ollama: {
        host: normalizeString(process.env.OLLAMA_HOST, 'http://127.0.0.1:11434'),
        model: normalizeString(process.env.OLLAMA_MODEL, 'llama3.2:3b'),
        requestTimeoutMs: normalizePositiveInteger(process.env.OLLAMA_TIMEOUT_MS, 30000)
    },

    groq: {
        apiBase: normalizeString(process.env.GROQ_API_BASE, 'https://api.groq.com/openai/v1'),
        model: normalizeString(process.env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
        apiKey: normalizeString(process.env.GROQ_API_KEY, ''),
        requestTimeoutMs: normalizePositiveInteger(process.env.GROQ_TIMEOUT_MS, 60000)
    },

    debugMode: normalizeBoolean(process.env.DEBUG_MODE, true),
    isProduction: isProductionEnvironment()
};

/**
 * Aplica `trim()` y rechaza cadenas vacias. Devuelve el `fallback` si el
 * valor no es una cadena con contenido util.
 *
 * @param {string|undefined} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeString(value, fallback) {
    if (typeof value === 'string' && value.trim().length > 0)
        return value.trim();
    return fallback;
}

/**
 * Convierte un valor a entero positivo, o devuelve `fallback` si no es valido.
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
 * Convierte una variable de entorno textual a booleano. Acepta
 * `true|1|yes` y `false|0|no` (case-insensitive).
 *
 * @param {string|undefined} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
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

/**
 * Normaliza el atributo `SameSite` de la cookie. Acepta `strict|lax|none`.
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
 * Carga variables del fichero `.env` en `process.env` sin sobrescribir las
 * que ya estuvieran definidas. Acepta valores entre comillas simples o
 * dobles y omite lineas vacias y comentarios (`#`).
 *
 * @param {string} filePath - Ruta absoluta al `.env`.
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
 * Normaliza el selector de modo del modelo LLM. Solo `local` o `cloud` son
 * validos; cualquier otro valor devuelve `fallback`.
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
 * Valida el `SESSION_SECRET`. Si la variable no tiene >= 32 caracteres,
 * genera un secret efimero de 64 bytes (proceso actual unicamente — las
 * sesiones existentes quedaran invalidadas tras un reinicio).
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
 * Devuelve `true` si `NODE_ENV === 'production'` (case-insensitive).
 *
 * @returns {boolean}
 */
function isProductionEnvironment() {
    return typeof process.env.NODE_ENV === 'string'
        && process.env.NODE_ENV.trim().toLowerCase() === 'production';
}

module.exports = config;
