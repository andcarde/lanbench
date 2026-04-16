'use strict';

const express = require('express');
const path = require('path');
const usersController = require('../business/users-controller');
const datasetsController = require('../business/datasets-controller');
const annotationsController = require('../business/annotations-controller');

const router = express.Router();

router.get('/tasks', (request, response) => {
    response.status(200).sendFile(path.join(__dirname, '..', 'public', 'datasets.html'));
});

router.get('/annotations', (request, response) => {
    response.status(200).sendFile(path.join(__dirname, '..', 'public', 'annotations.html'));
});

router.get('/api/datasets', datasetsController.listDatasets);
router.get('/api/datasets/:id', datasetsController.getDatasetById);
router.post('/api/datasets', datasetsController.createDataset);

router.post('/register', usersController.register);
router.post('/crear-sesion', usersController.login);

router.post('/check', annotationsController.check);
router.post('/annotations/check', annotationsController.check);

router.post('/send', annotationsController.send);
router.post('/annotations/send', annotationsController.send);

module.exports = router;