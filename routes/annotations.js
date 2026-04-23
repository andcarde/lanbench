'use strict';

const express = require('express');
const path = require('path');
const { requirePageAuth } = require('../middlewares/auth');

const router = express.Router();

router.use(requirePageAuth);

router.get('/', (request, response) => {
    response.status(200).sendFile(path.join(__dirname, '..', 'public', 'annotations.html'));
});

module.exports = router;
