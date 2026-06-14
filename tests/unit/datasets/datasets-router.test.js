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
         * Asynchronously runs the logic of list all datasets.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
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
         * Creates dataset with the received configuration.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async createDataset(_request, response) {
            return response.status(201).json({ ok: true });
        },
        /**
         * Gets dataset by id from the corresponding source.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async getDatasetById(_request, response) {
            return response.status(200).json({ id: 1, name: 'DATASET 1', totalEntries: 12, completedPercent: 0, remainPercent: 100 });
        },
        /**
         * Gets dataset section from the corresponding source.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
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
         * Gets dataset text from the corresponding source.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async getDatasetText(_request, response) {
            return response
                .status(200)
                .type('text/plain; charset=utf-8')
                .send('<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>');
        },
        /**
         * Downloads the dataset XML as an attachment.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async downloadDatasetXml(_request, response) {
            return response
                .status(200)
                .type('application/xml; charset=utf-8')
                .set('Content-Disposition', 'attachment; filename="ru_dev.xml"')
                .send('<benchmark>ok</benchmark>');
        },
        /**
         * Downloads the extended dataset XML as an attachment.
         * @param {*} _request - Value of _request used by the function.
         * @param {*} response - HTTP response used to return the result.
         * @returns {Promise<*>} Result produced by the function.
         */
        async downloadDatasetAnnotatedXml(_request, response) {
            return response
                .status(200)
                .type('application/xml; charset=utf-8')
                .set('Content-Disposition', 'attachment; filename="ru_dev-extended.xml"')
                .send('<benchmark>extended</benchmark>');
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
        async renameDataset(/** @type {*} */ _request, /** @type {*} */ response) {
            return response.status(200).json({ ok: true, datasetId: 1, dataset: { datasetId: 1, name: 'ru_dev' } });
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
             * Runs the logic of session middleware.
             * @param {*} request - HTTP request with the input data.
             * @param {*} _response - Value of _response used by the function.
             * @param {Function} next - Express callback to continue the middleware chain.
             * @returns {*} Result produced by the function.
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
                 * Runs the logic of single.
                 * @returns {*} Result produced by the function.
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

    it('sirve el listado canónico datasets.html en GET /datasets', async () => {
        const response = await fetch(`${baseUrl}/datasets`, {
            redirect: 'manual'
        });

        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') || '', /text\/html/);

        const html = await response.text();
        assert.match(html, /<title>Lista de datasets<\/title>/);
        assert.match(html, /id="datasetsContainer"/);
    });

    it('sirve la página dataset-view.html en GET /datasets/1/view', async () => {
        const pageResponse = await fetch(`${baseUrl}/datasets/1/view?datasetId=1&datasetName=DATASET%201`);

        assert.equal(pageResponse.status, 200);
        assert.match(pageResponse.headers.get('content-type') || '', /text\/html/);

        const html = await pageResponse.text();
        assert.match(html, /dataset-view\.js/);
        assert.match(html, /datasetXmlViewer/);
        assert.match(html, /Volver atrás/);
        assert.match(html, /href="\/datasets"/);
        assert.doesNotMatch(html, /openAnnotationsLink/);
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

    it('expone GET /api/datasets/:id/download como descarga adjunta del XML', async () => {
        const downloadResponse = await fetch(`${baseUrl}/api/datasets/1/download`);

        assert.equal(downloadResponse.status, 200);
        assert.match(downloadResponse.headers.get('content-type') || '', /application\/xml/);
        assert.equal(
            downloadResponse.headers.get('content-disposition'),
            'attachment; filename="ru_dev.xml"'
        );
        assert.equal(await downloadResponse.text(), '<benchmark>ok</benchmark>');
    });

    it('expone GET /api/datasets/:id/download/annotated como descarga adjunta del XML extendido', async () => {
        const annotatedResponse = await fetch(`${baseUrl}/api/datasets/1/download/annotated`);

        assert.equal(annotatedResponse.status, 200);
        assert.match(annotatedResponse.headers.get('content-type') || '', /application\/xml/);
        assert.equal(
            annotatedResponse.headers.get('content-disposition'),
            'attachment; filename="ru_dev-extended.xml"'
        );
        assert.equal(await annotatedResponse.text(), '<benchmark>extended</benchmark>');
    });
});

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
