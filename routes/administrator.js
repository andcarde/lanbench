'use strict';

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requireApiAuth);

router.post('/logout', (request, response) => {
    request.session.destroy(function (error) {
        if (error) {
            return response.status(500).json({
                ok: false,
                message: 'Se ha producido un error inesperado al cerrar la sesión.'
            });
        }

        response.clearCookie('connect.sid', { path: '/' });
        return response.status(200).json({
            ok: true,
            redirectTo: '/login'
        });
    });
});

module.exports = router;
