'use strict';

/**
 * @file Daily LLM request/response log.
 *
 * Writes one entry per LLM call to `logs/YYYY-MM-DD-llm.txt`:
 *   - a REQUEST block when the call is dispatched (URL, model, prompt);
 *   - a RESPONSE block when it finishes (URL, model, text, status, duration,
 *     and the same correlation id so request and response can be paired).
 *
 * Writes are queued and serialized; failures never propagate to the caller
 * (logging must not break LLM traffic).
 */

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

/** Default location for the daily log files. */
const DEFAULT_LOGS_DIRECTORY = path.join(__dirname, '..', 'logs');
/** Max characters preserved per logged text chunk (prompt and response text). */
const MAX_TEXT_LENGTH = 8000;

/** @type {Promise<void>} */
let writeQueue = Promise.resolve();
/** Current logs directory; can be overridden for tests. */
let activeLogsDirectory = DEFAULT_LOGS_DIRECTORY;
/** When `false`, all log calls become no-ops. */
let enabled = process.env.LLM_LOGS_DISABLED !== 'true';

/**
 * Overrides the directory where the daily log is written. Mostly useful for
 * tests so they can target an isolated temp directory.
 *
 * @param {string} logsDirectory - Absolute path. Created on demand.
 * @returns {void}
 */
function setLogsDirectory(logsDirectory) {
    activeLogsDirectory = logsDirectory;
}

/**
 * Enables or disables the logger globally. Useful for tests that don't want
 * to produce on-disk noise. Defaults to enabled (unless `LLM_LOGS_DISABLED=true`).
 *
 * @param {boolean} value
 * @returns {void}
 */
function setEnabled(value) {
    enabled = Boolean(value);
}

/**
 * Returns a short hex string (12 chars) that pairs a request with its
 * response in the log.
 *
 * @returns {string}
 */
function generateCorrelationId() {
    return randomBytes(6).toString('hex');
}

/**
 * Records the dispatch of an LLM request.
 *
 * @param {{
 *   correlationId: string,
 *   url: string,
 *   providerName?: string,
 *   requestBody?: string,
 *   timestamp?: Date
 * }} entry
 * @returns {void}
 */
function logLlmRequest(entry) {
    if (!enabled)
        return;

    const timestamp = entry.timestamp || new Date();
    const { model, prompt } = parseRequestBody(entry.requestBody);
    const block = formatRequestBlock({
        timestamp,
        correlationId: entry.correlationId,
        url: entry.url,
        providerName: entry.providerName || '-',
        model,
        prompt
    });

    queueAppend(timestamp, block);
}

/**
 * Records the result of an LLM call. Use `error` for transport/timeout
 * failures (no HTTP status), `status` + `bodyText` for upstream responses.
 *
 * @param {{
 *   correlationId: string,
 *   url: string,
 *   providerName?: string,
 *   requestBody?: string,
 *   status?: number,
 *   bodyText?: string,
 *   error?: string,
 *   durationMs: number,
 *   timestamp?: Date
 * }} entry
 * @returns {void}
 */
function logLlmResponse(entry) {
    if (!enabled)
        return;

    const timestamp = entry.timestamp || new Date();
    const { model } = parseRequestBody(entry.requestBody);
    const text = entry.error
        ? `(error) ${entry.error}`
        : extractResponseText(entry.bodyText);

    const block = formatResponseBlock({
        timestamp,
        correlationId: entry.correlationId,
        url: entry.url,
        providerName: entry.providerName || '-',
        model,
        status: entry.status,
        durationMs: entry.durationMs,
        text
    });

    queueAppend(timestamp, block);
}

/**
 * Extracts the model and prompt text from a JSON request body. Supports the
 * three shapes used by the app:
 *   - OpenAI-compatible: `{ model, messages: [{role, content}] }`
 *   - Anthropic:         `{ model, system?, messages: [{role, content}] }`
 *   - Ollama:            `{ model, system?, prompt }`
 *
 * @param {string|undefined} rawBody
 * @returns {{ model: string, prompt: string }}
 */
function parseRequestBody(rawBody) {
    if (typeof rawBody !== 'string' || rawBody.length === 0)
        return { model: '-', prompt: '' };

    /** @type {any} */
    let body;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return { model: '-', prompt: truncate(rawBody) };
    }

    const model = (body && typeof body.model === 'string' && body.model) || '-';
    /** @type {string[]} */
    const lines = [];

    if (typeof body?.system === 'string' && body.system.length > 0)
        lines.push(`[system] ${body.system}`);

    if (Array.isArray(body?.messages)) {
        for (const message of body.messages) {
            if (!message || typeof message !== 'object')
                continue;
            const role = typeof message.role === 'string' ? message.role : 'user';
            const content = typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content);
            lines.push(`[${role}] ${content}`);
        }
    } else if (typeof body?.prompt === 'string') {
        lines.push(`[user] ${body.prompt}`);
    }

    return { model, prompt: truncate(lines.join('\n')) };
}

