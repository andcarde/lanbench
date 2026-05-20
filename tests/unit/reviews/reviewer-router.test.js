'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createReviewerRouter } = require('../../../routes/reviewer');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Gets free port from the corresponding source.
 * @returns {*} Result produced by the function.
 */
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
 * Builds app from the received data.
 * @param {*} sessionUser - Value of sessionUser used by the function.
 * @returns {*} Result produced by the function.
 */
function buildApp(sessionUser) {
    const app = express();
    app.use((request, _response, next) => {
        request.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/reviewer', createReviewerRouter());
    return app;
}

/**
 * Asynchronously runs the logic of listen.
 * @param {*} app - Value of app used by the function.
 * @returns {Promise<*>} Result produced by the function.
 */
async function listen(app) {
    const port = await getFreePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, (/** @type {*} */ error) => (error ? reject(error) : resolve(s)));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('reviewer router page (T1.5)', function () {
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
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('sirve la pagina a un usuario normal autenticado (gating per-dataset aguas abajo)', async () => {
        const app = buildApp({ id: 1, email: 'u@example.com', isModerator: false });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') || '', /html/);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('sirve la pagina al moderador autenticado', async () => {
        const app = buildApp({ id: 2, email: 'mod@example.com', isModerator: true });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') || '', /html/);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('sirve la pagina a otro usuario normal autenticado', async () => {
        const app = buildApp({ id: 3, email: 'a@example.com', isModerator: false });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/reviewer`);
            assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type') || '', /html/);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });
});
