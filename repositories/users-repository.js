'use strict';

/**
 * @file Repository for the `User` table.
 *
 * Exposes safe lookups by email and update operations (password,
 * `isModerator`). The queries return only the necessary fields so that
 * tests/services do not couple to the internal schema.
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
const { normalizeEmail } = require('../utils/validators');

/**
 * Builds the users repository.
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createUsersRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Retrieves a user by email (including `password`, for login).
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
     * Finds a user by exact email. Accepts the email as-is or in lowercase,
     * to tolerate DBs with mixed casing. Does not return the `password`
     * (administrative use, not login).
     *
     * @param {string} email
     * @returns {Promise<UserRow|null>}
     */
    async function findByExactEmail(email) {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail)
            return null;

        return deps.prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: {
                id: true,
                email: true,
                isModerator: true
            }
        });
    }

    /**
     * Creates a user. `isModerator` is only persisted if it arrives as a
     * boolean (so the caller decides the default explicitly).
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
     * Updates a user's password hash.
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
     * Updates a user's global `isModerator` flag.
     *
     * @param {number} userId
     * @param {boolean} isModerator
     * @returns {Promise<UserRow>}
     */
    async function setIsModerator(userId, isModerator) {
        return deps.prisma.user.update({
            where: { id: userId },
            data: { isModerator: Boolean(isModerator) },
            select: { id: true, email: true, isModerator: true }
        });
    }

    /**
     * Lists every user with the fields safe to expose to a moderator (no
     * password). Ordered by id so the admin roster is stable. Backs US-22
     * server-role management.
     *
     * @returns {Promise<UserRow[]>}
     */
    async function listUsers() {
        return deps.prisma.user.findMany({
            orderBy: { id: 'asc' },
            select: { id: true, email: true, isModerator: true }
        });
    }

    return {
        findByEmail,
        findByExactEmail,
        createUser,
        updatePassword,
        setIsModerator,
        listUsers
    };
}

module.exports = {
    createUsersRepository
};
