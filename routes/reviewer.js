'use strict';

/**
 * @file Public router `/reviewer` — serves the reviewer HTML page.
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

/**
 * Builds the `/reviewer` router (a single, protected page).
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
