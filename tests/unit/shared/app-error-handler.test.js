'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const { join } = require('node:path');

const { createErrorHandler } = require('../../../app');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

// Neutral base dir; expected paths are built with path.join so the assertions
// use the same separator as the handler (which also uses path.join) on every
// platform — the suite must pass on Windows and inside the Linux container.
const PUBLIC_DIRECTORY = join('fake', 'public');

describe('app error handler', () => {
    it('sirve not-found.html para errores 404', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: PUBLIC_DIRECTORY });

        handler(/** @type {any} */ ({ status: 404 }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 404);
        assert.equal(recorder.sentFile, join(PUBLIC_DIRECTORY, 'not-found.html'));
    });

    it('sirve bad-request.html para errores 400', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: PUBLIC_DIRECTORY });

        handler(/** @type {any} */ ({ status: 400 }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 400);
        assert.equal(recorder.sentFile, join(PUBLIC_DIRECTORY, 'bad-request.html'));
    });

    it('sirve problema.html y conserva la razón para errores 500', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: PUBLIC_DIRECTORY });

        handler(/** @type {any} */ ({ status: 500, message: 'boom' }), /** @type {any} */ ({}), response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 500);
        assert.equal(recorder.sentFile, join(PUBLIC_DIRECTORY, 'problema.html'));
        assert.equal(response.locals.serverErrorReason, 'boom');
    });
});

/**
 * Creates response recorder with the received configuration.
 * @returns {*} Result produced by the function.
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
         * Runs the logic of status.
         * @param {string} code - Value of code used by the function.
         * @returns {*} Result produced by the function.
         */
        status(code) {
            recorder.statusCode = code;
            return this;
        },
        /**
         * Runs the logic of send file.
         * @param {string} filePath - Value of filePath used by the function.
         * @returns {*} Result produced by the function.
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
