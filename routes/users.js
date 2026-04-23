'use strict';

const express = require('express');
const path = require('path');
const { requirePageAuth } = require('../middlewares/auth');

function createUsersRouter({ usersController }) {
    const router = express.Router();

    router.get('/tasks', requirePageAuth, (request, response) => {
        response.status(200).sendFile(path.join(__dirname, '..', 'public', 'datasets.html'));
    });

    router.post('/register', usersController.register);
    router.post('/create-session', usersController.login);

    return router;
}

module.exports = { createUsersRouter };
