'use strict';

const express = require('express');
const { requirePageRole } = require('../middlewares/auth');
const { ROLE_REVIEWER, ROLE_ADMIN } = require('../constants/roles');

function createReviewerRouter() {
    const router = express.Router();

    router.use(requirePageRole(ROLE_REVIEWER, ROLE_ADMIN));

    router.get('/', (_request, response) => {
        return response.status(204).end();
    });

    return router;
}

module.exports = {
    createReviewerRouter
};
