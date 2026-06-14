'use strict';

/**
 * @file Router for user pages and sign-ups, mounted at `/`.
 *
 *   - `POST /register`           normal user sign-up.
 *   - `POST /register/moderator` moderator sign-up (consumes a code).
 *
 * The canonical dataset listing page lives at `GET /datasets` (see
 * `routes/datasets.js`); there is no longer a `/tasks` page.
 */

const express = require('express');

/**
 * Builds the users router.
 *
 * @param {{ usersController: Record<string, any> }} options
 * @returns {import('express').Router}
 */
function createUsersRouter({ usersController }) {
    const router = express.Router();

    router.post('/register', usersController.register);
    router.post('/register/moderator', usersController.registerModerator);

    return router;
}

module.exports = { createUsersRouter };
