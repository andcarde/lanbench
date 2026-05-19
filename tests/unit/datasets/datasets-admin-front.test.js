'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    normaliseRole,
    buildDatasetExportUrl,
    buildDatasetDeleteUrl,
    normaliseCriterion
} = require('../../../public/js/datasets');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('datasets admin frontend helpers (E5)', () => {
    it('normaliseRole solo activa administracion para admin', () => {
        assert.equal(normaliseRole('admin'), 'admin');
        assert.equal(normaliseRole('reviewer'), 'annotator');
        assert.equal(normaliseRole('unknown'), 'annotator');
    });

    it('buildDatasetExportUrl valida ids positivos y normaliza formato', () => {
        assert.equal(buildDatasetExportUrl(4, 'json'), '/api/admin/datasets/4/export?format=json');
        assert.equal(buildDatasetExportUrl('5', 'xml'), '/api/admin/datasets/5/export?format=xml');
        assert.equal(buildDatasetExportUrl(5, 'zip'), '/api/admin/datasets/5/export?format=json');
        assert.equal(buildDatasetExportUrl(0, 'json'), null);
    });

    it('buildDatasetDeleteUrl valida ids positivos', () => {
        assert.equal(buildDatasetDeleteUrl(4), '/api/datasets/4');
        assert.equal(buildDatasetDeleteUrl('5'), '/api/datasets/5');
        assert.equal(buildDatasetDeleteUrl(0), null);
    });

    it('normaliseCriterion tolera entradas parciales', () => {
        assert.deepEqual(normaliseCriterion({
            id: 3,
            key: 'fluency',
            label: 'Fluidez',
            sortOrder: 2,
            active: false,
            version: 4
        }), {
            id: 3,
            key: 'fluency',
            label: 'Fluidez',
            sortOrder: 2,
            active: false,
            version: 4
        });

        assert.equal(normaliseCriterion(null).active, true);
    });
});
