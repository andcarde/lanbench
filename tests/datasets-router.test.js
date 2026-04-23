'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');

const { createApp } = require('../app');
const { createDatasetsApiRouter } = require('../routes/datasets-api');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const before = global.before || testApi.before;
const after = global.after || testApi.after;

let baseUrl = '';
let httpServer = null;

describe('datasets router integration', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(30000);

    const datasetsController = {
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
        async createDataset(_request, response) {
            return response.status(201).json({ ok: true });
        },
        async getDatasetById(_request, response) {
            return response.status(200).json({ id: 1, name: 'DATASET 1', totalEntries: 12, completedPercent: 0, remainPercent: 100 });
        },
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
        async getDatasetText(_request, response) {
            return response
                .status(200)
                .type('text/plain; charset=utf-8')
                .send('<benchmark><entries><entry eid="1" category="Airport" size="1"></entry></entries></benchmark>');
        }
    };

    before(async () => {
        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;

        const app = createApp({
            controllers: {
                datasetsController
            },
            sessionMiddleware(request, _response, next) {
                request.session = {
                    user: {
                        idUser: 7,
                        email: 'router@example.com'
                    }
                };
                next();
            }
        });

        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => {
                if (error)
                    return reject(error);
                return resolve();
            });
        });
    });

    after(async () => {
        if (!httpServer)
            return;

        await new Promise(resolve => {
            httpServer.close(() => resolve());
        });
    });

    it('expone POST /api/datasets como endpoint canónico de creación', () => {
        const datasetsApiRouter = createDatasetsApiRouter({
            datasetsController,
            uploadMiddleware: {
                single() {
                    return (_request, _response, next) => next();
                }
            }
        });

        const createRoute = datasetsApiRouter.stack
            .filter(layer => layer.route && layer.route.path === '/')
            .find(layer => layer.route.methods.post);

        assert.ok(createRoute, 'No se encontró la ruta POST /api/datasets.');
        assert.equal(
            createRoute.route.stack[createRoute.route.stack.length - 1].handle,
            datasetsController.createDataset
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
