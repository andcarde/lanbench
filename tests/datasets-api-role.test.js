'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createDatasetsApiRouter } = require('../routes/datasets-api');
const { ROLE_ADMIN, ROLE_ANNOTATOR } = require('../constants/roles');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error) return reject(error);
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}

function buildDatasetsController(postSpy) {
    return {
        async listAllDatasets(_req, res) { return res.status(200).json([]); },
        async createDataset(_req, res) {
            postSpy.called = true;
            return res.status(201).json({ ok: true });
        },
        async getDatasetById(_req, res) { return res.status(200).json({}); },
        async getDatasetSection(_req, res) { return res.status(200).json({}); },
        async getDatasetText(_req, res) { return res.status(200).send(''); }
    };
}

function buildApp(sessionUser, postSpy) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/api/datasets', createDatasetsApiRouter({
        datasetsController: buildDatasetsController(postSpy),
        uploadMiddleware: {
            single() {
                return function fakeUpload(_req, _res, next) { next(); };
            }
        }
    }));
    return app;
}

async function listen(app) {
    const port = await getFreePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, error => (error ? reject(error) : resolve(s)));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('datasets API role protection (T1.3)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('POST /api/datasets responde 403 para un anotador', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { idUser: 1, email: 'annot@example.com', role: ROLE_ANNOTATOR },
            postSpy
        );
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/datasets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            assert.equal(response.status, 403);
            const payload = await response.json();
            assert.equal(payload.error, true);
            assert.equal(payload.code, 'forbidden_role');
            assert.equal(postSpy.called, false);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('POST /api/datasets responde 401 si no hay sesion', async () => {
        const postSpy = { called: false };
        const app = buildApp(null, postSpy);
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/datasets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            assert.equal(response.status, 401);
            assert.equal(postSpy.called, false);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('GET /api/datasets sigue disponible para un anotador', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { idUser: 1, email: 'annot@example.com', role: ROLE_ANNOTATOR },
            postSpy
        );
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/datasets`);
            assert.equal(response.status, 200);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('POST /api/datasets deja pasar al controlador cuando el rol es admin', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { idUser: 2, email: 'admin@example.com', role: ROLE_ADMIN },
            postSpy
        );
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/datasets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            assert.equal(response.status, 201);
            assert.equal(postSpy.called, true);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });
});
