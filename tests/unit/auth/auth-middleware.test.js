'use strict';

/**
 * @file Unit tests para los middlewares de autenticacion
 * (`requirePageAuth`/`requireApiAuth`).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { requirePageAuth, requireApiAuth } = require('../../../middlewares/auth');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('auth middleware', () => {
    it('requirePageAuth permite continuar cuando hay sesión válida', () => {
        let nextCalled = false;
        /** @type {any} */
        /** @type {any} */
        const request = {
            session: {
                user: {
                    id: 17,
                    email: 'user@example.com'
                }
            }
        };
        /** @type {any} */
        const response = {
            /**
             * Ejecuta la logica de cookie.
             * @returns {*} Resultado producido por la funcion.
             */
            cookie() {
                throw new Error('cookie should not be called');
            },
            /**
             * Ejecuta la logica de redirect.
             * @returns {*} Resultado producido por la funcion.
             */
            redirect() {
                throw new Error('redirect should not be called');
            }
        };

        requirePageAuth(request, response, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });

    it('requirePageAuth fija request.user con isModerator al pasar la autenticación', () => {
        /** @type {any} */
        const request = {
            session: {
                user: {
                    id: 17,
                    email: 'user@example.com',
                    isModerator: false
                }
            }
        };
        /** @type {any} */
        const response = {
            cookie() { throw new Error('no debería llamarse'); },
            redirect() { throw new Error('no debería llamarse'); }
        };

        requirePageAuth(request, response, () => {});

        assert.ok(request.user !== undefined, 'request.user debe existir');
        assert.equal(request.user.id, 17);
        assert.equal(request.user.email, 'user@example.com');
        assert.equal(request.user.isModerator, false);
    });

    it('requirePageAuth deja isModerator=false por defecto si la sesión no lo incluye', () => {
        /** @type {any} */
        const request = {
            session: {
                user: { id: 5, email: 'legacy@example.com' }
            }
        };
        /** @type {any} */
        const response = {
            cookie() { throw new Error('no debería llamarse'); },
            redirect() { throw new Error('no debería llamarse'); }
        };

        requirePageAuth(request, response, () => {});

        assert.equal(request.user.isModerator, false);
    });

    it('requirePageAuth redirige a /login y fija cookie de mensaje cuando no hay sesión válida', () => {
        /** @type {any} */
        /** @type {any} */
        const calls = {
            cookie: null,
            redirect: null,
            nextCalled: false
        };
        /** @type {any} */
        /** @type {any} */
        const request = { session: { user: { id: 0, email: '' } } };
        /** @type {any} */
        const response = {
            /**
             * Ejecuta la logica de cookie.
             * @param {string} name - Valor de name usado por la funcion.
             * @param {*} payload - Valor de payload usado por la funcion.
             * @param {*} options - Valor de options usado por la funcion.
             * @returns {*} Resultado producido por la funcion.
             */
            cookie(name, payload, options) {
                calls.cookie = { name, payload, options };
                return this;
            },
            /**
             * Ejecuta la logica de redirect.
             * @param {string} path - Valor de path usado por la funcion.
             * @returns {*} Resultado producido por la funcion.
             */
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
        /** @type {any} */
        const recorder = {
            statusCode: null,
            payload: null,
            nextCalled: false
        };
        /** @type {Record<string, any>} */
        /** @type {any} */
        const request = {};
        /** @type {any} */
        const response = {
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
             * Ejecuta la logica de json.
             * @param {*} payload - Valor de payload usado por la funcion.
             * @returns {*} Resultado producido por la funcion.
             */
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
            error: true,
            message: 'Es necesario iniciar sesión.',
            code: 'unauthenticated',
            redirectTo: '/login'
        });
    });

    it('requireApiAuth permite continuar cuando existe usuario canónico en sesión', () => {
        let nextCalled = false;
        /** @type {any} */
        /** @type {any} */
        const request = {
            session: {
                user: {
                    id: 2,
                    email: 'auth@example.com'
                }
            }
        };
        /** @type {any} */
        const response = {
            /**
             * Ejecuta la logica de status.
             * @returns {*} Resultado producido por la funcion.
             */
            status() {
                throw new Error('status should not be called');
            },
            /**
             * Ejecuta la logica de json.
             * @returns {*} Resultado producido por la funcion.
             */
            json() {
                throw new Error('json should not be called');
            }
        };

        requireApiAuth(request, response, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, true);
    });

    it('requireApiAuth fija request.user con isModerator al pasar la autenticación', () => {
        /** @type {any} */
        const request = {
            session: {
                user: { id: 2, email: 'auth@example.com', isModerator: true }
            }
        };
        /** @type {any} */
        const response = {
            status() { throw new Error('no debería llamarse'); },
            json() { throw new Error('no debería llamarse'); }
        };

        requireApiAuth(request, response, () => {});

        assert.ok(request.user !== undefined);
        assert.equal(request.user.isModerator, true);
    });
});
