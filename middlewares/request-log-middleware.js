'use strict';

/**
 * @file File-based request log middleware.
 *
 * Writes to `logs/YYYY-MM-DD-HH.txt` the method, route and payload of each
 * request with a useful body, and to `logs/YYYY-MM-DD-error.txt` every `500`
 * response. Writing is asynchronous and serialized per instance (internal
 * queue) to avoid races between requests.
 *
 * Contract with controllers: in their error catches, they must set
 * `response.locals.serverErrorReason` with the original reason. If missing, it
 * falls back to `response.statusMessage`.
 *
 * Handled-failure contract: some actions return HTTP 200 with an
 * `{ ok:false }` envelope (e.g. the credential "check" that catches a provider
 * failure). Those never reach a 500, so they would leave no trace. A controller
 * can opt such a response into the error log by setting
 * `response.locals.logAnomaly = true` (plus `serverErrorReason`), without
 * changing the status code it returns to the client.
 *
 * @typedef {import('express').Request}       ExpressRequest
 * @typedef {import('express').Response}      ExpressResponse
 * @typedef {import('express').NextFunction}  ExpressNext
 * @typedef {import('express').RequestHandler} ExpressMiddleware
 */

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { inspect } = require('node:util');

const DEFAULT_LOGS_DIRECTORY = path.join(__dirname, '..', 'logs');
const DEFAULT_SERVER_ERROR_REASON = 'Error interno del servidor genérico';

/**
 * Creates the file-based logging middleware. It queues writes to avoid races
 * and isolates the queue per instance, so different configurations (for
 * example in tests) do not share state.
 *
 * @param {{ logsDirectory?: string }} [options]
 * @returns {ExpressMiddleware}
 */
function createRequestLogMiddleware({ logsDirectory = DEFAULT_LOGS_DIRECTORY } = {}) {
    /** @type {Promise<void>} */
    let writeQueue = Promise.resolve();

    /**
     * Queues an `appendFile` write, first ensuring the file exists. Returns the
     * queue promise.
     *
     * @param {string} filePath
     * @param {string} content
     * @returns {Promise<void>}
     */
    const enqueueAppend = (filePath, content) => {
        writeQueue = writeQueue
            .then(async () => {
                await ensureLogFileInitialized(logsDirectory, filePath);
                await fsPromises.appendFile(filePath, content, 'utf8');
            })
            .catch((error) => {
                console.error('Error escribiendo el log', error);
            });

        return writeQueue;
    };

    return function requestLogMiddleware(request, response, next) {
        if (shouldLogIncomingRequest(request)) {
            const now = new Date();
            const route = request.originalUrl || request.url;
            const payload = formatPayload(request.body);
            const logLine = `${getTimestamp(now)} ${request.method} ${route} ${payload}\n\n`;
            void enqueueAppend(getHourlyLogFilePath(logsDirectory, now), logLine);
        }

        response.on('finish', () => {
            if (!shouldLogAsServerError(response.statusCode, response.locals))
                return;

            const now = new Date();
            const route = request.originalUrl || request.url;
            const reason = normalizeReason(response.locals.serverErrorReason || response.statusMessage);
            const payload = formatPayload({ code: 500, reason });
            const logLine = `${request.method} ${route} ${payload}\n\n`;
            void enqueueAppend(getErrorLogFilePath(logsDirectory, now), logLine);
        });

        next();
    };
}

/**
 * Decides whether a finished response must be recorded in the daily error log.
 * True for every `500`, and also for any response a controller explicitly
 * flagged as an anomaly via `response.locals.logAnomaly` (handled failures that
 * still answer 2xx — see the module contract).
 *
 * @param {number} statusCode
 * @param {Record<string, any>|null|undefined} locals
 * @returns {boolean}
 */
const shouldLogAsServerError = (statusCode, locals) =>
    statusCode === 500 || Boolean(locals && locals.logAnomaly);

/**
 * Pads a number with leading zeros up to `size` characters.
 *
 * @param {number|string} value
 * @param {number} [size]
 * @returns {string}
 */
const pad = (value, size = 2) => String(value).padStart(size, '0');

/**
 * Decomposes a date into its formatted parts (padded strings).
 *
 * @param {Date} date
 * @returns {{ year:string, month:string, day:string, hour:string, minute:string, second:string, millisecond:string }}
 */
const getDateParts = (date) => ({
    year: String(date.getFullYear()),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
    second: pad(date.getSeconds()),
    millisecond: pad(date.getMilliseconds(), 3)
});

