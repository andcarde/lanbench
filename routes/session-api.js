'use strict';

/**
 * @file Router `/api/session` — expone la sesion como recurso REST.
 *
 *   - `GET    /me` -> usuario actual (UserDTO) o 401.
 *   - `POST   /`   -> iniciar sesion (delegado a `usersController.login`).
 *   - `DELETE /`   -> cerrar sesion (destruye la cookie `connect.sid`).
 *
 * @typedef {import('express').Request}  ExpressRequest
 * @typedef {import('express').Response} ExpressResponse
 */

const express = require('express');
const { createUsersController } = require('../controllers/users-controller');
const { resolveSessionUser } = require('../middlewares/auth');
const { buildApiErrorPayload } = require('../utils/api-error-payload');

/**
 * Construye el router `/api/session`.
 *
 * @param {{ usersController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 */
function createSessionApiRouter({ usersController } = {}) {
    const controller = usersController || createUsersController();
    const router = express.Router();

    router.get('/me', (request, response) => {
        const user = resolveSessionUser(request);

        if (!user) {
            return response.status(401).json(
                buildApiErrorPayload('Es necesario iniciar sesión.', 'unauthenticated')
            );
        }

        return response.status(200).json(user.toSession());
    });

    router.post('/', controller.login);

    router.delete('/', (request, response) => {
        /** @type {any} */ (request.session).destroy(function (/** @type {any} */ error) {
            if (error) {
                return response.status(500).json(
                    buildApiErrorPayload('Se ha producido un error inesperado al cerrar la sesión.', 'logout_failed')
                );
            }

            response.clearCookie('connect.sid', { path: '/' });
            return response.status(200).json({
                ok: true,
                redirectTo: '/login'
            });
        });
    });

    return router;
}

module.exports = {
    createSessionApiRouter
};
