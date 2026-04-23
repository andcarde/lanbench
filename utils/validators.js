'use strict';

function toPositiveInteger(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

function toIntegerNormalized(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;

    const integer = Math.trunc(parsed);
    return integer >= 0 ? integer : 0;
}

function normalizePercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    if (parsed < 0)
        return 0;
    if (parsed > 100)
        return 100;
    return parsed;
}

function isStringArray(value) {
    if (!Array.isArray(value))
        return false;
    return value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function getErrorMessage(error) {
    if (error && typeof error === 'object' && typeof error.message === 'string')
        return error.message;
    return 'Error desconocido';
}

module.exports = {
    toPositiveInteger,
    toIntegerNormalized,
    normalizePercent,
    isStringArray,
    getErrorMessage
};
