'use strict';

/**
 * @file File-based request log middleware.
 *
 * Escribe en `logs/YYYY-MM-DD-HH.txt` el metodo, ruta y payload de cada
 * peticion con body util, y en `logs/YYYY-MM-DD-error.txt` cada respuesta
 * `500`. La escritura es asincrona y serializada por instancia (cola interna)
 * para evitar carreras entre peticiones.
 *
 * Contrato con controllers: en sus capturas de error, deben setear
 * `response.locals.serverErrorReason` con la razon original. Si falta, se
 * cae a `response.statusMessage`.
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
 * Crea el middleware de logging por fichero. Encola escrituras para evitar
 * carreras y aisla la cola por instancia, de forma que distintas
 * configuraciones (por ejemplo en tests) no compartan estado.
 *
 * @param {{ logsDirectory?: string }} [options]
 * @returns {ExpressMiddleware}
 */
function createRequestLogMiddleware({ logsDirectory = DEFAULT_LOGS_DIRECTORY } = {}) {
    /** @type {Promise<void>} */
    let writeQueue = Promise.resolve();

    /**
     * Encola una escritura `appendFile` garantizando primero que el fichero
     * existe. Devuelve la promesa de la cola.
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
            if (response.statusCode !== 500)
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
 * Acolcha un numero con ceros a la izquierda hasta `size` caracteres.
 *
 * @param {number|string} value
 * @param {number} [size]
 * @returns {string}
 */
const pad = (value, size = 2) => String(value).padStart(size, '0');

/**
 * Descompone una fecha en sus partes formateadas (string con padding).
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
 * Resuelve la ruta del fichero de log horario (`YYYY-MM-DD-HH.txt`).
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
 * Resuelve la ruta del fichero de errores diario (`YYYY-MM-DD-error.txt`).
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
 * Devuelve un timestamp legible con resolucion de milisegundos.
 *
 * @param {Date} date
 * @returns {string}
 */
const getTimestamp = (date) => {
    const parts = getDateParts(date);
    return `${parts.year}.${parts.month}.${parts.day}.${parts.hour}.${parts.minute}.${parts.second}.${parts.millisecond}`;
};

/**
 * Crea una copia del payload con campos sensibles enmascarados.
 *
 * @param {unknown} payload
 * @returns {unknown}
 */
const sanitizePayload = (payload) => {
    if (!payload || typeof payload !== 'object')
        return payload;

    const sensitive = ['password', 'passwd', 'pwd', 'token', 'authorization'];
    /** @type {any} */
    const copy = Array.isArray(payload) ? [...payload] : { ...(/** @type {object} */ (payload)) };

    for (const key of Object.keys(copy)) {
        if (sensitive.some(s => key.toLowerCase().includes(s)))
            copy[key] = '[REDACTED]';
    }

    return copy;
};

/**
 * Formatea el payload con `util.inspect` indentando con 4 espacios.
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
 * Devuelve la razon si es una cadena util, en otro caso el mensaje generico.
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
 * Determina si la peticion entrante merece ser registrada en el log horario.
 * Solo se loguean payloads `application/json` o `x-www-form-urlencoded`
 * que tengan algun campo util.
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
 * Garantiza que `logsDirectory` existe y que `filePath` contiene al menos
 * un salto de linea inicial, para que las apends posteriores no concatenen
 * al primer byte.
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
    createRequestLogMiddleware
};
