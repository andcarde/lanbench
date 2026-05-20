'use strict';

/**
 * @file Router for user pages and sign-ups, mounted at `/`.
 *
 *   - `GET  /tasks`              protected page with the task list.
 *   - `POST /register`           normal user sign-up.
 *   - `POST /register/moderator` moderator sign-up (consumes a code).
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

/**
 * Builds the users router.
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
