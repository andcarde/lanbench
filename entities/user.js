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

/**
 * Datos crudos aceptados por el constructor. Cada campo puede llegar como
 * `string|number|boolean|null|undefined` cuando proceden de la BD o de la
 * sesion; el constructor se encarga de normalizarlos.
 *
 * @typedef {Object} UserConstructorInput
 * @property {number|string|null} [id]
 * @property {string|null} [email]
 * @property {boolean|number|string|null} [isModerator]
 */

/**
 * Usuario canonico de la aplicacion.
 *
 * Una instancia valida cumple {@link User#isValid}: `id` es entero positivo y
 * `email` es una cadena no vacia. `isModerator` es siempre booleano.
 */
class User {
    /**
     * @param {UserConstructorInput} [options]
     */
    constructor({ id, email, isModerator } = {}) {
        /** @type {number|null} Identificador entero positivo o null si no valido. */
        this.id = normalizeId(id);
        /** @type {string} Email normalizado (trim + lowercase). */
        this.email = normalizeEmail(email);
        /** @type {boolean} Rol global de moderador. */
        this.isModerator = normalizeIsModerator(isModerator);
    }

    /**
     * Construye un `User` a partir de una fila de BD (Prisma o consulta RAW).
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
     * Construye un `User` desde el payload almacenado en `request.session.user`.
     * Devuelve `null` si la sesion no contiene un usuario valido.
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
     * Comprueba si la instancia es utilizable como usuario autenticado.
     * @returns {boolean}
     */
    isValid() {
        return Number.isInteger(this.id)
            && /** @type {number} */ (this.id) > 0
            && typeof this.email === 'string'
            && this.email.length > 0;
    }

    /**
     * Serializa el usuario para guardarlo en `request.session.user`.
     * @returns {UserDTO}
     * @throws {Error} Si la instancia no supera {@link User#isValid}.
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
 * Normaliza un identificador numerico aceptado como `number|string`.
 * @param {number|string|null|undefined} value
 * @returns {number|null} Entero positivo, o `null` si invalido.
 */
function normalizeId(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
}

/**
 * Normaliza un email: si no es string, devuelve `''`; en otro caso aplica
 * `trim().toLowerCase()`.
 * @param {string|null|undefined} value
 * @returns {string}
 */
function normalizeEmail(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim().toLowerCase();
}

/**
 * Convierte cualquiera de las representaciones tipicas de boolean en BD/sesion
 * (`true`, `1`, `'1'`) en un booleano estricto.
 * @param {boolean|number|string|null|undefined} value
 * @returns {boolean}
 */
function normalizeIsModerator(value) {
    return value === true || value === 1 || value === '1';
}

module.exports = { User };
