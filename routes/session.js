'use strict';

/**
 * @file Builds the session middleware (express-session) backed by Prisma.
 * `store` and `prisma` are injectable so tests can use an alternative client
 * without a real session.
 *
 */

const session = require('express-session');
const config = require('../config');
const { PrismaSessionStore } = require('../utils/prisma-session-store');

/**
 * Creates the Prisma-backed session middleware.
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
