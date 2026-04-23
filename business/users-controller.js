'use strict';

const { createUsersService } = require('../services/users-service');

function createUsersController({ usersService } = {}) {
    const service = usersService || createUsersService();

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
            return response.status(400).json(legacyMessageError(validationError));

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
        } catch (error) {
            if (error && error.status === 409)
                return response.status(409).json(legacyMessageError(error.message));

            return response.status(500).json(legacyMessageError('Internal server error.'));
        }
    }

    async function login(request, response) {
        const email = toTrimmedString(request.body.email).toLowerCase();
        const password = toTrimmedString(request.body.password);

        if (!isValidEmail(email) || !isValidPassword(password))
            return response.status(400).json(legacyMessageError('Invalid login payload.'));

        try {
            request.session.user = await service.authenticateUser({ email, password });
            await new Promise((resolve, reject) => {
                request.session.save(error => {
                    if (error) reject(error);
                    else resolve();
                });
            });
            return response.status(200).json({ redirectUrl: '/tasks' });
        } catch (error) {
            if (error && error.status === 401) {
                return response.status(401).json({
                    title: 'Login incorrecto',
                    ...legacyMessageError(error.message)
                });
            }

            return response.status(500).json(legacyMessageError('Internal server error.'));
        }
    }

    return { register, login };
}

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

function isValidAlphabeticField(value, alphaRegex) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= 64
        && alphaRegex.test(value);
}

function isValidEmail(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128)
        return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}

function isValidPassword(value) {
    return typeof value === 'string'
        && value.length > 8
        && value.length <= 64;
}

function toTrimmedString(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim();
}

function legacyMessageError(message) {
    return { message };
}

module.exports = {
    createUsersController
};
