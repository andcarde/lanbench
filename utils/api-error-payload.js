'use strict';

/**
 * @file Helpers para devolver el envelope estandar de error JSON.
 *
 * Todas las APIs responden errores con la forma:
 *
 *     { error: true, message: string, code?: string, ...extra }
 *
 * Centralizar el envelope aqui asegura que controllers, middlewares y rutas
 * no diverjan en la estructura, y que los 500 dejen siempre constancia en
 * `response.locals.serverErrorReason` (consumido por el request logger).
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
 * Construye el payload con el envelope estandar. `extra` se mezcla primero,
 * de forma que `error`, `message` y `code` siempre ganan.
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
 * Variante que extrae `message`/`code` de un `Error` (idealmente
 * `ServiceError`), aplicando un `fallbackMessage` si el error no aporta uno.
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
 * Responde una peticion JSON aplicando el envelope unificado. Distingue
 * 4xx vs 500 y registra `serverErrorReason` cuando aplica.
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
 * Respuesta estandar `401` para sesion ausente o invalida.
 *
 * @param {ExpressResponse} response
 * @returns {ExpressResponse}
 */
function respondUnauthenticated(response) {
    return response.status(401).json(buildApiErrorPayload(UNAUTHENTICATED_MESSAGE, UNAUTHENTICATED_CODE));
}

/**
 * Respuesta estandar `400` para payload mal formado.
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
    buildApiErrorPayloadFromError,
    respondWithApiError,
    respondUnauthenticated,
    respondInvalidPayload
};
