'use strict';

const express = require('express');
const { User } = require('../entities/user');

function createSessionApiRouter() {
    const router = express.Router();

    router.get('/me', (request, response) => {
        const user = User.fromSession(request && request.session && request.session.user);

        if (!user) {
            return response.status(401).json({
                error: true,
                message: 'Es necesario iniciar sesión.',
                code: 'unauthenticated'
            });
        }

        return response.status(200).json(user.toSession());
    });

    return router;
}

module.exports = {
    createSessionApiRouter
};
