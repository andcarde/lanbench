'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createSessionApiRouter } = require('../../../routes/session-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = (/** @type {import("node:net").AddressInfo} */ (server.address()));
            server.close(error => {
                if (error) return reject(error);
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}

/**
 * Construye una app Express minima que inyecta `request.session` antes del router.
 * @param {*} sessionUser - Payload de usuario en sesion, o null para sesion sin usuario.
 * @returns {*} Aplicacion Express lista para escuchar.
 */
function buildApp(sessionUser) {
    const app = express();
    app.use((/** @type {*} */ request, /** @type {*} */ _response, /** @type {*} */ next) => {
        request.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/api/session', createSessionApiRouter());
    return app;
}

/**
 * Pone una app Express a escuchar en un puerto libre y devuelve el handle.
 * @param {*} app - Aplicacion Express.
 * @returns {Promise<{server:*, baseUrl:string}>} Servidor y base URL.
 */
async function listen(app) {
    const port = await getFreePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, (/** @type {*} */ error) => (error ? reject(error) : resolve(s)));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('GET /api/session/me', function () {
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
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('devuelve el usuario canonico con isModerator=true', async () => {
        const app = buildApp({ id: 5, email: 'mod@example.com', isModerator: true });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.deepEqual(payload, {
                id: 5,
                email: 'mod@example.com',
                isModerator: true
            });
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('devuelve el usuario canonico con isModerator=false', async () => {
        const app = buildApp({ id: 7, email: 'normal@example.com', isModerator: false });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.equal(payload.isModerator, false);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('por defecto rellena isModerator=false si la sesion no trae el flag', async () => {
        const app = buildApp({ id: 2, email: 'legacy@example.com' });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/session/me`);
            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.equal(payload.isModerator, false);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });
});
