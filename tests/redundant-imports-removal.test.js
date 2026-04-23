'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('Redundant imports removal', () => {
    it('datasets-controller.js should not import normalizePercent', () => {
        const content = fs.readFileSync(
            path.join(__dirname, '..', 'business', 'datasets-controller.js'),
            'utf8'
        );
        assert.ok(!content.includes('normalizePercent'),
            'datasets-controller.js should not import normalizePercent (not used)');
    });

    it('datasets-controller.js should not import writeDataset', () => {
        const content = fs.readFileSync(
            path.join(__dirname, '..', 'business', 'datasets-controller.js'),
            'utf8'
        );
        assert.ok(!content.includes("require('../utils/xml-writer')"),
            'datasets-controller.js should not import writeDataset (not used)');
    });

    it('package.json should not have cookie-parser dependency', () => {
        const packageJson = require('../package.json');
        assert.ok(!packageJson.dependencies['cookie-parser'],
            'cookie-parser should be removed from dependencies (not used)');
    });

    it('package.json should not have morgan dependency', () => {
        const packageJson = require('../package.json');
        assert.ok(!packageJson.dependencies['morgan'],
            'morgan should be removed from dependencies (not used)');
    });

    it('xml-utils.js shim should be removed', () => {
        const xmlUtilsPath = path.join(__dirname, '..', 'utils', 'xml-utils.js');
        assert.ok(!fs.existsSync(xmlUtilsPath),
            'xml-utils.js shim should be deleted');
    });

    it('download_datasets.js should be removed', () => {
        const downloadPath = path.join(__dirname, '..', 'download_datasets.js');
        assert.ok(!fs.existsSync(downloadPath),
            'download_datasets.js should be deleted (only exported unused constant)');
    });
});
