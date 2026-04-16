'use strict';

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { inspect } = require('node:util');

const LOGS_DIRECTORY = path.join(__dirname, '..', 'logs');
const DEFAULT_SERVER_ERROR_REASON = 'Error interno del servidor genérico';

let writeQueue = Promise.resolve();

const pad = (value, size = 2) => String(value).padStart(size, '0');

const getDateParts = (date) => ({
    year: String(date.getFullYear()),
    month: pad(date.getMonth() + 1),
    day: pad(date.getDate()),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
    second: pad(date.getSeconds()),
    millisecond: pad(date.getMilliseconds(), 3)
});

const getHourlyLogFilePath = (date) => {
    const parts = getDateParts(date);
    return path.join(LOGS_DIRECTORY, `${parts.year}-${parts.month}-${parts.day}-${parts.hour}.txt`);
};

const getErrorLogFilePath = (date) => {
    const parts = getDateParts(date);
    return path.join(LOGS_DIRECTORY, `${parts.year}-${parts.month}-${parts.day}-error.txt`);
};

const getTimestamp = (date) => {
    const parts = getDateParts(date);
    return `${parts.year}.${parts.month}.${parts.day}.${parts.hour}.${parts.minute}.${parts.second}.${parts.millisecond}`;
};

const formatPayload = (payload) => {
    const formattedPayload = inspect(payload, {
        depth: null,
        colors: false,
        compact: false,
        breakLength: 1
    });

    // Ajuste de sangría para acercarse al formato de ejemplo.
    return formattedPayload.replace(/^  /gm, '    ');
};

const normalizeReason = (reason) => {
    if (typeof reason === 'string' && reason.trim() !== '') {
        return reason;
    }

    return DEFAULT_SERVER_ERROR_REASON;
};

const shouldLogIncomingRequest = (request) => {
    const contentTypeHeader = request.headers['content-type'];
    const contentType = typeof contentTypeHeader === 'string'
        ? contentTypeHeader.toLowerCase()
        : '';

    const hasSupportedContentType = contentType.includes('application/json')
        || contentType.includes('application/x-www-form-urlencoded');

    if (!hasSupportedContentType || request.body == null) {
        return false;
    }

    if (typeof request.body !== 'object') {
        return true;
    }

    return Object.keys(request.body).length > 0;
};

const ensureLogFileInitialized = async (filePath) => {
    await fsPromises.mkdir(LOGS_DIRECTORY, { recursive: true });

    if (!fs.existsSync(filePath)) {
        await fsPromises.writeFile(filePath, '\n', 'utf8');
    }
};

const enqueueAppend = (filePath, content) => {
    writeQueue = writeQueue
        .then(async () => {
            await ensureLogFileInitialized(filePath);
            await fsPromises.appendFile(filePath, content, 'utf8');
        })
        .catch((error) => {
            console.error('Error escribiendo el log', error);
        });

    return writeQueue;
};

const appendIncomingRequestLog = (request) => {
    const now = new Date();
    const timestamp = getTimestamp(now);
    const route = request.originalUrl || request.url;
    const payload = formatPayload(request.body);
    const logLine = `${timestamp} ${request.method} ${route} ${payload}\n\n`;

    void enqueueAppend(getHourlyLogFilePath(now), logLine);
};

const appendServerErrorLog = (request, response) => {
    const now = new Date();
    const route = request.originalUrl || request.url;
    const reason = normalizeReason(response.locals.serverErrorReason || response.statusMessage);
    const payload = formatPayload({
        code: 500,
        reason
    });
    const logLine = `${request.method} ${route} ${payload}\n\n`;

    void enqueueAppend(getErrorLogFilePath(now), logLine);
};

const requestLogMiddleware = (request, response, next) => {
    if (shouldLogIncomingRequest(request)) {
        appendIncomingRequestLog(request);
    }

    response.on('finish', () => {
        if (response.statusCode === 500) {
            appendServerErrorLog(request, response);
        }
    });

    next();
};

module.exports = {
    requestLogMiddleware
};
