'use strict';

/**
 * Unit coverage for the credential "Comprobar" (check) action:
 *   - `buildCheckResultText` (pure modal-text builder in the admin frontend);
 *   - the controller flagging a failed check for the error log.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { buildCheckResultText } = require('../../../public/js/dataset-admin');
const { createDatasetLlmCredentialsController } = require('../../../controllers/dataset-llm-credentials-controller');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/** Minimal Express response double capturing status, json and locals. */
function buildResponse() {
    return /** @type {ResponseSpy} */ ({
        locals: {},
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    });
}

describe('credential check — buildCheckResultText (modal text)', () => {
    it('returns the model message on success', () => {
        assert.equal(buildCheckResultText({ ok: true, message: 'listo' }), 'listo');
    });

    it('falls back to a default success line when no message is provided', () => {
        assert.equal(buildCheckResultText({ ok: true }), 'El modelo respondió correctamente.');
    });

    it('returns the server error on failure', () => {
        assert.equal(buildCheckResultText({ ok: false, error: 'clave inválida' }), 'Error: clave inválida');
    });

    it('falls back to a default error line for empty/odd payloads', () => {
        assert.equal(buildCheckResultText({ ok: false }), 'Error: el modelo no respondió.');
        assert.equal(buildCheckResultText(null), 'Error: el modelo no respondió.');
        assert.equal(buildCheckResultText(undefined), 'Error: el modelo no respondió.');
    });
});

describe('credential check — controller error-log flagging', () => {
    /** @type {any} */
    const request = { session: { user: { id: 7 } }, params: { id: '1', provider: 'groq' } };

    it('flags a failed check (200 {ok:false}) for the error log', async () => {
        const controller = createDatasetLlmCredentialsController({
            datasetLlmCredentialsService: { async checkCredential() { return { ok: false, error: 'provider down' }; } }
        });
        const response = buildResponse();

        await controller.check(request, /** @type {any} */ (response));

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.ok, false);
        assert.equal(response.locals.logAnomaly, true);
        assert.match(response.locals.serverErrorReason, /Comprobación de credencial fallida/);
        assert.match(response.locals.serverErrorReason, /provider down/);
    });

    it('does not flag a successful check', async () => {
        const controller = createDatasetLlmCredentialsController({
            datasetLlmCredentialsService: { async checkCredential() { return { ok: true, message: 'ok' }; } }
        });
        const response = buildResponse();

        await controller.check(request, /** @type {any} */ (response));

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.ok, true);
        assert.equal(response.locals.logAnomaly, undefined);
    });
});
