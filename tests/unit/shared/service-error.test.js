'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { ServiceError } = require('../../../services/service-error');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('service-error', () => {
    it('aplica valores por defecto de status y code', () => {
        const error = new ServiceError('Fallo genérico.');

        assert.equal(error instanceof Error, true);
        assert.equal(error.name, 'ServiceError');
        assert.equal(error.message, 'Fallo genérico.');
        assert.equal(error.status, 500);
        assert.equal(error.code, 'service_error');
    });

    it('permite sobreescribir status y code', () => {
        const error = new ServiceError('No autorizado.', {
            status: 401,
            code: 'unauthorized'
        });

        assert.equal(error.status, 401);
        assert.equal(error.code, 'unauthorized');
    });

    it('ServiceError.datasetNotFound produce 404 dataset_not_found canónico', () => {
        const error = ServiceError.datasetNotFound();

        assert.equal(error instanceof ServiceError, true);
        assert.equal(error.name, 'ServiceError');
        assert.equal(error.message, 'Dataset no encontrado.');
        assert.equal(error.status, 404);
        assert.equal(error.code, 'dataset_not_found');
    });

    it('ServiceError.emailTaken produce 409 email_taken canónico', () => {
        const error = ServiceError.emailTaken();

        assert.equal(error instanceof ServiceError, true);
        assert.equal(error.name, 'ServiceError');
        assert.equal(error.message, 'Email already registered.');
        assert.equal(error.status, 409);
        assert.equal(error.code, 'email_taken');
    });
});
