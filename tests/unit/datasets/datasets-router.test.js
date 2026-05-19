'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../../../app');
const { createDatasetsApiRouter } = require('../../../routes/datasets-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

let baseUrl = '';
/** @type {any} */
let httpServer = null;

describe('datasets router integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    const datasetsController = {
        /**
         * Ejecuta de forma asincrona la logica de list all datasets.
         * @param {*} _request - Valor de _request usado por la funcion.
         * @param {*} response - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async listAllDatasets(_request, response) {
            return response.status(200).json([{
                id: 21,
                name: 'ru_dev',
                totalEntries: 790,
                completedPercent: 0,
                remainPercent: 100,
                withoutReviewPercent: 0,
                languages: ['Spanish', 'English'],
                colorClass: 'dataset-purple'
            }]);
        },
        /**
         * Crea dataset con la configuracion recibida.
         * @param {*} _request - Valor de _request usado por la funcion.
         * @param {*} response - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async createDataset(_request, response) {
            return response.status(201).json({ ok: true });
        },
        /**
         * Obtiene dataset by id desde la fuente correspondiente.
         * @param {*} _request - Valor de _request usado por la funcion.
         * @param {*} response - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetById(_request, response) {
            return response.status(200).json({ id: 1, name: 'DATASET 1', totalEntries: 12, completedPercent: 0, remainPercent: 100 });
        },
        /**
         * Obtiene dataset section desde la fuente correspondiente.
         * @param {*} _request - Valor de _request usado por la funcion.
         * @param {*} response - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetSection(_request, response) {
            return response.status(200).json({
                datasetId: 1,
                datasetName: 'DATASET 1',
                totalSections: 2,
                sectionIndex: 1,
                sectionSize: 10,
                startEntry: 1,
                endEntry: 10,
                isLastSection: false,
                totalEntries: 10,
                entries: [{
                    entryId: 1,
                    sectionIndex: 1,
                    category: 'Airport',
                    triples: [{
                        subject: 'subject-1',
                        predicate: 'predicate-1',
                        object: 'object-1'
                    }],
                    englishSentences: ['English sentence 1']
                }]
            });
        },
        /**
         * Obtiene dataset text desde la fuente correspondiente.
         * @param {*} _request - Valor de _request usado por la funcion.
         * @param {*} response - Respuesta HTTP usada para devolver el resultado.
         * @returns {Promise<*>} Resultado producido por la funcion.
         */
        async getDatasetText(_request, response) {
            return response
                .status(200)
                .type('text/plain; charset=utf-8')
                .send('<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>');
        },
        async listDatasetPermissions(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(200).json({ users: [] });
        },
        async addDatasetPermission(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(201).json({ ok: true });
        },
        async updateDatasetPermission(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(200).json({ ok: true });
        },
        async getDatasetStatistics(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(200).json({ dataset: { datasetId: 1 } });
        },
        async deleteDataset(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(200).json({ ok: true, datasetId: 1 });
        }
    };

    before(async () => {
        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;

        const app = createApp(/** @type {any} */ ({
            controllers: {
                datasetsController
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
                        id: 7,
                        email: 'router@example.com'
                    }
                };
                next();
            }
        }));

        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => {
                if (error)
                    return reject(error);
                return resolve(undefined);
            });
        });
    });

    after(async () => {
        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve(undefined));
        });
    });

    it('expone POST /api/datasets como endpoint canónico de creación', () => {
        const datasetsApiRouter = createDatasetsApiRouter({
            datasetsController,
            uploadMiddleware: /** @type {any} */ ({
                /**
                 * Ejecuta la logica de single.
                 * @returns {*} Resultado producido por la funcion.
                 */
                single() {
                    return (/** @type {*} */ _request, /** @type {*} */ _response, /** @type {*} */ next) => next();
                }
            })
        });

        const createRoute = /** @type {any} */ (datasetsApiRouter.stack
            .filter((/** @type {*} */ layer) => layer.route && layer.route.path === '/')
            .find((/** @type {*} */ layer) => layer.route.methods.post));

        assert.ok(createRoute, 'No se encontró la ruta POST /api/datasets.');
        assert.equal(
            createRoute.route.stack[createRoute.route.stack.length - 1].handle,
            datasetsController.createDataset
        );
    });

    it('expone DELETE /api/datasets/:id como endpoint de borrado total', () => {
        const datasetsApiRouter = createDatasetsApiRouter({
            datasetsController,
            uploadMiddleware: /** @type {any} */ ({
                single() {
                    return (/** @type {*} */ _request, /** @type {*} */ _response, /** @type {*} */ next) => next();
                }
            })
        });

        const deleteRoute = /** @type {any} */ (datasetsApiRouter.stack
            .filter((/** @type {*} */ layer) => layer.route && layer.route.path === '/:id')
            .find((/** @type {*} */ layer) => layer.route.methods.delete));

        assert.ok(deleteRoute, 'No se encontró la ruta DELETE /api/datasets/:id.');
        assert.equal(
            deleteRoute.route.stack[deleteRoute.route.stack.length - 1].handle,
            datasetsController.deleteDataset
        );
    });

    it('devuelve el listado canónico en GET /api/datasets', async () => {
        const response = await fetch(`${baseUrl}/api/datasets`);
        assert.equal(response.status, 200);

        const allDatasets = await response.json();
        assert.ok(Array.isArray(allDatasets));
        assert.equal(allDatasets[0].id, 21);
        assert.equal(allDatasets[0].name, 'ru_dev');
        assert.equal(allDatasets[0].totalEntries, 790);
    });

    it('obtiene las entries canónicas correspondientes a un dataset y sección dados en GET /api/datasets/1/sections/1', async () => {
        const sectionResponse = await fetch(`${baseUrl}/api/datasets/1/sections/1`);
        assert.equal(sectionResponse.status, 200);

        const payload = await sectionResponse.json();
        assert.deepEqual(payload, {
            datasetId: 1,
            datasetName: 'DATASET 1',
            totalSections: 2,
            sectionIndex: 1,
            sectionSize: 10,
            startEntry: 1,
            endEntry: 10,
            isLastSection: false,
            totalEntries: 10,
            entries: [{
                entryId: 1,
                sectionIndex: 1,
                category: 'Airport',
                triples: [{
                    subject: 'subject-1',
                    predicate: 'predicate-1',
                    object: 'object-1'
                }],
                englishSentences: ['English sentence 1']
            }]
        });
    });

    it('redirige GET /datasets al listado canónico /tasks', async () => {
        const response = await fetch(`${baseUrl}/datasets`, {
            redirect: 'manual'
        });

        assert.ok([302, 303].includes(response.status));
        assert.equal(response.headers.get('location'), '/tasks');
    });

    it('sirve la página dataset-view.html en GET /datasets/1/view', async () => {
        const pageResponse = await fetch(`${baseUrl}/datasets/1/view?datasetId=1&datasetName=DATASET%201`);

        assert.equal(pageResponse.status, 200);
        assert.match(pageResponse.headers.get('content-type') || '', /text\/html/);

        const html = await pageResponse.text();
        assert.match(html, /dataset-view\.js/);
        assert.match(html, /datasetXmlViewer/);
        assert.match(html, /Volver atrás/);
        assert.match(html, /openAnnotationsLink/);
        assert.match(html, /href="\/tasks"/);
    });

    it('devuelve el texto del dataset en GET /api/datasets/1/text', async () => {
        const textResponse = await fetch(`${baseUrl}/api/datasets/1/text`);

        assert.equal(textResponse.status, 200);
        assert.match(textResponse.headers.get('content-type') || '', /text\/plain/);
        assert.equal(
            await textResponse.text(),
            '<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>'
        );
    });
});

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
