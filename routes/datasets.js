'use strict';

const express = require('express');
const path = require('path');
const { requirePageAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requirePageAuth);

router.get('/', (_request, response) => {
    response.redirect('/tasks');
});

router.get('/:id/view', (request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'dataset-view.html'));
});

module.exports = router;
