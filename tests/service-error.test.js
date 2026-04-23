'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { ServiceError } = require('../services/service-error');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

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
});
