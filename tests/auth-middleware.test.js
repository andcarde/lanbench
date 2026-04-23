'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { requirePageAuth, requireApiAuth } = require('../middlewares/auth');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('auth middleware', () => {
    it('requirePageAuth permite continuar cuando hay sesión válida', () => {
        let nextCalled = false;
        const request = {
            session: {
                user: {
                    idUser: 17,
                    email: 'user@example.com'
                }
            }
        };
        const response = {
            cookie() {
                throw new Error('cookie should not be called');
            },
            redirect() {
                throw new Error('redirect should not be called');
            }
        };

        requirePageAuth(request, response, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });

    it('requirePageAuth fija request.user con role al pasar la autenticación', () => {
        const request = {
            session: {
                user: {
                    idUser: 17,
                    email: 'user@example.com',
                    role: 'annotator'
                }
            }
        };
        const response = {
            cookie() { throw new Error('no debería llamarse'); },
            redirect() { throw new Error('no debería llamarse'); }
        };

        requirePageAuth(request, response, () => {});

        assert.ok(request.user !== undefined, 'request.user debe existir');
        assert.equal(request.user.idUser, 17);
        assert.equal(request.user.email, 'user@example.com');
        assert.equal(request.user.role, 'annotator');
    });

    it('requirePageAuth usa role annotator por defecto si la sesión no lo incluye', () => {
        const request = {
            session: {
                user: { idUser: 5, email: 'legacy@example.com' }
            }
        };
        const response = {
            cookie() { throw new Error('no debería llamarse'); },
            redirect() { throw new Error('no debería llamarse'); }
        };

        requirePageAuth(request, response, () => {});

        assert.equal(request.user.role, 'annotator');
    });

    it('requirePageAuth redirige a /login y fija cookie de mensaje cuando no hay sesión válida', () => {
        const calls = {
            cookie: null,
            redirect: null,
            nextCalled: false
        };
        const request = { session: { user: { idUser: 0, email: '' } } };
        const response = {
            cookie(name, payload, options) {
                calls.cookie = { name, payload, options };
                return this;
            },
            redirect(path) {
                calls.redirect = path;
                return this;
            }
        };

        requirePageAuth(request, response, () => {
            calls.nextCalled = true;
        });

        assert.equal(calls.nextCalled, false);
        assert.equal(calls.redirect, '/login');
        assert.deepEqual(calls.cookie, {
            name: 'message',
            payload: {
                title: 'Acceso denegado',
                message: 'Es necesario que se identifique para acceder a dicha dirección'
            },
            options: { maxAge: 5000 }
        });
    });

    it('requireApiAuth responde 401 JSON cuando no hay usuario autenticado', () => {
        const recorder = {
            statusCode: null,
            payload: null,
            nextCalled: false
        };
        const request = {};
        const response = {
            status(code) {
                recorder.statusCode = code;
                return this;
            },
            json(payload) {
                recorder.payload = payload;
                return this;
            }
        };

        requireApiAuth(request, response, () => {
            recorder.nextCalled = true;
        });

        assert.equal(recorder.nextCalled, false);
        assert.equal(recorder.statusCode, 401);
        assert.deepEqual(recorder.payload, {
            message: 'Es necesario iniciar sesión.',
            redirectTo: '/login'
        });
    });

    it('requireApiAuth permite continuar cuando existe usuario canónico en sesión', () => {
        let nextCalled = false;
        const request = {
            session: {
                user: {
                    idUser: 2,
                    email: 'auth@example.com'
                }
            }
        };
        const response = {
            status() {
                throw new Error('status should not be called');
            },
            json() {
                throw new Error('json should not be called');
            }
        };

        requireApiAuth(request, response, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });

    it('requireApiAuth fija request.user con role al pasar la autenticación', () => {
        const request = {
            session: {
                user: { idUser: 2, email: 'auth@example.com', role: 'reviewer' }
            }
        };
        const response = {
            status() { throw new Error('no debería llamarse'); },
            json() { throw new Error('no debería llamarse'); }
        };

        requireApiAuth(request, response, () => {});

        assert.ok(request.user !== undefined);
        assert.equal(request.user.role, 'reviewer');
    });
});
