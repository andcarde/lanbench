'use strict';

/**
 * Unit coverage for the moderator gate on the "Nuevo dataset" button. The pure
 * helper `canCreateDataset` mirrors the server-level rule enforced by
 * `requireApiModerator()` on `POST /api/datasets`: only moderators qualify.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { canCreateDataset } = require('../../../public/js/datasets');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('canCreateDataset (moderator gate)', () => {
    it('permite crear datasets a un moderador', () => {
        assert.equal(canCreateDataset({ id: 5, email: 'mod@example.com', isModerator: true }), true);
    });

    it('lo niega a un usuario no moderador', () => {
        assert.equal(canCreateDataset({ id: 7, email: 'normal@example.com', isModerator: false }), false);
    });

    it('lo niega cuando falta el flag isModerator', () => {
        assert.equal(canCreateDataset({ id: 2, email: 'legacy@example.com' }), false);
    });

    it('lo niega para sesiones ausentes o no booleanas', () => {
        assert.equal(canCreateDataset(null), false);
        assert.equal(canCreateDataset(undefined), false);
        assert.equal(canCreateDataset({ isModerator: 'true' }), false);
        assert.equal(canCreateDataset({ isModerator: 1 }), false);
    });
});
