'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const publicRouter = require('../routes/public');
const datasetsRouter = require('../routes/datasets');
const { createDatasetsApiRouter } = require('../routes/datasets-api');
const annotationsRouter = require('../routes/annotations');
const { createAnnotationsRouter } = require('../routes/annotations-api');
const administratorRouter = require('../routes/administrator');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('canonical routes', () => {
    it('public router expone sólo las rutas canónicas sin alias de registro', () => {
        const routes = publicRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
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
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        assert.deepEqual(routes, [
            { path: '/', methods: ['get'] },
            { path: '/:id/view', methods: ['get'] }
        ]);
    });

    it('datasets api router concentra los endpoints de datos bajo /api/datasets', () => {
        const noop = () => {};
        const datasetsApiRouter = createDatasetsApiRouter({
            datasetsController: {
                listAllDatasets: noop,
                createDataset: noop,
                getDatasetById: noop,
                getDatasetText: noop,
                getDatasetSection: noop
            },
            uploadMiddleware: {
                single() {
                    return (_request, _response, next) => next();
                }
            }
        });

        const routes = datasetsApiRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        assert.deepEqual(routes, [
            { path: '/', methods: ['get'] },
            { path: '/', methods: ['post'] },
            { path: '/:id', methods: ['get'] },
            { path: '/:id/text', methods: ['get'] },
            { path: '/:id/sections/:section', methods: ['get'] }
        ]);
    });

    it('annotations separa la vista HTML de la API canónica bajo /api/annotations', () => {
        const noop = () => {};
        const annotationsApiRouter = createAnnotationsRouter({
            annotationsController: {
                check: noop,
                send: noop
            }
        });

        const pageRoutes = annotationsRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        const apiRoutes = annotationsApiRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        assert.deepEqual(pageRoutes, [
            { path: '/', methods: ['get'] }
        ]);
        assert.deepEqual(apiRoutes, [
            { path: '/check', methods: ['post'] },
            { path: '/send', methods: ['post'] }
        ]);
    });

    it('administrator expone la operación JSON de logout bajo su router API', () => {
        const routes = administratorRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        assert.deepEqual(routes, [
            { path: '/logout', methods: ['post'] }
        ]);
    });
});
