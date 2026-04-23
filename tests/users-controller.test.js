'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersController } = require('../business/users-controller');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('users-controller', () => {
    it('register normaliza el email y delega en usersService', async () => {
        const capturedCalls = [];
        const usersController = createUsersController({
            usersService: {
                async registerUser(payload) {
                    capturedCalls.push(payload);
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.register({
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
                    error.status = 409;
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.register({
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
        assert.deepEqual(recorder.payload, { message: 'Email already registered.' });
    });

    it('login guarda el usuario de sesión canónico devuelto por usersService', async () => {
        const usersController = createUsersController({
            usersService: {
                async authenticateUser(credentials) {
                    assert.deepEqual(credentials, {
                        email: 'test@example.com',
                        password: 'supersecret99'
                    });

                    return {
                        idUser: 7,
                        email: 'test@example.com',
                        role: 'annotator'
                    };
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        const request = {
            body: {
                email: 'test@example.com',
                password: 'supersecret99'
            },
            session: { save(cb) { cb(null); } }
        };

        await usersController.login(request, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(request.session.user, {
            idUser: 7,
            email: 'test@example.com',
            role: 'annotator'
        });
        assert.deepEqual(recorder.payload, { redirectUrl: '/tasks' });
    });

    it('login devuelve 401 cuando el servicio rechaza las credenciales', async () => {
        const usersController = createUsersController({
            usersService: {
                async authenticateUser() {
                    const error = new Error('La contraseña no se corresponde con el usuario proporcionado.');
                    error.status = 401;
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
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
            title: 'Login incorrecto',
            message: 'La contraseña no se corresponde con el usuario proporcionado.'
        });
    });
});

function createResponseRecorder() {
    const recorder = {
        statusCode: null,
        payload: null
    };

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

    return {
        response,
        recorder
    };
}
