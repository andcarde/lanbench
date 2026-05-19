'use strict';

/**
 * @file Repository for the `User` table.
 *
 * Expone busquedas seguras por email y operaciones de actualizacion
 * (password, `isModerator`). Las consultas devuelven solo los campos
 * necesarios para que tests/servicios no se acoplen al esquema interno.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} UserRow
 * @property {number} id
 * @property {string} email
 * @property {boolean} isModerator
 *
 * @typedef {UserRow & { password: string }} UserRowWithPassword
 */

const defaultPrisma = require('../prisma/client');

/**
 * Construye el repositorio de usuarios.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createUsersRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Recupera un usuario por email (incluyendo `password`, para login).
     *
     * @param {string} email
     * @returns {Promise<UserRowWithPassword|null>}
     */
    async function findByEmail(email) {
        return deps.prisma.user.findFirst({
            where: { email },
            select: {
                id: true,
                email: true,
                password: true,
                isModerator: true
            }
        });
    }

    /**
     * Busca un usuario por email exacto. Acepta el email tal cual o en
     * minusculas, para tolerar BDs con mezcla de mayusculas. No devuelve
     * la `password` (uso administrativo, no login).
     *
     * @param {string} email
     * @returns {Promise<UserRow|null>}
     */
    async function findByExactEmail(email) {
        const normalizedEmail = normalizeExactEmail(email);
        if (!normalizedEmail)
            return null;

        return deps.prisma.user.findFirst({
            where: {
                OR: [
                    { email: normalizedEmail },
                    { email: String(email).trim() }
                ]
            },
            select: {
                id: true,
                email: true,
                isModerator: true
            }
        });
    }

    /**
     * Crea un usuario. `isModerator` solo se persiste si llega como
     * booleano (asi el caller decide el default explicitamente).
     *
     * @param {{ email:string, password:string, isModerator?: boolean }} input
     * @returns {Promise<UserRow>}
     */
    async function createUser({ email, password, isModerator }) {
        /** @type {Record<string, any>} */
        const data = { email, password };
        if (typeof isModerator === 'boolean')
            data.isModerator = isModerator;

        return deps.prisma.user.create({ data });
    }

    /**
     * Actualiza el hash de contraseña de un usuario.
     *
     * @param {number} userId
     * @param {string} password
     * @returns {Promise<UserRow>}
     */
    async function updatePassword(userId, password) {
        return deps.prisma.user.update({
            where: { id: userId },
            data: { password }
        });
    }

    /**
     * Actualiza el flag global `isModerator` de un usuario.
     *
     * @param {number} userId
     * @param {boolean} isModerator
     * @returns {Promise<UserRow>}
     */
    async function setIsModerator(userId, isModerator) {
        return deps.prisma.user.update({
            where: { id: userId },
            data: { isModerator: Boolean(isModerator) }
        });
    }

    return {
        findByEmail,
        findByExactEmail,
        createUser,
        updatePassword,
        setIsModerator
    };
}

/**
 * Normaliza un email para busquedas exactas: `trim()` + `toLowerCase()`.
 * Devuelve `null` si el valor no es una cadena util.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeExactEmail(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

module.exports = {
    createUsersRepository,
    normalizeExactEmail
};
