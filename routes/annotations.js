'use strict';

/**
 * @file Router publico `/annotations` — sirve la pagina HTML de anotacion.
 *
 * Solo expone una ruta: `GET /` que devuelve `public/annotations.html`.
 * Protegida con `requirePageAuth` (redirige a `/login` si no hay sesion).
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requirePageAuth);

router.get('/', (_request, response) => {
    response.status(200).sendFile(path.join(__dirname, '..', 'public', 'annotations.html'));
});

module.exports = router;
