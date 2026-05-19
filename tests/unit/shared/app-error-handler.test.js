'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createErrorHandler } = require('../../../app');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('app error handler', () => {
    it('sirve not-found.html para errores 404', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler(/** @type {any} */ ({ status: 404 }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 404);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\not-found.html');
    });

    it('sirve bad-request.html para errores 400', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler(/** @type {any} */ ({ status: 400 }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 400);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\bad-request.html');
    });

    it('sirve problema.html y conserva la razón para errores 500', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler(/** @type {any} */ ({ status: 500, message: 'boom' }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 500);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\problema.html');
        assert.equal(response.locals.serverErrorReason, 'boom');
    });
});

/**
 * Crea response recorder con la configuracion recibida.
 * @returns {*} Resultado producido por la funcion.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = {
        statusCode: null,
        sentFile: null
    };

    /** @type {any} */
    const response = {
        headersSent: false,
        locals: {},
        /**
         * Ejecuta la logica de status.
         * @param {string} code - Valor de code usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        status(code) {
            recorder.statusCode = code;
            return this;
        },
        /**
         * Ejecuta la logica de send file.
         * @param {string} filePath - Valor de filePath usado por la funcion.
         * @returns {*} Resultado producido por la funcion.
         */
        sendFile(filePath) {
            recorder.sentFile = filePath;
            return this;
        }
    };

    return {
        response,
        recorder
    };
}
