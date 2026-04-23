'use strict';

const express = require('express');
const { requireApiAuth } = require('../middlewares/auth');

function createAnnotationsRouter({ annotationsController } = {}) {
    if (!annotationsController)
        throw new Error('annotationsController is required to build the annotations API router.');

    const router = express.Router();

    router.use(requireApiAuth);

    router.post('/check', annotationsController.check);
    router.post('/send', annotationsController.send);

    return router;
}

module.exports = {
    createAnnotationsRouter
};
