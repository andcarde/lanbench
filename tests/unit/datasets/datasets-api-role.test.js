'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const express = require('express');

const { createDatasetsApiRouter } = require('../../../routes/datasets-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Obtiene free port desde la fuente correspondiente.
 * @returns {*} Resultado producido por la funcion.
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
 * Construye datasets controller a partir de los datos recibidos.
 * @param {*} postSpy - Valor de postSpy usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
 */
function buildDatasetsController(postSpy) {
    return {
        /**
         * Ejecuta de forma asincrona la logica de list all datasets.
         * @param {*} _req - Valor de _req usado por la funcion.
         * @param {*} res - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async listAllDatasets(_req, res) { return res.status(200).json([]); },
        /**
         * Crea dataset con la configuracion recibida.
         * @param {*} _req - Valor de _req usado por la funcion.
         * @param {*} res - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async createDataset(_req, res) {
            postSpy.called = true;
            return res.status(201).json({ ok: true });
        },
        /**
         * Obtiene dataset by id desde la fuente correspondiente.
         * @param {*} _req - Valor de _req usado por la funcion.
         * @param {*} res - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetById(_req, res) { return res.status(200).json({}); },
        /**
         * Obtiene dataset section desde la fuente correspondiente.
         * @param {*} _req - Valor de _req usado por la funcion.
         * @param {*} res - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetSection(_req, res) { return res.status(200).json({}); },
        async listDatasetPermissions(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ users: [] }); },
        async addDatasetPermission(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(201).json({ ok: true }); },
        async updateDatasetPermission(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ ok: true }); },
        async getDatasetStatistics(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({}); },
        async deleteDataset(/** @type {*} */ _req, /** @type {*} */ res) { return res.status(200).json({ ok: true }); },
        /**
         * Obtiene dataset text desde la fuente correspondiente.
         * @param {*} _req - Valor de _req usado por la funcion.
         * @param {*} res - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetText(_req, res) { return res.status(200).send(''); }
    };
}

/**
 * Construye app a partir de los datos recibidos.
 * @param {*} sessionUser - Valor de sessionUser usado por la funcion.
 * @param {*} postSpy - Valor de postSpy usado por la funcion.
 * @returns {*} Resultado producido por la funcion.
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
             * Ejecuta la logica de single.
             * @returns {*} Resultado producido por la funcion.
             */
            single() {
                return function fakeUpload(/** @type {*} */ _req, /** @type {*} */ _res, /** @type {*} */ next) { next(); };
            }
        })
    }));
    return app;
}

/**
 * Ejecuta de forma asincrona la logica de listen.
 * @param {*} app - Valor de app usado por la funcion.
 * @returns {Promise<*>} Resultado producido por la funcion.
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
