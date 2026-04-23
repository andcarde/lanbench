'use strict';

const { User } = require('../entities/user');
const { isValidRole } = require('../constants/roles');

function requirePageAuth(request, response, next) {
    const user = User.fromSession(request && request.session && request.session.user);

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
    return response.redirect('/login');
}

function requireApiAuth(request, response, next) {
    const user = User.fromSession(request && request.session && request.session.user);

    if (user) {
        request.user = user;
        return next();
    }

    return response.status(401).json({
        message: 'Es necesario iniciar sesión.',
        redirectTo: '/login'
    });
}

function normalizeAllowedRoles(args) {
    const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const roles = flat.filter(isValidRole);

    if (roles.length === 0)
        throw new Error('requireRole needs at least one valid role.');

    return roles;
}

function requirePageRole(...allowedRolesArgs) {
    const allowedRoles = normalizeAllowedRoles(allowedRolesArgs);

    return function requirePageRoleMiddleware(request, response, next) {
        const user = User.fromSession(request && request.session && request.session.user);

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

        if (!allowedRoles.includes(user.role))
            return response.redirect('/forbidden');

        request.user = user;
        return next();
    };
}

function requireApiRole(...allowedRolesArgs) {
    const allowedRoles = normalizeAllowedRoles(allowedRolesArgs);

    return function requireApiRoleMiddleware(request, response, next) {
        const user = User.fromSession(request && request.session && request.session.user);

        if (!user) {
            return response.status(401).json({
                error: true,
                message: 'Es necesario iniciar sesión.',
                code: 'unauthenticated',
                redirectTo: '/login'
            });
        }

        if (!allowedRoles.includes(user.role)) {
            return response.status(403).json({
                error: true,
                message: 'No tiene permisos suficientes para esta acción.',
                code: 'forbidden_role'
            });
        }

        request.user = user;
        return next();
    };
}

module.exports = {
    requirePageAuth,
    requireApiAuth,
    requirePageRole,
    requireApiRole
};
