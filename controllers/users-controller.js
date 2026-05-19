'use strict';

/**
 * @file Users controller — endpoints HTTP de registro/login.
 *
 * Todas las respuestas de error usan el envelope unificado
 * `{ error, message, code }` via `respondWithApiError` / `respondInvalidPayload`,
 * lo que ademas garantiza que los 500 fijen `response.locals.serverErrorReason`
 * para el logger.
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 *
 * @typedef {Object} UsersControllerDeps
 * @property {Record<string, any>} [usersService]
 *
 * @typedef {Object} RegisterPayload
 * @property {string} surname
 * @property {string} lastName
 * @property {string} email
 * @property {string} password
 * @property {string} repeatPassword
 */

const { createUsersService } = require('../services/users-service');
const {
    respondWithApiError,
    respondInvalidPayload
} = require('../utils/api-error-payload');

/** Patron de los codigos de registro de moderador (16 alfanumericos). */
const REGISTER_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;

/**
 * Construye el controlador HTTP de usuarios.
 *
 * @param {UsersControllerDeps} [options]
 */
function createUsersController({ usersService } = {}) {
    const service = usersService || createUsersService();

    /**
     * `POST /register` — Alta de un usuario normal.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<*>}
     */
    async function register(request, response) {
        const payload = {
            surname: request.body.surname,
            lastName: request.body.lastName,
            email: request.body.email,
            password: request.body.password,
            repeatPassword: request.body.repeatPassword
        };

        const validationError = validateRegisterPayload(payload);
        if (validationError)
            return respondInvalidPayload(response, validationError);

        const email = toTrimmedString(payload.email).toLowerCase();
        try {
            await service.registerUser({
                email,
                password: payload.password
            });

            return response.status(201).json({
                title: 'Register completed',
                message: 'User validated correctly.'
            });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /register-moderator` — Alta como moderador consumiendo un
     * `register_code` valido.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<*>}
     */
    async function registerModerator(request, response) {
        const payload = {
            surname: request.body.surname,
            lastName: request.body.lastName,
            email: request.body.email,
            password: request.body.password,
            repeatPassword: request.body.repeatPassword
        };

        const validationError = validateRegisterPayload(payload);
        if (validationError)
            return respondInvalidPayload(response, validationError);

        const code = request.body.code;
        if (typeof code !== 'string' || !REGISTER_CODE_PATTERN.test(code))
            return respondInvalidPayload(response, 'Invalid moderator register code.');

        const email = toTrimmedString(payload.email).toLowerCase();
        try {
            await service.registerModeratorUser({
                email,
                password: payload.password,
                code
            });

            return response.status(201).json({
                title: 'Register completed',
                message: 'User validated correctly.'
            });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    /**
     * `POST /login` — Autentica al usuario y persiste su payload en
     * `request.session.user` antes de redirigir a `/tasks`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<*>}
     */
    async function login(request, response) {
        const email = toTrimmedString(request.body.email).toLowerCase();
        const password = toTrimmedString(request.body.password);

        if (!isValidEmail(email) || !isValidPassword(password))
            return respondInvalidPayload(response, 'Invalid login payload.');

        try {
            const session = /** @type {any} */ (request.session);
            session.user = await service.authenticateUser({ email, password });
            await new Promise((resolve, reject) => {
                session.save((/** @type {*} */ error) => {
                    if (error) reject(error);
                    else resolve(undefined);
                });
            });
            return response.status(200).json({ redirectUrl: '/tasks' });
        } catch (caughtError) {
            return respondWithApiError(response, /** @type {any} */ (caughtError));
        }
    }

    return { register, registerModerator, login };
}

/**
 * Valida un payload de registro. Devuelve un mensaje de error explicativo o
 * `null` si el payload es valido.
 *
 * @param {RegisterPayload} payload
 * @returns {string|null}
 */
function validateRegisterPayload(payload) {
    const alphaRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]+$/;

    if (!isValidAlphabeticField(payload.surname, alphaRegex))
        return 'Surname must contain only alphabetic characters and be 1 to 64 characters long.';

    if (!isValidAlphabeticField(payload.lastName, alphaRegex))
        return 'Last name must contain only alphabetic characters and be 1 to 64 characters long.';

    if (!isValidEmail(payload.email))
        return 'Email format is invalid.';

    if (!isValidPassword(payload.password))
        return 'Password must be longer than 8 characters and at most 64 characters.';

    if (payload.repeatPassword !== payload.password)
        return 'Repeat password must match password.';

    return null;
}

/**
 * Indica si `value` es una cadena alfabetica de 1..64 caracteres.
 *
 * @param {unknown} value
 * @param {RegExp} alphaRegex
 * @returns {boolean}
 */
function isValidAlphabeticField(value, alphaRegex) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 64
        && alphaRegex.test(/** @type {string} */ (value));
}

/**
 * Validacion de email defensiva (no usa regex laxas): comprueba presencia
 * de `@` unica, longitud razonable, dominio con punto interno y partes no
 * vacias sin espacios.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidEmail(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128)
        return false;

    const atIndex = value.indexOf('@');
    if (atIndex <= 0 || atIndex !== value.lastIndexOf('@'))
        return false;

    const localPart = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    const dotIndex = domain.indexOf('.');
    return dotIndex > 0
        && dotIndex < domain.length - 1
        && isValidEmailPart(localPart)
        && isValidEmailPart(domain);
}

/**
 * Comprueba que la parte (local o dominio) no este vacia ni contenga
 * `@` o caracteres en blanco.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidEmailPart(value) {
    return value.length > 0
        && !Array.from(value).some(character => character === '@' || character.trim() === '');
}

/**
 * Politica de password: 9..64 caracteres.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidPassword(value) {
    return typeof value === 'string'
        && value.length > 8
        && value.length <= 64;
}

/**
 * Devuelve `value.trim()` o `''` si no es string.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toTrimmedString(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim();
}

module.exports = {
    createUsersController
};
