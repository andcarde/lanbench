'use strict';

/**
 * @file Public router `/my-stats` — serves the personal-statistics HTML page.
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

/**
 * Builds the `/my-stats` router (a single, protected page).
 *
 * @returns {import('express').Router}
 */
function createMeRouter() {
    const router = express.Router();

    router.use(requirePageAuth);

    router.get('/', (_request, response) => {
        response.sendFile(path.join(__dirname, '..', 'public', 'own-stads.html'));
    });

    return router;
}

module.exports = {
    createMeRouter
};
