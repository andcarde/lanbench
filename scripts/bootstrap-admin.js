'use strict';

/**
 * @file `npm run bootstrap-admin` — creates or promotes the initial moderator.
 *
 * Reads `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from the
 * environment, normalizes the email to `trim().toLowerCase()` and requires the
 * password to be at least 8 characters. If the user already exists,
 * `isModerator = true` is set; otherwise, the user is created with the flag on.
 */

const { createUsersRepository } = require('../repositories/users-repository');
const { createPasswordHasher } = require('../services/password-hasher');

/**
 * Result of `bootstrapAdmin`.
 *
 * @typedef {Object} BootstrapAdminResult
 * @property {boolean} created     - `true` if a new user was created.
 * @property {boolean} promoted    - `true` if an existing one was promoted.
 * @property {number}  userId
 * @property {string}  email
 * @property {true}    isModerator
 */

/**
 * Creates or promotes a user with `isModerator = true`.
 *
 * @param {{
 *   email?: string,
 *   password?: string,
 *   deps?: { usersRepository?: Record<string, any>, passwordHasher?: Record<string, any> }
 * }} [options]
 * @returns {Promise<BootstrapAdminResult>}
 * @throws {Error} If `email` is empty or `password` has < 8 characters.
 */
async function bootstrapAdmin({ email, password, deps } = {}) {
    const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (normalisedEmail.length === 0)
        throw new Error('bootstrap-admin: email is required.');

    if (typeof password !== 'string' || password.length < 8)
        throw new Error('bootstrap-admin: password must be at least 8 characters.');

    const resolved = {
        usersRepository: (deps?.usersRepository) || createUsersRepository(),
        passwordHasher: (deps?.passwordHasher) || createPasswordHasher()
    };

    const existing = await resolved.usersRepository.findByEmail(normalisedEmail);

    if (existing && Number.isInteger(existing.id) && existing.id > 0) {
        await resolved.usersRepository.setIsModerator(existing.id, true);
        return {
            created: false,
            promoted: true,
            userId: existing.id,
            email: normalisedEmail,
            isModerator: true
        };
    }

    const passwordHash = await resolved.passwordHasher.hashPassword(password);
    const created = await resolved.usersRepository.createUser({
        email: normalisedEmail,
        password: passwordHash,
        isModerator: true
    });

    return {
        created: true,
        promoted: false,
        userId: created?.id,
        email: normalisedEmail,
        isModerator: true
    };
}

/**
 * CLI entry point: reads `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`
 * from the given environment and delegates to {@link bootstrapAdmin}. Logs an
 * informational message to the logger.
 *
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   logger?: { info?: (...args:any[])=>void },
 *   deps?: { usersRepository?: Record<string, any>, passwordHasher?: Record<string, any> }
 * }} [options]
 * @returns {Promise<BootstrapAdminResult>}
 */
async function runFromEnv({ env, logger, deps } = {}) {
    const source = env || process.env;
    const log = (logger && typeof logger.info === 'function') ? logger.info.bind(logger) : console.log.bind(console);

    const email = source.BOOTSTRAP_ADMIN_EMAIL;
    const password = source.BOOTSTRAP_ADMIN_PASSWORD;

    const result = await bootstrapAdmin({ email, password, deps });
    log(`bootstrap-admin: ${result.created ? 'created' : 'promoted'} user ${result.email} as moderator`);
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
            console.error(`bootstrap-admin failed: ${error?.message ? error.message : error}`);
            process.exit(1);
        });
}
