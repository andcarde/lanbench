'use strict';

/**
 * @file Public router (`/`, `/register`, `/login`) — pages accessible without
 * a session.
 *
 *   - `GET /`         redirects to `/tasks` or `/login` depending on whether there is a session.
 *   - `GET /register` serves `public/register.html`.
 *   - `GET /login`    serves `public/login.html`.
 */

const express = require('express');
const path = require('node:path');

const router = express.Router();

router.get('/', (request, response) => {
    if (request.session?.user)
        return response.redirect('/tasks');

    return response.redirect('/login');
});

router.get('/register', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

router.get('/login', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

module.exports = router;
