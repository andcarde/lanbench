'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const publicRouter = require('../../../routes/public');
const datasetsRouter = require('../../../routes/datasets');
const { createDatasetsApiRouter } = require('../../../routes/datasets-api');
const annotationsRouter = require('../../../routes/annotations');
const { createAnnotationsRouter } = require('../../../routes/annotations-api');
const { createSessionApiRouter } = require('../../../routes/session-api');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('canonical routes', () => {
    it('public router expone sólo las rutas canónicas sin alias de registro', () => {
        const routes = publicRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        assert.deepEqual(routes, [
            { path: '/', methods: ['get'] },
            { path: '/register', methods: ['get'] },
            { path: '/login', methods: ['get'] }
        ]);
    });

    it('datasets router expone el redirect al listado y la vista HTML del dataset', () => {
        const routes = datasetsRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        assert.deepEqual(routes, [
            { path: '/', methods: ['get'] },
            { path: '/:id/view', methods: ['get'] },
            { path: '/:id/admin', methods: ['get'] }
        ]);
    });

    it('datasets api router concentra los endpoints de datos bajo /api/datasets', () => {
        /**
         * Runs the logic of noop.
         * @returns {*} Result produced by the function.
         */
        const noop = () => {};
        const datasetsApiRouter = createDatasetsApiRouter({
            datasetsController: {
                listAllDatasets: noop,
                createDataset: noop,
                getDatasetById: noop,
                getDatasetText: noop,
                downloadDatasetXml: noop,
                downloadDatasetAnnotatedXml: noop,
                getDatasetSection: noop,
                listDatasetPermissions: noop,
                addDatasetPermission: noop,
                updateDatasetPermission: noop,
                getDatasetStatistics: noop,
                renameDataset: noop,
                deleteDataset: noop
            },
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

        const routes = datasetsApiRouter.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        assert.deepEqual(routes, [
            { path: '/', methods: ['get'] },
            { path: '/', methods: ['post'] },
            { path: '/:id/permissions', methods: ['get'] },
            { path: '/:id/permissions', methods: ['post'] },
            { path: '/:id/permissions/:userId', methods: ['patch'] },
            { path: '/:id/statistics', methods: ['get'] },
            { path: '/:id', methods: ['get'] },
            { path: '/:id/text', methods: ['get'] },
            { path: '/:id/download', methods: ['get'] },
            { path: '/:id/download/annotated', methods: ['get'] },
            { path: '/:id/sections/:section', methods: ['get'] },
            { path: '/:id', methods: ['patch'] },
            { path: '/:id', methods: ['delete'] }
        ]);
    });

    it('annotations separa la vista HTML de la API canónica bajo /api/annotations', () => {
        /**
         * Runs the logic of noop.
         * @returns {*} Result produced by the function.
         */
        const noop = () => {};
        const annotationsApiRouter = createAnnotationsRouter({
            annotationsController: {
                check: noop,
                send: noop,
                continue: noop,
                next: noop
            }
        });

        const pageRoutes = annotationsRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        const apiRoutes = annotationsApiRouter.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        assert.deepEqual(pageRoutes, [
            { path: '/', methods: ['get'] }
        ]);
        assert.deepEqual(apiRoutes, [
            { path: '/check', methods: ['post'] },
            { path: '/send', methods: ['post'] },
            { path: '/:datasetId/continue', methods: ['post'] },
            { path: '/:datasetId/next', methods: ['get'] }
        ]);
    });

    it('session-api expone el recurso REST de sesion bajo /api/session', () => {
        /**
         * Runs the logic of noop.
         * @returns {*} Result produced by the function.
         */
        const noop = () => {};
        const sessionRouter = createSessionApiRouter({
            usersController: { login: noop }
        });

        const routes = sessionRouter.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort((a, b) => a.localeCompare(b))
            }));

        assert.deepEqual(routes, [
            { path: '/me', methods: ['get'] },
            { path: '/', methods: ['post'] },
            { path: '/', methods: ['delete'] }
        ]);
    });
});
