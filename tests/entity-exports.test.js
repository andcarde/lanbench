'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('Entity exports consistency', () => {
    it('User is exported as destructurable object', () => {
        const userExports = require('../entities/user');
        assert.ok(userExports.User, 'User should be exported in named export');
        assert.ok(typeof userExports.User === 'function', 'User should be a constructor function');
    });

    it('EntryDTO is exported as destructurable object', () => {
        const entryExports = require('../entities/entry');
        assert.ok(entryExports.EntryDTO, 'EntryDTO should be exported in named export');
        assert.ok(typeof entryExports.EntryDTO === 'function', 'EntryDTO should be a constructor function');
    });

    it('Dataset exports have both DatasetDTO and DatasetListItemDTO', () => {
        const datasetExports = require('../entities/dataset');
        assert.ok(datasetExports.DatasetDTO, 'DatasetDTO should be exported');
        assert.ok(datasetExports.DatasetListItemDTO, 'DatasetListItemDTO should be exported');
        assert.ok(typeof datasetExports.DatasetDTO === 'function', 'DatasetDTO should be a constructor');
        assert.ok(typeof datasetExports.DatasetListItemDTO === 'function', 'DatasetListItemDTO should be a constructor');
    });

    it('entry.js has use strict directive', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const entryPath = path.join(__dirname, '..', 'entities', 'entry.js');
        const content = fs.readFileSync(entryPath, 'utf8');
        assert.ok(content.startsWith("'use strict';"), 'entry.js should start with use strict');
    });
});
