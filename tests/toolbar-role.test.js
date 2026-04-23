'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { buildToolbarLinksForRole, normaliseRole } = require('../public/js/toolbar');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('toolbar role-aware rendering (T1.6)', () => {
    it('el anotador no recibe enlaces adicionales', () => {
        const result = buildToolbarLinksForRole('annotator');
        assert.equal(result.role, 'annotator');
        assert.deepEqual(result.links, []);
        assert.equal(result.badgeLabel, 'annotator');
    });

    it('el revisor recibe el enlace a /reviewer', () => {
        const result = buildToolbarLinksForRole('reviewer');
        assert.equal(result.role, 'reviewer');
        assert.equal(result.links.length, 1);
        assert.equal(result.links[0].href, '/reviewer');
    });

    it('el admin recibe enlaces a /reviewer y /tasks', () => {
        const result = buildToolbarLinksForRole('admin');
        assert.equal(result.role, 'admin');
        const hrefs = result.links.map(link => link.href);
        assert.ok(hrefs.includes('/reviewer'));
        assert.ok(hrefs.includes('/tasks'));
    });

    it('roles desconocidos caen a annotator', () => {
        assert.equal(normaliseRole('superuser'), 'annotator');
        assert.equal(normaliseRole(null), 'annotator');
        assert.equal(normaliseRole(undefined), 'annotator');
        assert.equal(normaliseRole(42), 'annotator');

        const result = buildToolbarLinksForRole('superuser');
        assert.equal(result.role, 'annotator');
        assert.deepEqual(result.links, []);
    });
});
