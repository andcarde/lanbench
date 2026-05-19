'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersController } = require('../../../controllers/users-controller');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users-controller', () => {
    it('register normaliza el email y delega en usersService', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const usersController = createUsersController({
            usersService: {
                /**
                 * Ejecuta de forma asincrona la logica de register user.
                 * @param {*} payload - Valor de payload usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async registerUser(/** @type {*} */ payload) {
                    capturedCalls.push(payload);
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (usersController)).register({
            body: {
                surname: 'Garcia',
                lastName: 'Lopez',
                email: 'Test@Example.com',
                password: 'supersecret99',
                repeatPassword: 'supersecret99'
            },
            session: {}
        }, response);

        assert.deepEqual(capturedCalls, [
            {
                email: 'test@example.com',
                password: 'supersecret99'
            }
        ]);
        assert.equal(recorder.statusCode, 201);
        assert.deepEqual(recorder.payload, {
            title: 'Register completed',
            message: 'User validated correctly.'
        });
    });

    it('register devuelve 409 cuando el servicio detecta email duplicado', async () => {
        const usersController = createUsersController({
            usersService: {
                async registerUser() {
                    const error = new Error('Email already registered.');
                    /** @type {any} */ (error).status = 409;
                    /** @type {any} */ (error).code = 'email_taken';
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await (/** @type {any} */ (usersController)).register({
            body: {
                surname: 'Maria',
                lastName: 'Perez',
                email: 'taken@example.com',
                password: 'supersecret99',
                repeatPassword: 'supersecret99'
            },
            session: {}
        }, response);

        assert.equal(recorder.statusCode, 409);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Email already registered.',
            code: 'email_taken'
        });
    });

    it('login guarda el usuario de sesión canónico devuelto por usersService', async () => {
        const usersController = createUsersController({
            usersService: {
                /**
                 * Ejecuta de forma asincrona la logica de authenticate user.
                 * @param {Array<*>} credentials - Valor de credentials usado por la funcion.
                 * @returns {Promise<*>} Resultado producido por la funcion.
                 */
                async authenticateUser(credentials) {
                    assert.deepEqual(credentials, {
                        email: 'test@example.com',
                        password: 'supersecret99'
                    });

                    return {
                        id: 7,
                        email: 'test@example.com',
                        isModerator: false
                    };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        /** @type {any} */
        const request = {
            body: {
                email: 'test@example.com',
                password: 'supersecret99'
            },
            session: { save(/** @type {*} */ cb) { cb(null); } }
        };

        await usersController.login(request, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(request.session.user, {
            id: 7,
            email: 'test@example.com',
            isModerator: false
        });
        assert.deepEqual(recorder.payload, { redirectUrl: '/tasks' });
    });

    it('login devuelve 401 cuando el servicio rechaza las credenciales', async () => {
        const usersController = createUsersController({
            usersService: {
                async authenticateUser() {
                    const error = new Error('La contraseña no se corresponde con el usuario proporcionado.');
                    /** @type {any} */ (error).status = 401;
                    /** @type {any} */ (error).code = 'invalid_credentials';
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        /** @type {any} */
        const request = {
            body: {
                email: 'missing@example.com',
                password: 'supersecret99'
            },
            session: {}
        };

        await usersController.login(request, response);

        assert.equal(recorder.statusCode, 401);
        assert.equal(request.session.user, undefined);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'La contraseña no se corresponde con el usuario proporcionado.',
            code: 'invalid_credentials'
        });
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
        payload: null
    };

    /** @type {any} */
    const response = {
        locals: {},
        status(/** @type {*} */ code) {
            recorder.statusCode = code;
            return this;
        },
        json(/** @type {*} */ payload) {
            recorder.payload = payload;
            return this;
        }
    };

    return {
        response,
        recorder
    };
}
