'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createUsersRouter } = require('../../../routes/users');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('users router endpoints (renamed from usuarios)', () => {
    it('expone /register y /register/moderator pero no /create-session (movido a /api/session)', () => {
        const mockUsersController = {
            register: () => {},
            registerModerator: () => {},
            login: () => {}
        };

        const router = createUsersRouter({ usersController: mockUsersController });

        const routes = router.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => layer.route.path);

        assert.ok(routes.includes('/register'), 'Debe exponer POST /register');
        assert.ok(routes.includes('/register/moderator'), 'Debe exponer POST /register/moderator');
        assert.ok(!routes.includes('/create-session'), '/create-session se ha movido a /api/session');
    });

    it('should not have legacy /crear-sesion endpoint', () => {
        const mockUsersController = {
            register: () => {},
            registerModerator: () => {},
            login: () => {}
        };

        const router = createUsersRouter({ usersController: mockUsersController });

        const routes = router.stack
            .filter((/** @type {*} */ layer) => layer.route)
            .map((/** @type {*} */ layer) => layer.route.path);

        assert.ok(!routes.includes('/crear-sesion'), 'Should not have legacy /crear-sesion endpoint');
    });

    it('should export createUsersRouter (not createUsuariosRouter)', () => {
        const usersModule = require('../../../routes/users');
        assert.ok(usersModule.createUsersRouter, 'Should export createUsersRouter');
        assert.ok(typeof usersModule.createUsersRouter === 'function', 'createUsersRouter should be a function');
    });
});
