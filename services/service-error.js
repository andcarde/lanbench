'use strict';

class ServiceError extends Error {
    constructor(message, { status = 500, code = 'service_error' } = {}) {
        super(message);
        this.name = 'ServiceError';
        this.status = status;
        this.code = code;
    }
}

module.exports = {
    ServiceError
};
