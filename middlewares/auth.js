'use strict';

/**
 * @file Authentication / authorization middlewares.
 *
 * Resuelve el usuario actual a partir de `request.session.user` o de un
 * usuario ya unido a `request.user`, instancia la clase canonica `User` y
 * decide la respuesta segun el tipo de endpoint (paginas HTML vs JSON API).
 *
 * @typedef {import('express').Request}       ExpressRequest
 * @typedef {import('express').Response}      ExpressResponse
 * @typedef {import('express').NextFunction}  ExpressNext
 * @typedef {import('express').RequestHandler} ExpressMiddleware
 */

const { User } = require('../entities/user');

/**
 * Resuelve el usuario actual a partir de `request.user` (si ya es una
 * instancia de {@link User}) o de `request.session.user`.
 *
 * @param {ExpressRequest & { user?: User|object }} request
 * @returns {User|null} Usuario valido o `null`.
 */
function resolveSessionUser(request) {
    if (request && request.user instanceof User)
        return request.user;
    return User.fromSession(request?.session?.user || null);
}

/**
 * Resuelve el id del usuario actual aceptando `request.user` como objeto
 * plano, instancia {@link User} o sesion serializada. Util cuando solo se
 * necesita el `id` y no la instancia completa.
 *
 * @param {ExpressRequest & { user?: { id?: unknown } }} request
 * @returns {number|null} Id entero positivo o `null`.
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
 * Middleware para paginas HTML: si no hay usuario autenticado, redirige a
 * `/login` con cookie `message`.
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
 * Middleware para endpoints JSON: si no hay usuario autenticado, responde
 * con `401` y payload estandar.
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
 * Construye un middleware HTML que exige rol global `moderator`.
 * Sin sesion redirige a `/login`; sin rol redirige a `/forbidden`.
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

        if (user.isModerator !== true)
            return response.redirect('/forbidden');

        /** @type {*} */ (request).user = user;
        return next();
    };
}

/**
 * Construye un middleware JSON que exige rol global `moderator`.
 * Sin sesion responde `401`; sin rol responde `403`.
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
