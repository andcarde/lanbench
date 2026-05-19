'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersController } = require('../../../controllers/users-controller');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const VALID_CODE = 'AbCdEfGhIjKlMnOp';
const VALID_BODY = Object.freeze({
    surname: 'Garcia',
    lastName: 'Lopez',
    email: 'Mod@Example.com',
    password: 'supersecret99',
    repeatPassword: 'supersecret99',
    code: VALID_CODE
});

describe('users-controller registerModerator', () => {
    it('happy path: 201 y delega en service.registerModeratorUser con email normalizado', async () => {
        /** @type {any[]} */
        const capturedCalls = [];
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser(/** @type {*} */ payload) {
                    capturedCalls.push(payload);
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.registerModerator(makeRequest(VALID_BODY), response);

        assert.deepEqual(capturedCalls, [
            { email: 'mod@example.com', password: 'supersecret99', code: VALID_CODE }
        ]);
        assert.equal(recorder.statusCode, 201);
        assert.deepEqual(recorder.payload, {
            title: 'Register completed',
            message: 'User validated correctly.'
        });
    });

    it('400 si el payload base es invalido (email mal formado)', async () => {
        let serviceCalled = false;
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser() { serviceCalled = true; }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.registerModerator(
            makeRequest({ ...VALID_BODY, email: 'not-an-email' }),
            response
        );

        assert.equal(recorder.statusCode, 400);
        assert.equal(serviceCalled, false);
        assert.equal(recorder.payload?.error, true);
        assert.equal(recorder.payload?.code, 'invalid_payload');
        assert.ok(typeof recorder.payload?.message === 'string');
    });

    it('400 invalid moderator register code si el codigo no cumple [A-Za-z0-9]{16}', async () => {
        let serviceCalled = false;
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser() { serviceCalled = true; }
            }
        });

        const badCodes = ['', 'short', 'A'.repeat(15), 'A'.repeat(17), 'AbCdEfGhIjKlMnO!', null];
        for (const bad of badCodes) {
            const { response, recorder } = createResponseRecorder();
            await usersController.registerModerator(
                makeRequest({ ...VALID_BODY, code: /** @type {*} */ (bad) }),
                response
            );
            assert.equal(recorder.statusCode, 400, `expected 400 for code=${String(bad)}`);
            assert.deepEqual(recorder.payload, {
                error: true,
                message: 'Invalid moderator register code.',
                code: 'invalid_payload'
            });
        }
        assert.equal(serviceCalled, false);
    });

    it('400 cuando el servicio rechaza con invalid_register_code', async () => {
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser() {
                    const error = new Error('Invalid moderator register code.');
                    /** @type {any} */ (error).status = 400;
                    /** @type {any} */ (error).code = 'invalid_register_code';
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.registerModerator(makeRequest(VALID_BODY), response);

        assert.equal(recorder.statusCode, 400);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Invalid moderator register code.',
            code: 'invalid_register_code'
        });
    });

    it('409 cuando el servicio rechaza con email_taken', async () => {
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser() {
                    const error = new Error('Email already registered.');
                    /** @type {any} */ (error).status = 409;
                    /** @type {any} */ (error).code = 'email_taken';
                    throw error;
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.registerModerator(makeRequest(VALID_BODY), response);

        assert.equal(recorder.statusCode, 409);
        assert.deepEqual(recorder.payload, {
            error: true,
            message: 'Email already registered.',
            code: 'email_taken'
        });
    });

    it('500 ante errores inesperados del servicio', async () => {
        const usersController = createUsersController({
            usersService: {
                async registerModeratorUser() {
                    throw new Error('database is down');
                }
            }
        });

        const { response, recorder } = createResponseRecorder();
        await usersController.registerModerator(makeRequest(VALID_BODY), response);

        assert.equal(recorder.statusCode, 500);
        assert.equal(recorder.payload?.error, true);
        assert.equal(recorder.payload?.message, 'database is down');
        assert.equal(response.locals.serverErrorReason, 'database is down');
    });
});

/**
 * Construye un request fake con body y session vacios.
 * @param {*} body - Cuerpo de la peticion.
 * @returns {*} Request fake.
 */
function makeRequest(body) {
    return { body: { ...body }, session: {} };
}

/**
 * Crea response recorder con la configuracion recibida.
 * @returns {*} Resultado producido por la funcion.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = { statusCode: null, payload: null };
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
    return { response, recorder };
}
