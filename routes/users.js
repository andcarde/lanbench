'use strict';

/**
 * @file Router de paginas y altas de usuario montado en `/`.
 *
 *   - `GET  /tasks`              pagina protegida con la lista de tareas.
 *   - `POST /register`           alta de usuario normal.
 *   - `POST /register/moderator` alta como moderador (consume codigo).
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

/**
 * Construye el router de usuarios.
 *
 * @param {{ usersController: Record<string, any> }} options
 * @returns {import('express').Router}
 */
function createUsersRouter({ usersController }) {
    const router = express.Router();

    router.get('/tasks', requirePageAuth, (_request, response) => {
        response.status(200).sendFile(path.join(__dirname, '..', 'public', 'datasets.html'));
    });

    router.post('/register', usersController.register);
    router.post('/register/moderator', usersController.registerModerator);

    return router;
}

module.exports = { createUsersRouter };