/**
 * Resolves the path of the hourly log file (`YYYY-MM-DD-HH.txt`).
 *
 * @param {string} logsDirectory
 * @param {Date} date
 * @returns {string}
 */
const getHourlyLogFilePath = (logsDirectory, date) => {
    const parts = getDateParts(date);
    return path.join(logsDirectory, `${parts.year}-${parts.month}-${parts.day}-${parts.hour}.txt`);
};

/**
 * Resolves the path of the daily error file (`YYYY-MM-DD-error.txt`).
 *
 * @param {string} logsDirectory
 * @param {Date} date
 * @returns {string}
 */
const getErrorLogFilePath = (logsDirectory, date) => {
    const parts = getDateParts(date);
    return path.join(logsDirectory, `${parts.year}-${parts.month}-${parts.day}-error.txt`);
};

/**
 * Returns a human-readable timestamp with millisecond resolution.
 *
 * @param {Date} date
 * @returns {string}
 */
const getTimestamp = (date) => {
    const parts = getDateParts(date);
    return `${parts.year}.${parts.month}.${parts.day}.${parts.hour}.${parts.minute}.${parts.second}.${parts.millisecond}`;
};

/**
 * Creates a copy of the payload with sensitive fields masked.
 *
 * @param {unknown} payload
 * @returns {unknown}
 */
const sanitizePayload = (payload) => {
    if (!payload || typeof payload !== 'object')
        return payload;

    // Controlled substring tokens. `apikey`/`api_key`/`credential`/`secret` are
    // added for the per-dataset AI credentials (US-31). The bare `key` token is
    // intentionally NOT used, so legitimate masked fields like `keyLast4` are
    // never redacted.
    const sensitive = ['password', 'passwd', 'pwd', 'token', 'authorization', 'apikey', 'api_key', 'credential', 'secret'];
    /** @type {any} */
    const copy = Array.isArray(payload) ? [...payload] : { ...(/** @type {object} */ (payload)) };

    for (const key of Object.keys(copy)) {
        if (sensitive.some(s => key.toLowerCase().includes(s)))
            copy[key] = '[REDACTED]';
    }

    return copy;
};

/**
 * Formats the payload with `util.inspect`, indenting with 4 spaces.
 *
 * @param {unknown} payload
 * @returns {string}
 */
const formatPayload = (payload) => {
    const sanitized = sanitizePayload(payload);
    const formattedPayload = inspect(sanitized, {
        depth: null,
        colors: false,
        compact: false,
        breakLength: 1
    });

    return formattedPayload.replaceAll(/^ {2}/gm, '    ');
};

/**
 * Returns the reason if it is a useful string, otherwise the generic message.
 *
 * @param {unknown} reason
 * @returns {string}
 */
const normalizeReason = (reason) => {
    if (typeof reason === 'string' && reason.trim() !== '')
        return reason;
    return DEFAULT_SERVER_ERROR_REASON;
};

/**
 * Determines whether the incoming request deserves to be recorded in the
 * hourly log. Only `application/json` or `x-www-form-urlencoded` payloads that
 * have some useful field are logged.
 *
 * @param {ExpressRequest} request
 * @returns {boolean}
 */
const shouldLogIncomingRequest = (request) => {
    const contentTypeHeader = request.headers['content-type'];
    const contentType = typeof contentTypeHeader === 'string'
        ? contentTypeHeader.toLowerCase()
        : '';

    const hasSupportedContentType = contentType.includes('application/json')
        || contentType.includes('application/x-www-form-urlencoded');

    if (!hasSupportedContentType || request.body == null)
        return false;

    if (typeof request.body !== 'object')
        return true;

    return Object.keys(request.body).length > 0;
};

/**
 * Ensures that `logsDirectory` exists and that `filePath` contains at least an
 * initial newline, so that subsequent appends do not concatenate at the first
 * byte.
 *
 * @param {string} logsDirectory
 * @param {string} filePath
 * @returns {Promise<void>}
 */
const ensureLogFileInitialized = async (logsDirectory, filePath) => {
    await fsPromises.mkdir(logsDirectory, { recursive: true });

    if (!fs.existsSync(filePath))
        await fsPromises.writeFile(filePath, '\n', 'utf8');
};

module.exports = {
    createRequestLogMiddleware,
    sanitizePayload,
    shouldLogAsServerError
};
