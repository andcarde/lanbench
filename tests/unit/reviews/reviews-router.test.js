'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createReviewsRouter } = require('../../../routes/reviews-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Ejecuta la logica de free port.
 * @returns {*} Resultado producido por la funcion.
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
 * Construye app a partir de los datos recibidos.
 * @param {*} options - Objeto de opciones usado para configurar la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildApp({ sessionUser, controllerOverrides = {} } = {}) {
    const controller = {
        requestNext: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ reviewId: 99 }),
        getContext: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ reviewId: Number(req.params.reviewId) }),
        submitDecision: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ ok: true }),
        submitCorrection: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ comments: [] }),
        finalize: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ status: 'completed' }),
        release: (/** @type {*} */ req, /** @type {*} */ res) => res.status(204).end(),
        feedbackForAnnotator: (/** @type {*} */ req, /** @type {*} */ res) => res.status(200).json({ feedback: [] }),
        ...controllerOverrides
    };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/api/reviews', createReviewsRouter({ reviewsController: controller }));
    return app;
}

/**
 * Ejecuta de forma asincrona la logica de listen.
 * @param {*} app - Valor de app usado por la funcion.
 * @returns {Promise<*>} Resultado producido por la funcion.
 */
async function listen(app) {
    const port = await freePort();
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(port, (/** @type {*} */ err) => err ? reject(err) : resolve(s));
    });
    return { server, baseUrl: `http://127.0.0.1:${port}` };
}

/**
 * Ejecuta de forma asincrona la logica de close.
 * @param {*} server - Valor de server usado por la funcion.
 * @returns {Promise<*>} Resultado producido por la funcion.
 */
async function close(server) {
    await new Promise(resolve => server.close(() => resolve(undefined)));
}

describe('reviews-api router (T4.4)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('POST /api/reviews/request sin sesion devuelve 401', async () => {
        const app = buildApp({ sessionUser: null });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/request`, { method: 'POST' });
            assert.equal(r.status, 401);
        } finally { await close(server); }
    });

    it('POST /api/reviews/request sin datasetId y sin moderador devuelve 403', async () => {
        const app = buildApp({ sessionUser: { id: 1, email: 'a@x', isModerator: false } });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/request`, { method: 'POST' });
            assert.equal(r.status, 403);
            const body = await r.json();
            assert.equal(body.code, 'forbidden');
        } finally { await close(server); }
    });

    it('POST /api/reviews/request con datasetId pasa al controller aun sin ser moderador', async () => {
        let /** @type {any} */ captured;
        const app = buildApp({
            sessionUser: { id: 1, email: 'a@x', isModerator: false },
            controllerOverrides: {
                requestNext: (/** @type {*} */ req, /** @type {*} */ res) => {
                    captured = req.body;
                    res.status(200).json({ reviewId: 88 });
                }
            }
        });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/request`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ datasetId: 12 })
            });
            assert.equal(r.status, 200);
            assert.deepEqual(captured, { datasetId: 12 });
        } finally { await close(server); }
    });

    it('POST /api/reviews/request con moderador devuelve 200', async () => {
        const app = buildApp({ sessionUser: { id: 2, email: 'r@x', isModerator: true } });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/request`, { method: 'POST' });
            assert.equal(r.status, 200);
            const body = await r.json();
            assert.equal(body.reviewId, 99);
        } finally { await close(server); }
    });

    it('GET /api/reviews/feedback accesible para cualquier usuario autenticado', async () => {
        const app = buildApp({ sessionUser: { id: 1, email: 'a@x', isModerator: false } });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/feedback`);
            assert.equal(r.status, 200);
            const body = await r.json();
            assert.deepEqual(body.feedback, []);
        } finally { await close(server); }
    });

    it('POST /api/reviews/:id/decisions pasa al controller', async () => {
        let /** @type {any} */ captured;
        const app = buildApp({
            sessionUser: { id: 2, email: 'r@x', isModerator: true },
            controllerOverrides: {
                submitDecision: (/** @type {*} */ req, /** @type {*} */ res) => { captured = req.body; res.status(200).json({ ok: true }); }
            }
        });
        const { server, baseUrl } = await listen(app);
        try {
            const r = await fetch(`${baseUrl}/api/reviews/5/decisions`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ criterionCode: 'criterion_grammar', decision: 'accepted' })
            });
            assert.equal(r.status, 200);
            assert.equal(captured.criterionCode, 'criterion_grammar');
        } finally { await close(server); }
    });
});
