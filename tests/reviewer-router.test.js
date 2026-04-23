'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createReviewerRouter } = require('../routes/reviewer');
const { ROLE_ADMIN, ROLE_REVIEWER, ROLE_ANNOTATOR } = require('../constants/roles');

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

function buildApp(sessionUser) {
    const app = express();
    app.use((request, _response, next) => {
        request.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/reviewer', createReviewerRouter());
    return app;
}

async function listen(app) {
    const port = await getFreePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, error => (error ? reject(error) : resolve(s)));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('reviewer router placeholder (T1.5)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('redirige a /login si no hay sesion', async () => {
        const app = buildApp(null);
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`, { redirect: 'manual' });
            assert.ok([302, 303].includes(response.status));
            assert.equal(response.headers.get('location'), '/login');
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('redirige a /forbidden si el rol es annotator', async () => {
        const app = buildApp({ idUser: 1, email: 'u@example.com', role: ROLE_ANNOTATOR });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`, { redirect: 'manual' });
            assert.ok([302, 303].includes(response.status));
            assert.equal(response.headers.get('location'), '/forbidden');
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('responde 204 al reviewer autenticado', async () => {
        const app = buildApp({ idUser: 2, email: 'rev@example.com', role: ROLE_REVIEWER });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`);
            assert.equal(response.status, 204);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('responde 204 tambien al admin autenticado', async () => {
        const app = buildApp({ idUser: 3, email: 'a@example.com', role: ROLE_ADMIN });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`);
            assert.equal(response.status, 204);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });
});
