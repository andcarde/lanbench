'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createMeApiRouter } = require('../../../routes/me-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Reserves a free TCP port.
 * @returns {Promise<number>} Port.
 */
function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = (/** @type {import("node:net").AddressInfo} */ (server.address()));
            server.close(err => err ? reject(err) : resolve(port));
        });
        server.on('error', reject);
    });
}

/**
 * Builds an app mounting the me API router with an injectable session.
 * @param {*} sessionUser - Session user or null.
 * @returns {*} Express app.
 */
function buildApp(sessionUser) {
    const controller = {
        getMyStats: (/** @type {*} */ _req, /** @type {*} */ res) => res.status(200).json({ ok: true })
    };
    const app = express();
    app.use((req, _res, next) => { req.session = sessionUser ? { user: sessionUser } : {}; next(); });
    app.use('/api/me', createMeApiRouter({ meController: controller }));
    return app;
}

describe('me API router (US-14)', () => {
    it('exige meController', () => {
        assert.throws(() => createMeApiRouter({}), /meController is required/);
    });

    it('GET /api/me/stats responde 401 sin sesión y 200 autenticado', async () => {
        const port = await freePort();
        const app = buildApp({ id: 7, email: 'me@lanbench.dev' });
        const server = await new Promise(resolve => {
            const s = app.listen(port, '127.0.0.1', () => resolve(s));
        });

        try {
            const okRes = await fetch(`http://127.0.0.1:${port}/api/me/stats`);
            assert.equal(okRes.status, 200);

            const anonApp = buildApp(null);
            const port2 = await freePort();
            const anonServer = await new Promise(resolve => {
                const s = anonApp.listen(port2, '127.0.0.1', () => resolve(s));
            });
            try {
                const anonRes = await fetch(`http://127.0.0.1:${port2}/api/me/stats`);
                assert.equal(anonRes.status, 401);
            } finally {
                await new Promise(r => anonServer.close(r));
            }
        } finally {
            await new Promise(r => server.close(r));
        }
    });
});
