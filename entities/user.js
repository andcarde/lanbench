'use strict';

/**
 * @file Canonical `User` entity. The shape persisted in the DB and the one
 * serialized into `request.session.user` share the same key `id` and only
 * differ in that the session form may carry additional non-canonical fields
 * (for legacy compatibility).
 *
 * Treat this class as the boundary between Prisma/session payloads (loose
 * objects with unknown keys) and the rest of the application (which expects
 * a validated, normalized `User`).
 *
 * @typedef {import('../types/typedefs').UserDTO} UserDTO
 * @typedef {import('../types/typedefs').SessionUserPayload} SessionUserPayload
 */

const { normalizeEmail } = require('../utils/validators');

/**
 * Raw data accepted by the constructor. Each field may arrive as
 * `string|number|boolean|null|undefined` when it comes from the DB or the
 * session; the constructor is responsible for normalizing them.
 *
 * @typedef {Object} UserConstructorInput
 * @property {number|string|null} [id]
 * @property {string|null} [email]
 * @property {boolean|number|string|null} [isModerator]
 */

/**
 * Canonical application user.
 *
 * A valid instance satisfies {@link User#isValid}: `id` is a positive integer
 * and `email` is a non-empty string. `isModerator` is always a boolean.
 */
class User {
    /**
     * @param {UserConstructorInput} [options]
     */
    constructor({ id, email, isModerator } = {}) {
        /** @type {number|null} Positive integer identifier, or null if invalid. */
        this.id = normalizeId(id);
        /** @type {string} Normalized email (trim + lowercase). */
        this.email = normalizeEmail(email, '');
        /** @type {boolean} Global moderator role. */
        this.isModerator = normalizeIsModerator(isModerator);
    }

    /**
     * Builds a `User` from a DB row (Prisma or RAW query).
     *
     * @param {Partial<UserDTO> & Record<string, unknown> | null | undefined} source
     * @returns {User}
     */
    static fromPersistence(source) {
        return new User({
            id: /** @type {number|string|null} */ (source?.id ?? null),
            email: /** @type {string|null} */ (source?.email ?? null),
            isModerator: /** @type {boolean|number|string|null} */ (source?.isModerator ?? null)
        });
    }

    /**
     * Builds a `User` from the payload stored in `request.session.user`.
     * Returns `null` if the session does not contain a valid user.
     *
     * @param {SessionUserPayload | null | undefined} source
     * @returns {User|null}
     */
    static fromSession(source) {
        if (!source || typeof source !== 'object')
            return null;

        const user = new User({
            id: /** @type {number|string|null} */ (source.id ?? null),
            email: /** @type {string|null} */ (source.email ?? null),
            isModerator: /** @type {boolean|number|string|null} */ (source.isModerator ?? null)
        });

        return user.isValid() ? user : null;
    }

    /**
     * Checks whether the instance is usable as an authenticated user.
     * @returns {boolean}
     */
    isValid() {
        return Number.isInteger(this.id)
            && /** @type {number} */ (this.id) > 0
            && typeof this.email === 'string'
            && this.email.length > 0;
    }

    /**
     * Serializes the user for storage in `request.session.user`.
     * @returns {UserDTO}
     * @throws {Error} If the instance does not pass {@link User#isValid}.
     */
    toSession() {
        if (!this.isValid())
            throw new Error('Cannot serialize an invalid user.');

        return {
            id: /** @type {number} */ (this.id),
            email: this.email,
            isModerator: this.isModerator
        };
    }
}

/**
 * Normalizes a numeric identifier accepted as `number|string`.
 * @param {number|string|null|undefined} value
 * @returns {number|null} Positive integer, or `null` if invalid.
 */
function normalizeId(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

/**
 * Converts any of the typical boolean representations in DB/session
 * (`true`, `1`, `'1'`) into a strict boolean.
 * @param {boolean|number|string|null|undefined} value
 * @returns {boolean}
 */
function normalizeIsModerator(value) {
    return value === true || value === 1 || value === '1';
}

module.exports = { User };
