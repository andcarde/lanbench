'use strict';

/**
 * @file Router publico (`/`, `/register`, `/login`) — paginas accesibles
 * sin sesion.
 *
 *   - `GET /`         redirige a `/tasks` o `/login` segun haya sesion.
 *   - `GET /register` sirve `public/register.html`.
 *   - `GET /login`    sirve `public/login.html`.
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
