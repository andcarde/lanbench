'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    requirePageRole,
    requireApiRole
} = require('../middlewares/auth');
const {
    ROLE_ADMIN,
    ROLE_REVIEWER,
    ROLE_ANNOTATOR
} = require('../constants/roles');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

function makeResponseRecorder() {
    const recorder = {
        statusCode: null,
        payload: null,
        redirected: null,
        cookie: null
    };

    const response = {
        status(code) { recorder.statusCode = code; return this; },
        json(payload) { recorder.payload = payload; return this; },
        redirect(path) { recorder.redirected = path; return this; },
        cookie(name, payload, options) {
            recorder.cookie = { name, payload, options };
            return this;
        }
    };

    return { response, recorder };
}

describe('requireApiRole', () => {
    it('rechaza con 401 cuando no hay sesion valida', () => {
        const middleware = requireApiRole(ROLE_ADMIN);
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        middleware({}, response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.statusCode, 401);
        assert.equal(recorder.payload.error, true);
        assert.equal(recorder.payload.code, 'unauthenticated');
    });

    it('rechaza con 403 cuando el rol de la sesion no esta permitido', () => {
        const middleware = requireApiRole(ROLE_ADMIN);
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        const request = {
            session: { user: { idUser: 1, email: 'user@example.com', role: ROLE_ANNOTATOR } }
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

    it('deja pasar cuando el rol de la sesion esta permitido', () => {
        const middleware = requireApiRole(ROLE_ADMIN, ROLE_REVIEWER);
        const { response } = makeResponseRecorder();
        let nextCalled = false;

        const request = {
            session: { user: { idUser: 2, email: 'rev@example.com', role: ROLE_REVIEWER } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(request.user.role, ROLE_REVIEWER);
    });

    it('acepta roles pasados como array', () => {
        const middleware = requireApiRole([ROLE_ADMIN]);
        const { response } = makeResponseRecorder();
        let nextCalled = false;

        const request = {
            session: { user: { idUser: 2, email: 'a@example.com', role: ROLE_ADMIN } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
    });

    it('lanza error al construirse si no se pasan roles validos', () => {
        assert.throws(() => requireApiRole(), /at least one valid role/);
        assert.throws(() => requireApiRole('not-a-role'), /at least one valid role/);
        assert.throws(() => requireApiRole([]), /at least one valid role/);
    });
});

describe('requirePageRole', () => {
    it('redirige a /login cuando no hay sesion valida', () => {
        const middleware = requirePageRole(ROLE_ADMIN);
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        middleware({}, response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.redirected, '/login');
        assert.ok(recorder.cookie, 'debe fijarse cookie de mensaje');
    });

    it('redirige a /forbidden cuando el rol no esta permitido', () => {
        const middleware = requirePageRole(ROLE_ADMIN);
        const { response, recorder } = makeResponseRecorder();
        let nextCalled = false;

        const request = {
            session: { user: { idUser: 1, email: 'u@example.com', role: ROLE_ANNOTATOR } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, false);
        assert.equal(recorder.redirected, '/forbidden');
    });

    it('deja pasar cuando el rol esta permitido y fija request.user', () => {
        const middleware = requirePageRole(ROLE_ADMIN, ROLE_REVIEWER);
        const { response } = makeResponseRecorder();
        let nextCalled = false;

        const request = {
            session: { user: { idUser: 3, email: 'admin@example.com', role: ROLE_ADMIN } }
        };

        middleware(request, response, () => { nextCalled = true; });

        assert.equal(nextCalled, true);
        assert.equal(request.user.role, ROLE_ADMIN);
    });
});
