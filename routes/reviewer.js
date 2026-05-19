'use strict';

/**
 * @file Router publico `/reviewer` — sirve la pagina HTML del revisor.
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

/**
 * Construye el router `/reviewer` (una sola pagina, protegida).
 *
 * @returns {import('express').Router}
 */
function createReviewerRouter() {
    const router = express.Router();

    router.use(requirePageAuth);

    router.get('/', (_request, response) => {
        response.sendFile(path.join(__dirname, '..', 'public', 'reviewer.html'));
    });

    return router;
}

module.exports = {
    createReviewerRouter
};
