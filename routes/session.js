'use strict';

/**
 * @file Construye el middleware de sesion (express-session) respaldado por
 * Prisma. `store` y `prisma` son inyectables para que los tests usen un
 * cliente alternativo sin sesion real.
 *
 */

const session = require('express-session');
const config = require('../config');
const { PrismaSessionStore } = require('../utils/prisma-session-store');

/**
 * Crea el middleware de sesion respaldado por Prisma.
 *
 * @param {{
 *   store?: any,
 *   secret?: string,
 *   cookie?: Record<string, any>,
 *   prisma?: any
 * }} [options]
 * @returns {import('express').RequestHandler}
 */
function createSessionMiddleware({ store, secret, cookie, prisma } = {}) {
    const resolvedStore = store || new PrismaSessionStore({ prisma });

    return session({
        saveUninitialized: false,
        resave: false,
        secret: secret || config.session.secret,
        cookie: cookie || config.session.cookie,
        store: resolvedStore
    });
}

module.exports = {
    createSessionMiddleware
};
