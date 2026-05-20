'use strict';

/**
 * @file Public router `/annotations` — serves the annotation HTML page.
 *
 * It exposes a single route: `GET /` that returns `public/annotations.html`.
 * Protected with `requirePageAuth` (redirects to `/login` if there is no session).
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
