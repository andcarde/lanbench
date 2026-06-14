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
             * Runs the logic of list dataset summaries.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            listDatasetSummaries(_request, response) {
                calls.push('summary');
                return response.status(200).json([{ datasetId: 1, name: 'Dataset' }]);
            },
            /**
             * Runs the logic of export dataset.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            exportDataset(_request, response) {
                calls.push('export');
                return response
                    .status(200)
                    .type('application/json')
                    .send('{"ok":true}');
            },
            /**
             * Runs the logic of list evaluation criteria.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            listEvaluationCriteria(_request, response) {
                calls.push('criteria-list');
                return response.status(200).json([]);
            },
            /**
             * Creates evaluation criterion with the received configuration.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            createEvaluationCriterion(_request, response) {
                calls.push('criteria-create');
                return response.status(201).json({ id: 1 });
            },
            /**
             * Updates evaluation criterion with the given data.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            updateEvaluationCriterion(_request, response) {
                calls.push('criteria-update');
                return response.status(200).json({ id: 1, version: 2 });
            },
            /**
             * Runs the logic of list users (US-22).
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            listUsers(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Runs the logic of update user role (US-22).
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            updateUserRole(_request, response) {
                return response.status(200).json({});
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
 * Starts a server with a session user based on isModerator.
 * @param {boolean} isModerator - Whether the user is a moderator.
 * @param {*} adminController - Admin controller to inject (optional).
 * @returns {Promise<*>} Server with baseUrl and close().
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
             * Runs the logic of list dataset summaries.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            listDatasetSummaries(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Runs the logic of export dataset.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            exportDataset(_request, response) {
                return response.status(200).send('');
            },
            /**
             * Runs the logic of list evaluation criteria.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            listEvaluationCriteria(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Creates evaluation criterion with the received configuration.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             * @returns {*} Result produced by the function.
             */
            createEvaluationCriterion(_request, response) {
                return response.status(201).json({});
            },
            /**
             * Updates evaluation criterion with the given data.
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            updateEvaluationCriterion(_request, response) {
                return response.status(200).json({});
            },
            /**
             * Runs the logic of list users (US-22).
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            listUsers(_request, response) {
                return response.status(200).json([]);
            },
            /**
             * Runs the logic of update user role (US-22).
             * @param {*} _request - Value of _request used by the function.
             * @param {*} response - HTTP response used to return the result.
             */
            updateUserRole(_request, response) {
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
         * Runs the logic of close.
         * @returns {*} Result produced by the function.
         */
        close() {
            return new Promise(resolve => httpServer.close(() => resolve(undefined)));
        }
    };
}

/**
 * Gets free port from the corresponding source.
 * @returns {*} Result produced by the function.
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
