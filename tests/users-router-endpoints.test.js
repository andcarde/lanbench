'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersRouter } = require('../routes/users');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('users router endpoints (renamed from usuarios)', () => {
    it('should have /create-session endpoint instead of /crear-sesion', () => {
        const mockUsersController = {
            register: () => {},
            login: () => {}
        };

        const router = createUsersRouter({ usersController: mockUsersController });

        const routes = router.stack
            .filter(layer => layer.route)
            .map(layer => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods)
            }));

        const createSessionRoute = routes.find(r => r.path === '/create-session');
        assert.ok(createSessionRoute, 'Should have /create-session endpoint');
        assert.ok(createSessionRoute.methods.includes('post'), 'POST /create-session should exist');
    });

    it('should not have legacy /crear-sesion endpoint', () => {
        const mockUsersController = {
            register: () => {},
            login: () => {}
        };

        const router = createUsersRouter({ usersController: mockUsersController });

        const routes = router.stack
            .filter(layer => layer.route)
            .map(layer => layer.route.path);

        assert.ok(!routes.includes('/crear-sesion'), 'Should not have legacy /crear-sesion endpoint');
    });

    it('should export createUsersRouter (not createUsuariosRouter)', () => {
        const usersModule = require('../routes/users');
        assert.ok(usersModule.createUsersRouter, 'Should export createUsersRouter');
        assert.ok(typeof usersModule.createUsersRouter === 'function', 'createUsersRouter should be a function');
    });
});
