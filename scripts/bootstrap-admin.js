'use strict';

const { createUsersRepository } = require('../repositories/users-repository');
const { createPasswordHasher } = require('../services/password-hasher');
const { ROLE_ADMIN, isValidRole } = require('../constants/roles');

async function bootstrapAdmin({ email, password, role, deps } = {}) {
    const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const desiredRole = isValidRole(role) ? role : ROLE_ADMIN;

    if (normalisedEmail.length === 0)
        throw new Error('bootstrap-admin: email is required.');

    if (typeof password !== 'string' || password.length < 8)
        throw new Error('bootstrap-admin: password must be at least 8 characters.');

    const resolved = {
        usersRepository: (deps && deps.usersRepository) || createUsersRepository(),
        passwordHasher: (deps && deps.passwordHasher) || createPasswordHasher()
    };

    const existing = await resolved.usersRepository.findByEmail(normalisedEmail);

    if (existing && Number.isInteger(existing.idUser) && existing.idUser > 0) {
        await resolved.usersRepository.setRole(existing.idUser, desiredRole);
        return { created: false, promoted: true, idUser: existing.idUser, email: normalisedEmail, role: desiredRole };
    }

    const passwordHash = await resolved.passwordHasher.hashPassword(password);
    const created = await resolved.usersRepository.createUser({
        email: normalisedEmail,
        password: passwordHash,
        role: desiredRole
    });

    return {
        created: true,
        promoted: false,
        idUser: created && created.idUser,
        email: normalisedEmail,
        role: desiredRole
    };
}

async function runFromEnv({ env, logger, deps } = {}) {
    const source = env || process.env;
    const log = (logger && typeof logger.info === 'function') ? logger.info.bind(logger) : console.log.bind(console);

    const email = source.BOOTSTRAP_ADMIN_EMAIL;
    const password = source.BOOTSTRAP_ADMIN_PASSWORD;

    const result = await bootstrapAdmin({ email, password, deps });
    log(`bootstrap-admin: ${result.created ? 'created' : 'promoted'} user ${result.email} as ${result.role}`);
    return result;
}

module.exports = {
    bootstrapAdmin,
    runFromEnv
};

if (require.main === module) {
    runFromEnv()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(`bootstrap-admin failed: ${error && error.message ? error.message : error}`);
            process.exit(1);
        });
}
