'use strict';

/**
 * @file Authentication / authorization middlewares.
 *
 * Resolves the current user from `request.session.user` or a user already
 * attached to `request.user`, instantiates the canonical `User` class and
 * decides the response based on the endpoint type (HTML pages vs JSON API).
 *
 * @typedef {import('express').Request}       ExpressRequest
 * @typedef {import('express').Response}      ExpressResponse
 * @typedef {import('express').NextFunction}  ExpressNext
 * @typedef {import('express').RequestHandler} ExpressMiddleware
 */

const { User } = require('../entities/user');

/**
 * Resolves the current user from `request.user` (if it is already a
 * {@link User} instance) or from `request.session.user`.
 *
 * @param {ExpressRequest & { user?: User|object }} request
 * @returns {User|null} Valid user, or `null`.
 */
function resolveSessionUser(request) {
    if (request && request.user instanceof User)
        return request.user;
    return User.fromSession(request?.session?.user || null);
}

/**
 * Resolves the current user's id, accepting `request.user` as a plain object,
 * a {@link User} instance or a serialized session. Useful when only the `id`
 * is needed and not the full instance.
 *
 * @param {ExpressRequest & { user?: { id?: unknown } }} request
 * @returns {number|null} Positive integer id, or `null`.
 */
function resolveSessionUserId(request) {
    const directId = request?.user?.id;
    if (Number.isInteger(directId) && /** @type {number} */ (directId) > 0)
        return /** @type {number} */ (directId);

    const sessionId = request?.session?.user?.id;
    if (Number.isInteger(sessionId) && /** @type {number} */ (sessionId) > 0)
        return /** @type {number} */ (sessionId);

    const user = User.fromSession(request?.session?.user || null);
    return user ? user.id : null;
}

/**
 * Middleware for HTML pages: if there is no authenticated user, redirects to
 * `/login` with a `message` cookie.
 *
 * @param {ExpressRequest & { user?: User }} request
 * @param {ExpressResponse} response
 * @param {ExpressNext} next
 * @returns {void}
 */
function requirePageAuth(request, response, next) {
    const user = resolveSessionUser(request);

    if (user) {
        request.user = user;
        return next();
    }

    response.cookie('message',
        {
            title: 'Acceso denegado',
            message: 'Es necesario que se identifique para acceder a dicha dirección'
        },
        { maxAge: 5000 }
    );
    response.redirect('/login');
}

/**
 * Middleware for JSON endpoints: if there is no authenticated user, responds
 * with `401` and a standard payload.
 *
 * @param {ExpressRequest & { user?: User }} request
 * @param {ExpressResponse} response
 * @param {ExpressNext} next
 * @returns {void}
 */
function requireApiAuth(request, response, next) {
    const user = resolveSessionUser(request);

    if (user) {
        request.user = user;
        return next();
    }

    response.status(401).json({
        error: true,
        message: 'Es necesario iniciar sesión.',
        code: 'unauthenticated',
        redirectTo: '/login'
    });
}

/**
 * Builds an HTML middleware that requires the global `moderator` role.
 * Without a session it redirects to `/login`; without the role, to `/forbidden`.
 *
 * @returns {ExpressMiddleware}
 */
function requirePageModerator() {
    return function requirePageModeratorMiddleware(request, response, next) {
        const user = resolveSessionUser(request);

        if (!user) {
            response.cookie('message',
                {
                    title: 'Acceso denegado',
                    message: 'Es necesario que se identifique para acceder a dicha dirección'
                },
                { maxAge: 5000 }
            );
            return response.redirect('/login');
        }

        if (user.isModerator !== true) {
            return response.redirect('/forbidden');
        }

        /** @type {*} */ (request).user = user;
        return next();
    };
}

/**
 * Builds a JSON middleware that requires the global `moderator` role.
 * Without a session it responds `401`; without the role, `403`.
 *
 * @returns {ExpressMiddleware}
 */
function requireApiModerator() {
    return function requireApiModeratorMiddleware(request, response, next) {
        const user = resolveSessionUser(request);

        if (!user) {
            return response.status(401).json({
                error: true,
                message: 'Es necesario iniciar sesión.',
                code: 'unauthenticated',
                redirectTo: '/login'
            });
        }

        if (user.isModerator !== true) {
            return response.status(403).json({
                error: true,
                message: 'No tiene permisos suficientes para esta acción.',
                code: 'forbidden_role'
            });
        }

        /** @type {*} */ (request).user = user;
        return next();
    };
}

module.exports = {
    resolveSessionUser,
    resolveSessionUserId,
    requirePageAuth,
    requireApiAuth,
    requirePageModerator,
    requireApiModerator
};
