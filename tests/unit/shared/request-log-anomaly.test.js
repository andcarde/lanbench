'use strict';

/**
 * Unit coverage for the request-log middleware's error-logging decision
 * (`shouldLogAsServerError`). It must keep logging every 500 and additionally
 * log responses a controller flagged as a handled anomaly (`logAnomaly`).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { shouldLogAsServerError } = require('../../../middlewares/request-log-middleware');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('request-log middleware — shouldLogAsServerError', () => {
    it('logs every 500 regardless of flags', () => {
        assert.equal(shouldLogAsServerError(500, {}), true);
        assert.equal(shouldLogAsServerError(500, undefined), true);
        assert.equal(shouldLogAsServerError(500, { logAnomaly: false }), true);
    });

    it('does not log ordinary 2xx/4xx responses', () => {
        assert.equal(shouldLogAsServerError(200, {}), false);
        assert.equal(shouldLogAsServerError(404, { serverErrorReason: 'x' }), false);
        assert.equal(shouldLogAsServerError(409, null), false);
    });

    it('logs a handled anomaly opted-in by the controller (e.g. failed credential check returning 200)', () => {
        assert.equal(shouldLogAsServerError(200, { logAnomaly: true }), true);
        assert.equal(shouldLogAsServerError(200, { logAnomaly: true, serverErrorReason: 'check failed' }), true);
    });
});
