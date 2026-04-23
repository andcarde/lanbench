'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const path = require('node:path');
const fs = require('node:fs').promises;

const { writeDataset } = require('../utils/xml-writer');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('xml-writer async/await API', () => {
    it('writeDataset should be an async function', () => {
        assert.ok(writeDataset.constructor.name === 'AsyncFunction',
            'writeDataset should be an async function, not callback-based');
    });

    it('writeDataset should return a Promise', async () => {
        const mockDataset = {
            entries: [
                { eid: 1, category: 'test', shape: null, shapeType: null, size: 1 }
            ]
        };

        const result = writeDataset(mockDataset);
        assert.ok(result instanceof Promise, 'writeDataset should return a Promise');

        // Clean up the file created
        const filename = await result;
        assert.ok(typeof filename === 'string', 'Promise should resolve to a filename string');
    });
});
