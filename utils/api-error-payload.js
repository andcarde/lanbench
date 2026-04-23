'use strict';

function buildApiErrorPayload(message, code, extra = {}) {
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

function buildApiErrorPayloadFromError(error, fallbackMessage = 'Error interno del servidor.', extra = {}) {
    const message = error && typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message
        : fallbackMessage;
    const code = error && typeof error.code === 'string'
        ? error.code
        : undefined;

    return buildApiErrorPayload(message, code, extra);
}

module.exports = {
    buildApiErrorPayload,
    buildApiErrorPayloadFromError
};
