'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsController } = require('../../../controllers/annotations-controller');
const { createUsersController } = require('../../../controllers/users-controller');
const annotationsRouter = require('../../../routes/annotations');
const { createAnnotationsRouter } = require('../../../routes/annotations-api');
const { createUsersRouter } = require('../../../routes/users');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('annotations router integration', () => {
    it('mantiene POST /api/annotations/check, /send, /:datasetId/continue y GET /:datasetId/next enlazados al controller', () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Checks check sentences and returns the validation result.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async checkSentences() {
                    return [];
                },
                /**
                 * Asynchronously runs save sentences against the corresponding persistence layer or API.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async saveSentences() {}
            },
            continueDatasetService: {
                async continueDataset() { return { caseNumber: 5 }; },
                async getNextEntry() { return { entry: { entryId: 1 } }; }
            }
        });

        const annotationsApiRouter = createAnnotationsRouter({ annotationsController });
        const routesByPath = new Map(
            annotationsApiRouter.stack
                .filter((/** @type {*} */ layer) => layer.route)
                .map((/** @type {*} */ layer) => [layer.route.path, layer.route])
        );

        assert.equal(routesByPath.get('/check').stack[0].handle, annotationsController.check);
        assert.equal(routesByPath.get('/send').stack[0].handle, annotationsController.send);
        assert.equal(routesByPath.get('/:datasetId/continue').stack[0].handle, annotationsController.continue);
        assert.equal(routesByPath.get('/:datasetId/next').stack[0].handle, annotationsController.next);
    });

    it('deja las rutas de anotaciones sólo en el router dedicado y sin aliases legacy', () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                /**
                 * Checks check sentences and returns the validation result.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async checkSentences() {
                    return [];
                },
                /**
                 * Asynchronously runs save sentences against the corresponding persistence layer or API.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async saveSentences() {}
            }
        });
        const usersController = createUsersController({
            usersService: {
                /**
                 * Asynchronously runs the logic of register user.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async registerUser() {},
                /**
                 * Asynchronously runs the logic of authenticate user.
                 * @returns {Promise<*>} Result produced by the function.
                 */
                async authenticateUser() {
                    return { userId: 1, email: 'user@example.com' };
                }
            }
        });

        const annotationsApiRouter = createAnnotationsRouter({ annotationsController });
        const usersRouter = createUsersRouter({ usersController });
        const annotationPageRoutes = annotationsRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort()
            }));

        const annotationApiRoutes = annotationsApiRouter.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => ({
                path: /** @type {any} */ (layer.route).path,
                methods: Object.keys(/** @type {any} */ (layer.route).methods).sort()
            }));

        const userRoutes = usersRouter.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => layer.route.path);

        assert.deepEqual(annotationPageRoutes, [
            { path: '/', methods: ['get'] }
        ]);
        assert.deepEqual(annotationApiRoutes, [
            { path: '/check', methods: ['post'] },
            { path: '/send', methods: ['post'] },
            { path: '/:datasetId/continue', methods: ['post'] },
            { path: '/:datasetId/next', methods: ['get'] }
        ]);
        assert.deepEqual(userRoutes, [
            '/register',
            '/register/moderator'
        ]);
    });
});
