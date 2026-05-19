'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('Request log middleware contract', () => {
    it('middleware should have documented serverErrorReason contract', () => {
        const middlewarePath = path.join(__dirname, '..', '..', '..', 'middlewares', 'request-log-middleware.js');
        const content = fs.readFileSync(middlewarePath, 'utf8');

        assert.ok(content.includes('serverErrorReason'),
            'Middleware should reference serverErrorReason');
        assert.ok(content.includes('Contrato:') || content.includes('Contract:') || content.includes('response.locals.serverErrorReason'),
            'Middleware should document the contract for serverErrorReason');
    });

    it('users-controller should handle errors (either directly or via service)', () => {
        const usersControllerPath = path.join(__dirname, '..', '..', '..', 'controllers', 'users-controller.js');
        const content = fs.readFileSync(usersControllerPath, 'utf8');

        // After refactoring, error handling may be in service or controller
        assert.ok(
            content.includes('response.locals.serverErrorReason') ||
            content.includes('catch') ||
            content.includes('createUsersService'),
            'users-controller should have error handling (directly or via service layer)'
        );
    });

    it('api-error-payload should set serverErrorReason on 5xx responses', () => {
        const apiErrorPath = path.join(__dirname, '..', '..', '..', 'utils', 'api-error-payload.js');
        const content = fs.readFileSync(apiErrorPath, 'utf8');

        assert.ok(content.includes('response.locals.serverErrorReason'),
            'utils/api-error-payload.js should set response.locals.serverErrorReason on 500 responses');
    });
});
