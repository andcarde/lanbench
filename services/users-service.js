'use strict';

/**
 * @file Users service — registro y autenticacion.
 *
 * Centraliza el flujo de alta de usuarios (normal y como moderador, este
 * ultimo consumiendo un `register_code`) y el flujo de login, incluido el
 * `re-hash` automatico cuando la contrasena almacenada estaba en texto plano.
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

/** Patron canonico de los codigos de registro de moderador (16 alfanumericos). */
const REGISTER_CODE_PATTERN = /^[A-Za-z0-9]{16}$/;

/**
 * Construye el servicio de usuarios.
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
     * Crea el usuario tras hashear la contrasena. Centraliza el camino comun
     * de registro normal y registro como moderador para evitar divergencias.
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
     * Da de alta a un usuario normal (no moderador). Falla si el email ya
     * existe.
     *
     * @param {{ email:string, password:string }} input
     * @returns {Promise<Record<string, any>>}
     * @throws {ServiceError} `409 email_taken` si el email ya esta registrado.
     */
    async function registerUser({ email, password }) {
        const existingUser = await deps.usersRepository.findByEmail(email);
        if (existingUser)
            throw new ServiceError('Email already registered.', { status: 409, code: 'email_taken' });

        return createUserCore({ email, password });
    }

    /**
     * Registra un usuario con `isModerator=true`, consumiendo un
     * `register_code` valido. El codigo solo se borra si el alta puede
     * completarse (email libre + codigo presente en BD).
     *
     * @param {{ email:string, password:string, code:string }} input
     * @returns {Promise<Record<string, any>>}
     * @throws {ServiceError} `400 invalid_register_code` si el codigo es
     *   invalido o ya consumido; `409 email_taken` si el email existe.
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
            throw new ServiceError('Email already registered.', { status: 409, code: 'email_taken' });

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
     * Autentica un usuario por email + password. Tras verificar, si la
     * contrasena estaba en texto plano (`needsRehash`), la rehashea y
     * actualiza en BD; un fallo del rehash no bloquea el login.
     *
     * @param {{ email:string, password:string }} input
     * @returns {Promise<UserDTO>}
     * @throws {ServiceError} `401 invalid_credentials` si no hay usuario o
     *   la contrasena no coincide.
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
                // La autenticacion ya fue validada; no bloqueamos el login si
                // el upgrade falla, pero registramos el fallo para detectar
                // problemas persistentes.
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
