'use strict';

/**
 * @file `ServiceError` — semantic error of the service layer.
 *
 * Services throw instances of this class when a business pre/post-condition is
 * not met. Controllers map `status`/`code` to the final HTTP response, and
 * `message` is forwarded to the user as-is.
 */

/**
 * @typedef {Object} ServiceErrorOptions
 * @property {number} [status]  - Associated HTTP code (default `500`).
 * @property {string} [code]    - Stable code consumable by the UI (default `'service_error'`).
 */

/**
 * Semantic service error with readable HTTP `status` and `code`.
 */
class ServiceError extends Error {
    /**
     * @param {string} message
     * @param {ServiceErrorOptions} [options]
     */
    constructor(message, { status = 500, code = 'service_error' } = {}) {
        super(message);
        /** @type {'ServiceError'} */
        this.name = 'ServiceError';
        /** @type {number} */
        this.status = status;
        /** @type {string} */
        this.code = code;
    }

    /**
     * Canonical factory for `404 dataset_not_found`. Also covers the case of a
     * dataset that exists but is not accessible (same code, no information
     * about existence is leaked).
     *
     * @returns {ServiceError}
     */
    static datasetNotFound() {
        return new ServiceError('Dataset no encontrado.', {
            status: 404,
            code: 'dataset_not_found'
        });
    }

    /**
     * Canonical factory for `409 email_taken`.
     *
     * @returns {ServiceError}
     */
    static emailTaken() {
        return new ServiceError('Email already registered.', {
            status: 409,
            code: 'email_taken'
        });
    }
}

module.exports = {
    ServiceError
};
