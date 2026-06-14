'use strict';

/**
 * @file Public router `/datasets` — dataset HTML pages.
 *
 *   - `GET /`             canonical dataset listing page (`datasets.html`).
 *   - `GET /:id/view`     dataset view page.
 *   - `GET /:id/admin`    dataset administration page.
 *
 * All protected with `requirePageAuth`.
 */

const express = require('express');
const path = require('node:path');
const { requirePageAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requirePageAuth);

router.get('/', (_request, response) => {
    response.status(200).sendFile(path.join(__dirname, '..', 'public', 'datasets.html'));
});

router.get('/:id/view', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'dataset-view.html'));
});

router.get('/:id/admin', (_request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'dataset-admin.html'));
});

module.exports = router;
