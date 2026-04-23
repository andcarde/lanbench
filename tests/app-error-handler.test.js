'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createErrorHandler } = require('../app');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('app error handler', () => {
    it('sirve no-encontrada.html para errores 404', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler({ status: 404 }, {}, response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 404);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\no-encontrada.html');
    });

    it('sirve bad-request.html para errores 400', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler({ status: 400 }, {}, response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 400);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\bad-request.html');
    });

    it('sirve problema.html y conserva la razón para errores 500', () => {
        const { response, recorder } = createResponseRecorder();
        const handler = createErrorHandler({ publicDirectory: 'C:\\fake-public' });

        handler({ status: 500, message: 'boom' }, {}, response, () => {
            throw new Error('next should not be called');
        });

        assert.equal(recorder.statusCode, 500);
        assert.equal(recorder.sentFile, 'C:\\fake-public\\problema.html');
        assert.equal(response.locals.serverErrorReason, 'boom');
    });
});

function createResponseRecorder() {
    const recorder = {
        statusCode: null,
        sentFile: null
    };

    const response = {
        headersSent: false,
        locals: {},
        status(code) {
            recorder.statusCode = code;
            return this;
        },
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
