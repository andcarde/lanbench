'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { buildToolbarLinksForUser } = require('../../../public/js/toolbar');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('toolbar isModerator-aware rendering', () => {
    it('un usuario normal no recibe enlaces ni badge', () => {
        const result = buildToolbarLinksForUser({ isModerator: false });
        assert.equal(result.isModerator, false);
        assert.deepEqual(result.links, []);
        assert.equal(result.badgeLabel, null);
    });

    it('un moderador recibe enlaces a /reviewer y /tasks y badge', () => {
        const result = buildToolbarLinksForUser({ isModerator: true });
        assert.equal(result.isModerator, true);
        const hrefs = result.links.map((/** @type {*} */ link) => link.href);
        assert.ok(hrefs.includes('/reviewer'));
        assert.ok(hrefs.includes('/tasks'));
        assert.equal(result.badgeLabel, 'moderator');
    });

    it('payloads sin isModerator se tratan como normal', () => {
        assert.deepEqual(buildToolbarLinksForUser({}).links, []);
        assert.deepEqual(buildToolbarLinksForUser(null).links, []);
        assert.deepEqual(buildToolbarLinksForUser(undefined).links, []);
        assert.deepEqual(buildToolbarLinksForUser({ isModerator: 'true' }).links, []);
    });
});
