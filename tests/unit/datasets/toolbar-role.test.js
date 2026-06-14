'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { buildToolbarLinksForUser, isActiveToolbarLink } = require('../../../public/js/toolbar');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Hrefs of the links a payload produces.
 * @param {*} payload - Session-user-like payload.
 * @returns {string[]} Link hrefs.
 */
function hrefsFor(payload) {
    return buildToolbarLinksForUser(payload).links.map((/** @type {*} */ link) => link.href);
}

describe('toolbar isModerator-aware rendering', () => {
    it('un usuario normal recibe "Datasets" y "Mis estadísticas" sin badge', () => {
        const result = buildToolbarLinksForUser({ isModerator: false });
        assert.equal(result.isModerator, false);
        assert.deepEqual(result.links.map((/** @type {*} */ l) => l.href), ['/datasets', '/my-stats']);
        assert.equal(result.badgeLabel, null);
    });

    it('un moderador recibe enlaces a /datasets, /reviewer, /my-stats y badge', () => {
        const result = buildToolbarLinksForUser({ isModerator: true });
        assert.equal(result.isModerator, true);
        const hrefs = new Set(result.links.map((/** @type {*} */ link) => link.href));
        assert.ok(hrefs.has('/datasets'));
        assert.ok(hrefs.has('/reviewer'));
        assert.ok(hrefs.has('/my-stats'));
        assert.ok(!hrefs.has('/tasks'));
        assert.equal(result.badgeLabel, 'moderator');
    });

    it('todo usuario autenticado recibe Datasets y estadísticas personales', () => {
        assert.deepEqual(hrefsFor({}), ['/datasets', '/my-stats']);
        assert.deepEqual(hrefsFor(null), ['/datasets', '/my-stats']);
        assert.deepEqual(hrefsFor(undefined), ['/datasets', '/my-stats']);
        assert.deepEqual(hrefsFor({ isModerator: 'true' }), ['/datasets', '/my-stats']);
    });
});

describe('toolbar isActiveToolbarLink (P7 active-item highlight)', () => {
    it('matches the exact route only', () => {
        assert.equal(isActiveToolbarLink('/my-stats', '/my-stats'), true);
        assert.equal(isActiveToolbarLink('/datasets', '/datasets'), true);
        assert.equal(isActiveToolbarLink('/reviewer', '/datasets'), false);
    });

    it('tolerates trailing slashes and query/hash', () => {
        assert.equal(isActiveToolbarLink('/my-stats/', '/my-stats'), true);
        assert.equal(isActiveToolbarLink('/my-stats', '/my-stats/'), true);
        assert.equal(isActiveToolbarLink('/my-stats', '/my-stats?tab=1'), true);
    });

    it('matches nested routes under the link path', () => {
        assert.equal(isActiveToolbarLink('/reviewer', '/reviewer/session'), true);
        assert.equal(isActiveToolbarLink('/datasets', '/datasets/3/view'), true);
        assert.equal(isActiveToolbarLink('/datasets', '/datasets/3/admin'), true);
        assert.equal(isActiveToolbarLink('/my-stats', '/my-statsx'), false);
    });

    it('does not match when on a different page', () => {
        assert.equal(isActiveToolbarLink('/my-stats', '/datasets'), false);
        assert.equal(isActiveToolbarLink('/reviewer', '/'), false);
    });
});
