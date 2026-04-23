'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsController } = require('../business/annotations-controller');
const { createUsersController } = require('../business/users-controller');
const annotationsRouter = require('../routes/annotations');
const { createAnnotationsRouter } = require('../routes/annotations-api');
const { createUsersRouter } = require('../routes/users');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('annotations router integration', () => {
    it('mantiene POST /api/annotations/check y POST /api/annotations/send enlazados al controller', () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() {
                    return [];
                },
                async saveSentences() {}
            }
        });

        const annotationsApiRouter = createAnnotationsRouter({ annotationsController });
        const routesByPath = new Map(
            annotationsApiRouter.stack
                .filter(layer => layer.route)
                .map(layer => [layer.route.path, layer.route])
        );

        assert.equal(routesByPath.get('/check').stack[0].handle, annotationsController.check);
        assert.equal(routesByPath.get('/send').stack[0].handle, annotationsController.send);
    });

    it('deja las rutas de anotaciones sólo en el router dedicado y sin aliases legacy', () => {
        const annotationsController = createAnnotationsController({
            annotationsService: {
                async checkSentences() {
                    return [];
                },
                async saveSentences() {}
            }
        });
        const usersController = createUsersController({
            usersService: {
                async registerUser() {},
                async authenticateUser() {
                    return { idUser: 1, email: 'user@example.com' };
                }
            }
        });

        const annotationsApiRouter = createAnnotationsRouter({ annotationsController });
        const usersRouter = createUsersRouter({ usersController });
        const annotationPageRoutes = annotationsRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        const annotationApiRoutes = annotationsApiRouter.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods).sort()
            }));

        const userRoutes = usersRouter.stack
            .filter(layer => layer.route)
            .map(layer => layer.route.path);

        assert.deepEqual(annotationPageRoutes, [
            { path: '/', methods: ['get'] }
        ]);
        assert.deepEqual(annotationApiRoutes, [
            { path: '/check', methods: ['post'] },
            { path: '/send', methods: ['post'] }
        ]);
        assert.deepEqual(userRoutes, [
            '/tasks',
            '/register',
            '/create-session'
        ]);
    });
});
