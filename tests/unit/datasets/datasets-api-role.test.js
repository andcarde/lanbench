'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createDatasetsApiRouter } = require('../../../routes/datasets-api');

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
 * Builds datasets controller from the received data.
 * @param {*} postSpy - Value of postSpy used by the function.
 * @returns {*} Result produced by the function.
 */
function buildDatasetsController(postSpy) {
    return {
        /**
         * Asynchronously runs the logic of list all datasets.
         * @param {*} _req - Value of _req used by the function.
         * @param {*} res - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async listAllDatasets(_req, res) { return res.status(200).json([]); },
        /**
         * Creates dataset with the received configuration.
         * @param {*} _req - Value of _req used by the function.
         * @param {*} res - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async createDataset(_req, res) {
            postSpy.called = true;
            return res.status(201).json({ ok: true });
        },
        /**
         * Gets dataset by id from the corresponding source.
         * @param {*} _req - Value of _req used by the function.
         * @param {*} res - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async getDatasetById(_req, res) { return res.status(200).json({}); },
        /**
         * Gets dataset section from the corresponding source.
         * @param {*} _req - Value of _req used by the function.
         * @param {*} res - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async getDatasetSection(_req, res) { return res.status(200).json({}); },
        async listDatasetPermissions(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ users: [] }); },
        async addDatasetPermission(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(201).json({ ok: true }); },
        async updateDatasetPermission(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ ok: true }); },
        async getDatasetStatistics(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({}); },
        async deleteDataset(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ ok: true }); },
        /**
         * Gets dataset text from the corresponding source.
         * @param {*} _req - Value of _req used by the function.
         * @param {*} res - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async getDatasetText(_req, res) { return res.status(200).send(''); },
        async downloadDatasetXml(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).send(''); },
        async downloadDatasetAnnotatedXml(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).send(''); }
    };
}

/**
 * Builds app from the received data.
 * @param {*} sessionUser - Value of sessionUser used by the function.
 * @param {*} postSpy - Value of postSpy used by the function.
 * @returns {*} Result produced by the function.
 */
function buildApp(sessionUser, postSpy) {
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        request.session = sessionUser ? { user: sessionUser } : {};
        next();
    });
    app.use('/api/datasets', createDatasetsApiRouter({
        datasetsController: buildDatasetsController(postSpy),
        uploadMiddleware: /** @type {any} */ ({
            /**
             * Runs the logic of single.
             * @returns {*} Result produced by the function.
             */
            single() {
                return function fakeUpload(/** @type {*} */ _req, /** @type {*} */ _res, /** @type {*} */ next) { next(); };
            }
        })
    }));
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

describe('datasets API role protection (T1.3)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('POST /api/datasets responde 403 para un usuario normal', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { id: 1, email: 'normal@example.com', isModerator: false },
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
            await new Promise(resolve => server.close(() => resolve(undefined)));
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
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('GET /api/datasets sigue disponible para un usuario normal', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { id: 1, email: 'normal@example.com', isModerator: false },
            postSpy
        );
        const { server, baseUrl } = await listen(app);

        try {
            const response = await fetch(`${baseUrl}/api/datasets`);
            assert.equal(response.status, 200);
        } finally {
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });

    it('POST /api/datasets deja pasar al controlador cuando el usuario es moderador', async () => {
        const postSpy = { called: false };
        const app = buildApp(
            { id: 2, email: 'mod@example.com', isModerator: true },
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
            await new Promise(resolve => server.close(() => resolve(undefined)));
        }
    });
});
