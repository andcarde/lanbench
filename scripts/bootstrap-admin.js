'use strict';

/**
 * @file `npm run bootstrap-admin` — crea o promociona a moderador inicial.
 *
 * Lee `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` del entorno,
 * normaliza el email a `trim().toLowerCase()` y exige que la contrasena
 * tenga al menos 8 caracteres. Si el usuario ya existe se le pone
 * `isModerator = true`; si no, se crea con la flag activa.
 */

const { createUsersRepository } = require('../repositories/users-repository');
const { createPasswordHasher } = require('../services/password-hasher');

/**
 * Resultado de `bootstrapAdmin`.
 *
 * @typedef {Object} BootstrapAdminResult
 * @property {boolean} created     - `true` si se creo un usuario nuevo.
 * @property {boolean} promoted    - `true` si se promociono uno existente.
 * @property {number}  userId
 * @property {string}  email
 * @property {true}    isModerator
 */

/**
 * Crea o promociona un usuario con `isModerator = true`.
 *
 * @param {{
 *   email?: string,
 *   password?: string,
 *   deps?: { usersRepository?: Record<string, any>, passwordHasher?: Record<string, any> }
 * }} [options]
 * @returns {Promise<BootstrapAdminResult>}
 * @throws {Error} Si `email` esta vacio o `password` tiene < 8 caracteres.
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
        userId: created && created.id,
        email: normalisedEmail,
        isModerator: true
    };
}

/**
 * Punto de entrada CLI: lee `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`
 * del entorno indicado y delega en {@link bootstrapAdmin}. Registra un
 * mensaje informativo en el logger.
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
            console.error(`bootstrap-admin failed: ${error && error.message ? error.message : error}`);
            process.exit(1);
        });
}
