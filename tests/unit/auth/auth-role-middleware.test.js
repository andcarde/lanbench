'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    requirePageModerator,
    requireApiModerator
} = require('../../../middlewares/auth');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Ejecuta la logica de make response recorder.
 * @returns {*} Resultado producido por la funcion.
 */
function makeResponseRecorder() {
    /** @type {any} */
    const recorder = {
        statusCode: null,
        payload: null,
        redirected: null,
        cookie: null
    };

    /** @type {any} */
    const response = {
        status(/** @type {*} */ code) { recorder.statusCode = code; return this; },
        json(/** @type {*} */ payload) { recorder.payload = payload; return this; },
        redirect(/** @type {*} */ path) { recorder.redirected = path; return this; },
        cookie(/** @type {*} */ name, /** @type {*} */ payload, /** @type {*} */ options) {
            recorder.cookie = { name, payload, options };
            return this;
        }
    };

    return { response, recorder };
}

describe('requireApiModerator', () => {
    it('rechaza con 401 cuando no hay sesion valida', () => {
        const middleware = requireApiModerator();
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        middleware(/** @type {any} */ ({}), response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.statusCode, 401);
        assert.equal(recorder.payload.error, true);
        assert.equal(recorder.payload.code, 'unauthenticated');
    });

    it('rechaza con 403 cuando el usuario no es moderador', () => {
        const middleware = requireApiModerator();
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        /** @type {any} */
        const request = {
            session: { user: { id: 1, email: 'user@example.com', isModerator: false } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.statusCode, 403);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'No tiene permisos suficientes para esta acción.',
            code: 'forbidden_role'
        });
    });

    it('deja pasar cuando el usuario es moderador', () => {
        const middleware = requireApiModerator();
        const { response } = makeResponseRecorder();
        let nextCalled = false;

        /** @type {any} */
        const request = {
            session: { user: { id: 2, email: 'mod@example.com', isModerator: true } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(request.user.isModerator, true);
    });
});

describe('requirePageModerator', () => {
    it('redirige a /login cuando no hay sesion valida', () => {
        const middleware = requirePageModerator();
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        middleware(/** @type {any} */ ({}), response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.redirected, '/login');
        assert.ok(recorder.cookie, 'debe fijarse cookie de mensaje');
    });

    it('redirige a /forbidden cuando el usuario no es moderador', () => {
        const middleware = requirePageModerator();
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        /** @type {any} */
        const request = {
            session: { user: { id: 1, email: 'u@example.com', isModerator: false } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.redirected, '/forbidden');
    });

    it('deja pasar cuando el usuario es moderador y fija request.user', () => {
        const middleware = requirePageModerator();
        const { response } = makeResponseRecorder();
        let nextCalled = false;

        /** @type {any} */
        const request = {
            session: { user: { id: 3, email: 'mod@example.com', isModerator: true } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(request.user.isModerator, true);
    });
});
