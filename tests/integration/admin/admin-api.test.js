'use strict';

/**
 * @file Integration tests para `/api/admin`.
 *
 * Levanta una aplicacion `createApp()` real con repositorios reales,
 * usando un socket TCP libre. Verifica el contrato end-to-end de los
 * endpoints administrativos protegidos por `requireApiModerator`.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('admin api integration (E5)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    it('integra resumen, exportacion y criterios bajo /api/admin para rol admin', async () => {
        /** @type {any[]} */
        const calls = [];
        const server = await startApp(true, {
            /**
             * Ejecuta la logica de list dataset summaries.
             * @param {*} _request - Valor de _request usado por la funcion.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            listDatasetSummaries(_request, response) {
                calls.push('summary');
                return response.status(200).json([{
                    datasetId: 1,
                    name: 'Dataset integrado',
                    totalEntries: 2
                }]);
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
                    .send('{"dataset":{"datasetId":1},"entries":[]}');
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
             * @param {*} request - Peticion HTTP con los datos de entrada.
             * @param {*} response - Respuesta HTTP usada para devolver el resultado.
             * @returns {*} Resultado producido por la funcion.
             */
            createEvaluationCriterion(request, response) {
                calls.push(`criteria-create:${request.body.key}`);
                return response.status(201).json({ id: 1, key: request.body.key });
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
            const summaryResponse = await fetch(`${server.baseUrl}/api/admin/datasets/summary`);
            assert.equal(summaryResponse.status, 200);
            assert.equal((await summaryResponse.json())[0].name, 'Dataset integrado');

            const exportResponse = await fetch(`${server.baseUrl}/api/admin/datasets/1/export?format=json`);
            assert.equal(exportResponse.status, 200);
            assert.match(exportResponse.headers.get('content-type') || '', /application\/json/);

            const criteriaResponse = await fetch(`${server.baseUrl}/api/admin/evaluation-criteria`);
            assert.equal(criteriaResponse.status, 200);

            const createResponse = await fetch(`${server.baseUrl}/api/admin/evaluation-criteria`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'fluency', label: 'Fluidez' })
            });
            assert.equal(createResponse.status, 201);

            const updateResponse = await fetch(`${server.baseUrl}/api/admin/evaluation-criteria/1`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: false })
            });
            assert.equal(updateResponse.status, 200);

            assert.deepEqual(calls, [
                'summary',
                'export',
                'criteria-list',
                'criteria-create:fluency',
                'criteria-update'
            ]);
        } finally {
            await server.close();
        }
    });

    it('bloquea /api/admin para un usuario normal autenticado', async () => {
        const server = await startApp(false);

        try {
            const response = await fetch(`${server.baseUrl}/api/admin/datasets/summary`);
            const payload = await response.json();

            assert.equal(response.status, 403);
            assert.equal(payload.code, 'forbidden_role');
        } finally {
            await server.close();
        }
    });
});

/**
 * Levanta la app con un usuario de sesion segun isModerator.
 * @param {boolean} isModerator - Indica si el usuario es moderador.
 * @param {*} adminController - Controlador admin a inyectar (opcional).
 * @returns {Promise<*>} Servidor con baseUrl y close().
 */
async function startApp(isModerator, adminController = null) {
    const port = await getFreePort();
    const app = createApp({
        controllers: {
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
        },
        /**
         * Ejecuta la logica de session middleware.
         * @param {*} request - Peticion HTTP con los datos de entrada.
         * @param {*} _response - Valor de _response usado por la funcion.
         * @param {Function} next - Callback de Express para continuar la cadena de middlewares.
         * @returns {*} Resultado producido por la funcion.
         */
        sessionMiddleware(request, _response, next) {
            request.session = {
                user: {
                    id: 1,
                    email: `${isModerator ? 'mod' : 'normal'}@example.com`,
                    isModerator
                }
            };
            next();
        }
    });

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
