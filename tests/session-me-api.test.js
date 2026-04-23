'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createSessionApiRouter } = require('../routes/session-api');
const { ROLE_ADMIN, ROLE_REVIEWER } = require('../constants/roles');

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
    app.use('/api/session', createSessionApiRouter());
    return app;
}

async function listen(app) {
    const port = await getFreePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, error => (error ? reject(error) : resolve(s)));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('GET /api/session/me (T1.4)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('devuelve 401 si no hay sesion', async () => {
        const app = buildApp(null);
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 401);
            const payload = await response.json();
            assert.equal(payload.error, true);
            assert.equal(payload.code, 'unauthenticated');
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('devuelve el usuario canonico con rol admin', async () => {
        const app = buildApp({ idUser: 5, email: 'admin@example.com', role: ROLE_ADMIN });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.deepEqual(payload, {
                idUser: 5,
                email: 'admin@example.com',
                role: ROLE_ADMIN
            });
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('devuelve el usuario canonico con rol reviewer', async () => {
        const app = buildApp({ idUser: 7, email: 'rev@example.com', role: ROLE_REVIEWER });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.equal(payload.role, ROLE_REVIEWER);
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });

    it('por defecto rellena annotator si la sesion no trae role', async () => {
        const app = buildApp({ idUser: 2, email: 'legacy@example.com' });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.equal(payload.role, 'annotator');
        } finally {
            await new Promise(resolve => server.close(() => resolve()));
        }
    });
});
