'use strict';

/**
 * @file Users service — registration and authentication.
 *
 * Centralizes the user sign-up flow (normal and as a moderator, the latter
 * consuming a `register_code`) and the login flow, including the automatic
 * `re-hash` when the stored password was in plain text.
 *
 * @typedef {import('../types/typedefs').UserDTO} UserDTO
 *
 * @typedef {Object} UsersServiceDeps
 * @property {Record<string, any>} [usersRepository]
 * @property {Record<string, any>} [passwordHasher]
 * @property {Record<string, any>} [registerCodesRepository]
 * @property {{ warn?: (...args:any[])=>void, error?: (...args:any[])=>void }} [logger]
 */

const { User } = require('../entities/user');
const { createUsersRepository } = require('../repositories/users-repository');
const { createRegisterCodesRepository } = require('../repositories/register-codes-repository');
const { createPasswordHasher } = require('./password-hasher');
const { ServiceError } = require('./service-error');
const { REGISTER_CODE_PATTERN } = require('../constants/users');

/**
 * Builds the users service.
 *
 * @param {UsersServiceDeps} [options]
 */
function createUsersService({ usersRepository, passwordHasher, registerCodesRepository, logger } = {}) {
    const deps = {
        usersRepository: usersRepository || createUsersRepository(),
        passwordHasher: passwordHasher || createPasswordHasher(),
        registerCodesRepository: registerCodesRepository || createRegisterCodesRepository(),
        logger: logger || console
    };

    /**
     * Creates the user after hashing the password. Centralizes the common path
     * of normal registration and moderator registration to avoid divergences.
     *
     * @param {{ email:string, password:string, isModerator?: boolean }} input
     * @returns {Promise<Record<string, any>>}
     */
    async function createUserCore({ email, password, isModerator }) {
        const passwordHash = await deps.passwordHasher.hashPassword(password);
        /** @type {Record<string, any>} */
        const payload = { email, password: passwordHash };
        if (typeof isModerator === 'boolean')
            payload.isModerator = isModerator;

        return deps.usersRepository.createUser(payload);
    }

    /**
     * Registers a normal (non-moderator) user. Fails if the email already
     * exists.
     *
     * @param {{ email:string, password:string }} input
     * @returns {Promise<Record<string, any>>}
     * @throws {ServiceError} `409 email_taken` if the email is already registered.
     */
    async function registerUser({ email, password }) {
        const existingUser = await deps.usersRepository.findByEmail(email);
        if (existingUser)
            throw ServiceError.emailTaken();

        return createUserCore({ email, password });
    }

    /**
     * Registers a user with `isModerator=true`, consuming a valid
     * `register_code`. The code is only deleted if the sign-up can be
     * completed (free email + code present in the DB).
     *
     * @param {{ email:string, password:string, code:string }} input
     * @returns {Promise<Record<string, any>>}
     * @throws {ServiceError} `400 invalid_register_code` if the code is invalid
     *   or already consumed; `409 email_taken` if the email exists.
     */
    async function registerModeratorUser({ email, password, code }) {
        if (typeof code !== 'string' || !REGISTER_CODE_PATTERN.test(code)) {
            throw new ServiceError('Invalid moderator register code.', {
                status: 400,
                code: 'invalid_register_code'
            });
        }

        const existingUser = await deps.usersRepository.findByEmail(email);
        if (existingUser)
            throw ServiceError.emailTaken();

        const consumed = await deps.registerCodesRepository.consumeCode(code);
        if (!consumed) {
            throw new ServiceError('Invalid moderator register code.', {
                status: 400,
                code: 'invalid_register_code'
            });
        }

        return createUserCore({ email, password, isModerator: true });
    }

    /**
     * Authenticates a user by email + password. After verifying, if the
     * password was in plain text (`needsRehash`), it rehashes it and updates
     * the DB; a rehash failure does not block the login.
     *
     * @param {{ email:string, password:string }} input
     * @returns {Promise<UserDTO>}
     * @throws {ServiceError} `401 invalid_credentials` if there is no user or
     *   the password does not match.
     */
    async function authenticateUser({ email, password }) {
        const user = await deps.usersRepository.findByEmail(email);
        if (!user) {
            throw new ServiceError(
                'La contraseña no se corresponde con el usuario proporcionado.',
                { status: 401, code: 'invalid_credentials' }
            );
        }

        const verification = await deps.passwordHasher.verifyPassword(password, user.password);
        if (!verification.matches) {
            throw new ServiceError(
                'La contraseña no se corresponde con el usuario proporcionado.',
                { status: 401, code: 'invalid_credentials' }
            );
        }

        if (verification.needsRehash && Number.isInteger(user.id) && user.id > 0) {
            try {
                const upgradedPasswordHash = await deps.passwordHasher.hashPassword(password);
                await deps.usersRepository.updatePassword(user.id, upgradedPasswordHash);
            } catch (caughtError) {
                // Authentication was already validated; we do not block the
                // login if the upgrade fails, but we log the failure to detect
                // persistent problems.
                const error = /** @type {any} */ (caughtError);
                const message = error?.message ? String(error.message) : String(error);
                if (typeof deps.logger?.warn === 'function')
                    deps.logger.warn(`Password rehash failed for user ${user.id}: ${message}`);
                else if (typeof deps.logger?.error === 'function')
                    deps.logger.error(`Password rehash failed for user ${user.id}: ${message}`);
            }
        }

        return User.fromPersistence(user).toSession();
    }

    return {
        registerUser,
        registerModeratorUser,
        authenticateUser
    };
}

module.exports = {
    createUsersService
};
