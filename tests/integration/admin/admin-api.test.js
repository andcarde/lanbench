'use strict';

/**
 * @file Integration tests for `/api/admin`.
 *
 * Boots a real `createApp()` application with real repositories, using a free
 * TCP socket. Verifies the end-to-end contract of the administrative endpoints
 * protected by `requireApiModerator`.
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
             * Mock controller for listing dataset summaries.
             * @param {*} _request - HTTP request (unused).
             * @param {*} response - HTTP response.
             * @returns {*} Result produced by the function.
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
             * Mock controller for exporting a dataset.
             * @param {*} _request - HTTP request (unused).
             * @param {*} response - HTTP response.
             * @returns {*} Result produced by the function.
             */
            exportDataset(_request, response) {
                calls.push('export');
                return response
                    .status(200)
                    .type('application/json')
                    .send('{"dataset":{"datasetId":1},"entries":[]}');
            },
            /**
             * Mock controller for listing evaluation criteria.
             * @param {*} _request - HTTP request (unused).
             * @param {*} response - HTTP response.
             * @returns {*} Result produced by the function.
             */
            listEvaluationCriteria(_request, response) {
                calls.push('criteria-list');
                return response.status(200).json([]);
            },
            /**
             * Mock controller for creating an evaluation criterion.
             * @param {*} request - HTTP request with the input data.
             * @param {*} response - HTTP response.
             * @returns {*} Result produced by the function.
             */
            createEvaluationCriterion(request, response) {
                calls.push(`criteria-create:${request.body.key}`);
                return response.status(201).json({ id: 1, key: request.body.key });
            },
            /**
             * Mock controller for updating an evaluation criterion.
             * @param {*} _request - HTTP request (unused).
             * @param {*} response - HTTP response.
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
 * Boots the app with a session user according to isModerator.
 * @param {boolean} isModerator - Whether the user is a moderator.
 * @param {*} adminController - Admin controller to inject (optional).
 * @returns {Promise<*>} Server with baseUrl and close().
 */
async function startApp(isModerator, adminController = null) {
    const port = await getFreePort();
    const app = createApp({
        controllers: {
            adminController: adminController || {
                /**
                 * Mock controller for listing dataset summaries.
                 * @param {*} _request - HTTP request (unused).
                 * @param {*} response - HTTP response.
                 * @returns {*} Result produced by the function.
                 */
                listDatasetSummaries(_request, response) {
                    return response.status(200).json([]);
                },
                /**
                 * Mock controller for exporting a dataset.
                 * @param {*} _request - HTTP request (unused).
                 * @param {*} response - HTTP response.
                 * @returns {*} Result produced by the function.
                 */
                exportDataset(_request, response) {
                    return response.status(200).send('');
                },
                /**
                 * Mock controller for listing evaluation criteria.
                 * @param {*} _request - HTTP request (unused).
                 * @param {*} response - HTTP response.
                 * @returns {*} Result produced by the function.
                 */
                listEvaluationCriteria(_request, response) {
                    return response.status(200).json([]);
                },
                /**
                 * Mock controller for creating an evaluation criterion.
                 * @param {*} _request - HTTP request (unused).
                 * @param {*} response - HTTP response.
                 * @returns {*} Result produced by the function.
                 */
                createEvaluationCriterion(_request, response) {
                    return response.status(201).json({});
                },
                /**
                 * Mock controller for updating an evaluation criterion.
                 * @param {*} _request - HTTP request (unused).
                 * @param {*} response - HTTP response.
                 */
                updateEvaluationCriterion(_request, response) {
                    return response.status(200).json({});
                }
            }
        },
        /**
         * Mock session middleware that injects a fixed session user.
         * @param {*} request - HTTP request with the input data.
         * @param {*} _response - HTTP response (unused).
         * @param {Function} next - Express callback to continue the middleware chain.
         * @returns {*} Result produced by the function.
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
         * Closes the HTTP server.
         * @returns {*} Promise resolved when the server is closed.
         */
        close() {
            return new Promise(resolve => httpServer.close(() => resolve(undefined)));
        }
    };
}

/**
 * Returns a free TCP port.
 * @returns {Promise<number>} Available port.
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
