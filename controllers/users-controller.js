'use strict';

/**
 * @file Users controller — HTTP endpoints for registration/login.
 *
 * All error responses use the unified envelope `{ error, message, code }` via
 * `respondWithApiError` / `respondInvalidPayload`, which also guarantees that
 * 500s set `response.locals.serverErrorReason` for the logger.
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
const { trimmedOr } = require('../utils/validators');
const { REGISTER_CODE_PATTERN } = require('../constants/users');

/**
 * Builds the users HTTP controller.
 *
 * @param {UsersControllerDeps} [options]
 */
function createUsersController({ usersService } = {}) {
    const service = usersService || createUsersService();

    /**
     * `POST /register` — Registers a normal user.
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

        const email = trimmedOr(payload.email, '').toLowerCase();
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
     * `POST /register-moderator` — Registers as a moderator by consuming a
     * valid `register_code`.
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

        const email = trimmedOr(payload.email, '').toLowerCase();
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
     * `POST /login` — Authenticates the user and persists their payload in
     * `request.session.user` before redirecting to `/tasks`.
     *
     * @param {ExpressRequest} request
     * @param {ExpressResponse} response
     * @returns {Promise<*>}
     */
    async function login(request, response) {
        const email = trimmedOr(request.body.email, '').toLowerCase();
        const password = trimmedOr(request.body.password, '');

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
 * Validates a registration payload. Returns an explanatory error message, or
 * `null` if the payload is valid.
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
 * Indicates whether `value` is an alphabetic string of 1..64 characters.
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
 * Defensive email validation (does not use lax regexes): checks for a single
 * `@`, reasonable length, a domain with an internal dot, and non-empty parts
 * without whitespace.
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
 * Checks that the part (local or domain) is not empty and does not contain
 * `@` or whitespace characters.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isValidEmailPart(value) {
    return value.length > 0
        && !Array.from(value).some(character => character === '@' || character.trim() === '');
}

/**
 * Password policy: 9..64 characters.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidPassword(value) {
    return typeof value === 'string'
        && value.length > 8
        && value.length <= 64;
}

module.exports = {
    createUsersController
};
