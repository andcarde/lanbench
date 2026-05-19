'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const express = require('express');
const net = require('node:net');

const { createAdminApiRouter } = require('../../../routes/admin-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('admin api router (E5)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('exige rol moderator para consultar resumen de datasets', async () => {
        const server = await startServerWithIsModerator(false);

        try {
            const response = await fetch(`${server.baseUrl}/api/admin/datasets/summary`);
            const payload = await response.json();

            assert.equal(response.status, 403);
            assert.equal(payload.code, 'forbidden_role');
        } finally {
            await server.close();
        }
    });

    it('permite a moderator consultar resumen, exportar y mantener criterios', async () => {
        /** @type {any[]} */
        const calls = [];
        const server = await startServerWithIsModerator(true, {
            /**
             * Ejecuta la logica de list dataset summaries.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            listDatasetSummaries(_request, response) {
                calls.push('summary');
                return response.status(200).json([{ datasetId: 1, name: 'Dataset' }]);
            },
            /**
             * Ejecuta la logica de export dataset.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            exportDataset(_request, response) {
                calls.push('export');
                return response
                    .status(200)
                    .type('application/json')
                    .send('{"ok":true}');
            },
            /**
             * Ejecuta la logica de list evaluation criteria.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            listEvaluationCriteria(_request, response) {
                calls.push('criteria-list');
                return response.status(200).json([]);
            },
            /**
             * Crea evaluation criterion con la configuracion recibida.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            createEvaluationCriterion(_request, response) {
                calls.push('criteria-create');
                return response.status(201).json({ id: 1 });
            },
            /**
             * Actualiza evaluation criterion con los datos indicados.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             */
            updateEvaluationCriterion(_request, response) {
                calls.push('criteria-update');
                return response.status(200).json({ id: 1, version: 2 });
            }
        });

        try {
            assert.equal((await fetch(`${server.baseUrl}/api/admin/datasets/summary`)).status, 200);
            assert.equal((await fetch(`${server.baseUrl}/api/admin/datasets/1/export?format=json`)).status, 200);
            assert.equal((await fetch(`${server.baseUrl}/api/admin/evaluation-criteria`)).status, 200);
            assert.equal((await fetch(`${server.baseUrl}/api/admin/evaluation-criteria`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'fluency', label: 'Fluidez' })
            })).status, 201);
            assert.equal((await fetch(`${server.baseUrl}/api/admin/evaluation-criteria/1`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: false })
            })).status, 200);

            assert.deepEqual(calls, [
                'summary',
                'export',
                'criteria-list',
                'criteria-create',
                'criteria-update'
            ]);
        } finally {
            await server.close();
        }
    });
});

/**
 * Levanta un servidor con un usuario de sesion segun isModerator.
 * @param {boolean} isModerator - Indica si el usuario es moderador.
 * @param {*} adminController - Controlador admin a inyectar (opcional).
 * @returns {Promise<*>} Servidor con baseUrl y close().
 */
async function startServerWithIsModerator(isModerator, adminController = null) {
    const port = await getFreePort();
    const app = express();

    app.use(express.json());
    app.use((request, _response, next) => {
        request.session = {
            user: {
                id: 1,
                email: `${isModerator ? 'mod' : 'normal'}@example.com`,
                isModerator
            }
        };
        next();
    });
    app.use('/api/admin', createAdminApiRouter({
        adminController: adminController || {
            /**
             * Ejecuta la logica de list dataset summaries.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            listDatasetSummaries(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Ejecuta la logica de export dataset.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            exportDataset(_request, response) {
                return response.status(200).send('');
            },
            /**
             * Ejecuta la logica de list evaluation criteria.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            listEvaluationCriteria(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Crea evaluation criterion con la configuracion recibida.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            createEvaluationCriterion(_request, response) {
                return response.status(201).json({});
            },
            /**
             * Actualiza evaluation criterion con los datos indicados.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             */
            updateEvaluationCriterion(_request, response) {
                return response.status(200).json({});
            }
        }
    }));

    const httpServer = await new Promise((resolve, reject) => {
        const started = app.listen(port, '127.0.0.1', error => {
            if (error)
                return reject(error);
            return resolve(started);
        });
    });

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        /**
         * Ejecuta la logica de close.
         * @returns {*} Resultado producido por la funcion.
         */
        close() {
            return new Promise(resolve => httpServer.close(() => resolve(undefined)));
        }
    };
}

/**
 * Obtiene free port desde la fuente correspondiente.
 * @returns {*} Resultado producido por la funcion.
 */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error)
                    return reject(error);
                if (!address || typeof address !== 'object')
                    return reject(new Error('No se pudo resolver un puerto libre.'));
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}
