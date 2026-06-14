'use strict';

/**
 * @file Router `/api/me` — JSON endpoints scoped to the current user.
 *
 * `requireApiAuth` protects all routes. The user is always taken from the
 * session inside the controller, so these endpoints can only ever return the
 * caller's own data.
 */

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

/**
 * Builds the `/api/me` router.
 *
 * @param {{ meController?: Record<string, any> }} [options]
 * @returns {import('express').Router}
 * @throws {Error} If `meController` is not provided.
 */
function createMeApiRouter({ meController } = {}) {
    if (!meController)
        throw new Error('meController is required to build the me API router.');

    const router = express.Router();

    router.use(requireApiAuth);

    router.get('/stats', meController.getMyStats);

    return router;
}

module.exports = {
    createMeApiRouter
};
