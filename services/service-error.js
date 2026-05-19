'use strict';

/**
 * @file `ServiceError` — error semantico de la capa de servicios.
 *
 * Los servicios lanzan instancias de esta clase cuando una pre/post-condicion
 * de negocio no se cumple. Los controllers mapean `status`/`code` a la
 * respuesta HTTP final, y `message` se reenvia al usuario tal cual.
 */

/**
 * @typedef {Object} ServiceErrorOptions
 * @property {number} [status]  - Codigo HTTP asociado (por defecto `500`).
 * @property {string} [code]    - Codigo estable consumible por la UI (por defecto `'service_error'`).
 */

/**
 * Error semantico de servicio con `status` HTTP y `code` legibles.
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
}

module.exports = {
    ServiceError
};
