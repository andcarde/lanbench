'use strict';

/**
 * @file Helpers for returning the standard JSON error envelope.
 *
 * All APIs respond to errors with the shape:
 *
 *     { error: true, message: string, code?: string, ...extra }
 *
 * Centralizing the envelope here ensures that controllers, middlewares and
 * routes do not diverge in structure, and that 500s always leave a record in
 * `response.locals.serverErrorReason` (consumed by the request logger).
 *
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} ApiErrorPayload
 * @property {true} error
 * @property {string} message
 * @property {string} [code]
 */

const DEFAULT_INTERNAL_MESSAGE = 'Error interno del servidor.';
const UNAUTHENTICATED_MESSAGE = 'Sesión no válida.';
const UNAUTHENTICATED_CODE = 'unauthenticated';
const INVALID_PAYLOAD_CODE = 'invalid_payload';

/**
 * Builds the payload with the standard envelope. `extra` is merged first, so
 * that `error`, `message` and `code` always win.
 *
 * @param {string} message
 * @param {string} [code]
 * @param {Record<string, any>} [extra]
 * @returns {ApiErrorPayload & Record<string, any>}
 */
function buildApiErrorPayload(message, code, extra = {}) {
    /** @type {ApiErrorPayload} */
    const payload = {
        error: true,
        message
    };

    if (typeof code === 'string' && code.trim().length > 0)
        payload.code = code;

    return {
        ...extra,
        ...payload
    };
}

/**
 * Variant that extracts `message`/`code` from an `Error` (ideally a
 * `ServiceError`), applying a `fallbackMessage` if the error does not provide one.
 *
 * @param {(Error & { code?: string }) | null | undefined} error
 * @param {string} [fallbackMessage]
 * @param {Record<string, any>} [extra]
 * @returns {ApiErrorPayload & Record<string, any>}
 */
function buildApiErrorPayloadFromError(error, fallbackMessage = DEFAULT_INTERNAL_MESSAGE, extra = {}) {
    const message = error && typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message
        : fallbackMessage;
    const code = error && typeof error.code === 'string'
        ? error.code
        : undefined;

    return buildApiErrorPayload(message, code, extra);
}

/**
 * Responds to a JSON request applying the unified envelope. Distinguishes
 * 4xx vs 500 and records `serverErrorReason` when applicable.
 *
 * @param {ExpressResponse} response
 * @param {(Error & { status?: number, code?: string }) | null | undefined} error
 * @param {string} [fallbackMessage]
 * @returns {ExpressResponse}
 */
function respondWithApiError(response, error, fallbackMessage = DEFAULT_INTERNAL_MESSAGE) {
    if (error && Number.isInteger(error.status) && /** @type {number} */ (error.status) >= 400 && /** @type {number} */ (error.status) < 500)
        return response.status(/** @type {number} */ (error.status)).json(buildApiErrorPayloadFromError(error, fallbackMessage));

    response.locals.serverErrorReason = error?.message
        ? error.message
        : fallbackMessage;

    return response.status(500).json(buildApiErrorPayloadFromError(error, fallbackMessage));
}

/**
 * Standard `401` response for an absent or invalid session.
 *
 * @param {ExpressResponse} response
 * @returns {ExpressResponse}
 */
function respondUnauthenticated(response) {
    return response.status(401).json(buildApiErrorPayload(UNAUTHENTICATED_MESSAGE, UNAUTHENTICATED_CODE));
}

/**
 * Standard `400` response for a malformed payload.
 *
 * @param {ExpressResponse} response
 * @param {string} message
 * @returns {ExpressResponse}
 */
function respondInvalidPayload(response, message) {
    return response.status(400).json(buildApiErrorPayload(message, INVALID_PAYLOAD_CODE));
}

module.exports = {
    buildApiErrorPayload,
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
};
