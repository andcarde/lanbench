'use strict';

const { User } = require('../entities/user');
const { createUsersRepository } = require('../repositories/users-repository');
const { createPasswordHasher } = require('./password-hasher');
const { ServiceError } = require('./service-error');

function createUsersService({ usersRepository, passwordHasher } = {}) {
    const deps = {
        usersRepository: usersRepository || createUsersRepository(),
        passwordHasher: passwordHasher || createPasswordHasher()
    };

    async function registerUser({ email, password }) {
        const existingUser = await deps.usersRepository.findByEmail(email);
        if (existingUser)
            throw new ServiceError('Email already registered.', { status: 409, code: 'email_taken' });

        const passwordHash = await deps.passwordHasher.hashPassword(password);
        return deps.usersRepository.createUser({
            email,
            password: passwordHash
        });
    }

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

        if (verification.needsRehash && Number.isInteger(user.idUser) && user.idUser > 0) {
            try {
                const upgradedPasswordHash = await deps.passwordHasher.hashPassword(password);
                await deps.usersRepository.updatePassword(user.idUser, upgradedPasswordHash);
            } catch (_error) {
                // La autenticación ya fue validada; no bloqueamos el login si el upgrade falla.
            }
        }

        return User.fromPersistence(user).toSession();
    }

    return {
        registerUser,
        authenticateUser
    };
}

module.exports = {
    createUsersService
};