/**
 * Extracts the assistant text from a response body. Falls back to the raw
 * (truncated) body if no known shape matches.
 *
 * @param {string|undefined} bodyText
 * @returns {string}
 */
function extractResponseText(bodyText) {
    if (typeof bodyText !== 'string' || bodyText.length === 0)
        return '';

    /** @type {any} */
    let payload;
    try {
        payload = JSON.parse(bodyText);
    } catch {
        return truncate(bodyText);
    }

    const openaiContent = payload?.choices?.[0]?.message?.content;
    if (typeof openaiContent === 'string')
        return truncate(openaiContent);

    if (Array.isArray(payload?.content)) {
        const text = payload.content
            .filter((/** @type {any} */ block) => block && block.type === 'text' && typeof block.text === 'string')
            .map((/** @type {any} */ block) => block.text)
            .join('');
        if (text)
            return truncate(text);
    }

    if (typeof payload?.response === 'string')
        return truncate(payload.response);

    return truncate(bodyText);
}

/**
 * Caps a string to `MAX_TEXT_LENGTH` adding a clear suffix when it overflows.
 *
 * @param {string} value
 * @returns {string}
 */
function truncate(value) {
    if (typeof value !== 'string')
        return '';
    if (value.length <= MAX_TEXT_LENGTH)
        return value;
    return `${value.slice(0, MAX_TEXT_LENGTH)}... [truncated ${value.length - MAX_TEXT_LENGTH} chars]`;
}

/**
 * Formats the REQUEST block.
 *
 * @param {{ timestamp: Date, correlationId: string, url: string, providerName: string, model: string, prompt: string }} input
 * @returns {string}
 */
function formatRequestBlock({ timestamp, correlationId, url, providerName, model, prompt }) {
    return [
        '========================================',
        `REQUEST  ${correlationId}`,
        getTimestamp(timestamp),
        `URL: ${url}`,
        `Provider: ${providerName}`,
        `Model: ${model}`,
        'Prompt:',
        indent(prompt || '(empty)'),
        ''
    ].join('\n');
}

/**
 * Formats the RESPONSE block.
 *
 * @param {{ timestamp: Date, correlationId: string, url: string, providerName: string, model: string, status?: number, durationMs: number, text: string }} input
 * @returns {string}
 */
function formatResponseBlock({ timestamp, correlationId, url, providerName, model, status, durationMs, text }) {
    return [
        '----------------------------------------',
        `RESPONSE ${correlationId}`,
        getTimestamp(timestamp),
        `URL: ${url}`,
        `Provider: ${providerName}`,
        `Model: ${model}`,
        `Status: ${typeof status === 'number' ? status : '-'}`,
        `Duration: ${durationMs} ms`,
        'Text:',
        indent(text || '(empty)'),
        ''
    ].join('\n');
}

/**
 * Indents every line with four spaces, matching the request-log format.
 *
 * @param {string} value
 * @returns {string}
 */
function indent(value) {
    return value.split('\n').map(line => `    ${line}`).join('\n');
}

/**
 * Same timestamp shape used by `request-log-middleware` for consistency.
 *
 * @param {Date} date
 * @returns {string}
 */
function getTimestamp(date) {
    const pad = (/** @type {number} */ value, /** @type {number} */ size = 2) =>
        String(value).padStart(size, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
        pad(date.getMilliseconds(), 3)
    ].join('.');
}

/**
 * Resolves the path of the daily LLM log file (`YYYY-MM-DD-llm.txt`).
 *
 * @param {string} logsDirectory
 * @param {Date} date
 * @returns {string}
 */
function getLlmLogFilePath(logsDirectory, date) {
    const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
    const fileName = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-llm.txt`;
    return path.join(logsDirectory, fileName);
}

/**
 * Queues an append to the daily log file, swallowing any error so the LLM
 * traffic is never disturbed by a logging failure.
 *
 * @param {Date} timestamp
 * @param {string} content
 * @returns {void}
 */
function queueAppend(timestamp, content) {
    const filePath = getLlmLogFilePath(activeLogsDirectory, timestamp);

    writeQueue = writeQueue
        .then(async () => {
            await fsPromises.mkdir(activeLogsDirectory, { recursive: true });
            if (!fs.existsSync(filePath))
                await fsPromises.writeFile(filePath, '\n', 'utf8');
            await fsPromises.appendFile(filePath, content, 'utf8');
        })
        .catch((error) => {
            console.error('Error escribiendo el log de LLM', error);
        });
}

/**
 * Returns the queue promise so tests can await pending writes. Internal use.
 *
 * @returns {Promise<void>}
 */
function flush() {
    return writeQueue;
}

module.exports = {
    generateCorrelationId,
    logLlmRequest,
    logLlmResponse,
    setLogsDirectory,
    setEnabled,
    flush,
    // Exposed for unit-tests:
    _internal: { parseRequestBody, extractResponseText, getLlmLogFilePath }
};
