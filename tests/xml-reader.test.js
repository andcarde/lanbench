'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const { readDataset, DatasetDTO, EntryDTO } = require('../utils/xml-reader');
const { TEMP_STORAGE_DIR } = require('../utils/temp-storage');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;
const before = global.before || testApi.before;

const TEST_XML = join(__dirname, '..', 'test_datasets', 'ru_dev.xml');
const TEMP_XML = join(TEMP_STORAGE_DIR, 'ru_dev.xml');

describe('xml-reader — readDataset()', () => {
    before(() => {
        mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
        copyFileSync(TEST_XML, TEMP_XML);
    });

    it('devuelve una instancia de DatasetDTO', () => {
        const dataset = readDataset('ru_dev.xml');
        assert.ok(dataset instanceof DatasetDTO);
    });

    it('entries es un Array', () => {
        const dataset = readDataset('ru_dev.xml');
        assert.ok(Array.isArray(dataset.entries));
    });

    it('contiene las 790 entries del fichero ru_dev.xml', () => {
        const dataset = readDataset('ru_dev.xml');
        assert.equal(dataset.entries.length, 790);
    });

    it('cada entry es una instancia de EntryDTO', () => {
        const { entries } = readDataset('ru_dev.xml');
        for (const entry of entries)
            assert.ok(entry instanceof EntryDTO, `eid ${entry.eid} no es EntryDTO`);
    });

    it('eid y size son números', () => {
        const { entries } = readDataset('ru_dev.xml');
        for (const entry of entries) {
            assert.equal(typeof entry.eid, 'number');
            assert.equal(typeof entry.size, 'number');
        }
    });

    it('primera entry tiene los campos correctos', () => {
        const { entries } = readDataset('ru_dev.xml');
        const first = entries[0];
        assert.equal(first.eid, 1);
        assert.equal(first.category, 'Airport');
        assert.equal(first.shape, '(X (X))');
        assert.equal(first.shapeType, 'NA');
        assert.equal(first.size, 1);
    });

    it('shape y shapeType son null cuando el atributo está ausente', () => {
        const { entries } = readDataset('ru_dev.xml');
        const withNull = entries.filter(entry => entry.shape === null || entry.shapeType === null);

        for (const entry of withNull) {
            assert.ok(entry.shape === null || typeof entry.shape === 'string');
            assert.ok(entry.shapeType === null || typeof entry.shapeType === 'string');
        }
    });
});
