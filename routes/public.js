// public.js
'use strict';

const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/', (request, response) => {
    if (request.session && request.session.usuario)
        return response.redirect('/tasks');

    return response.redirect('/login');
});

router.get('/registro', (request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

router.get('/register', (request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});

router.get('/login', (request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

module.exports = router;