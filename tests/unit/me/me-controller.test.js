'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createMeController } = require('../../../controllers/me-controller');
const { ServiceError } = require('../../../services/service-error');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Minimal response recorder.
 * @returns {*} Recorder + response.
 */
function buildResponse() {
    /** @type {any} */
    const captured = { status: null, body: null };
    return {
        captured,
        locals: {},
        status(/** @type {*} */ code) { captured.status = code; return this; },
        json(/** @type {*} */ payload) { captured.body = payload; return this; }
    };
}

describe('me-controller (US-14)', () => {
    it('responde 200 con las estadísticas del usuario de la sesión', async () => {
        let /** @type {any} */ called;
        const controller = createMeController({
            meStatisticsService: {
                async getMyStatistics(/** @type {*} */ args) { called = args; return { totals: { annotations: 5 } }; }
            }
        });
        const res = buildResponse();

        await controller.getMyStats({ session: { user: { id: 7, email: 'me@lanbench.dev' } } }, res);

        assert.equal(called.userId, 7);
        assert.equal(called.email, 'me@lanbench.dev');
        assert.equal(res.captured.status, 200);
        assert.equal(res.captured.body.totals.annotations, 5);
    });

    it('responde 401 cuando no hay usuario en sesión', async () => {
        const controller = createMeController({
            meStatisticsService: { async getMyStatistics() { throw new Error('should not be called'); } }
        });
        const res = buildResponse();

        await controller.getMyStats({ session: {} }, res);

        assert.equal(res.captured.status, 401);
        assert.equal(res.captured.body.code, 'unauthenticated');
    });

    it('propaga el status de un ServiceError', async () => {
        const controller = createMeController({
            meStatisticsService: {
                async getMyStatistics() { throw new ServiceError('boom', { status: 500, code: 'stats_failed' }); }
            }
        });
        const res = buildResponse();

        await controller.getMyStats({ session: { user: { id: 7, email: 'me@lanbench.dev' } } }, res);

        assert.equal(res.captured.status, 500);
        assert.equal(res.captured.body.code, 'stats_failed');
    });
});
