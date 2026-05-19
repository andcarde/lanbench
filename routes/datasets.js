'use strict';

/**
 * @file Router publico `/datasets` — paginas HTML de dataset.
 *
 *   - `GET /`             redirige a `/tasks`.
 *   - `GET /:id/view`     pagina de visualizacion del dataset.
 *   - `GET /:id/admin`    pagina de administracion del dataset.
 *
 * Todas protegidas con `requirePageAuth`.
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requirePageAuth);

router.get('/', (_request, response) => {
    response.redirect('/tasks');
});

router.get('/:id/view', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'dataset-view.html'));
});

router.get('/:id/admin', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'dataset-admin.html'));
});

module.exports = router;
