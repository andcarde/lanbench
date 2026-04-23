'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const path = require('node:path');
const { tmpdir } = require('node:os');

const {
    TEMP_STORAGE_DIR,
    resolveTempFilePath,
    listCandidateTempFilePaths
} = require('../utils/temp-storage');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('temp-storage', () => {
    it('usa un directorio temporal namespaced bajo os.tmpdir()', () => {
        assert.equal(TEMP_STORAGE_DIR, path.join(tmpdir(), 'lanbench', 'uploads'));
    });

    it('resuelve ficheros temporales dentro del namespace de la aplicación', () => {
        assert.equal(
            resolveTempFilePath('dataset.xml'),
            path.join(tmpdir(), 'lanbench', 'uploads', 'dataset.xml')
        );
    });

    it('mantiene compatibilidad de lectura con el path legacy /tmp', () => {
        const candidates = listCandidateTempFilePaths('dataset.xml');
        assert.equal(candidates[0], path.join(tmpdir(), 'lanbench', 'uploads', 'dataset.xml'));
        assert.equal(candidates[1], path.join('/tmp', 'dataset.xml'));
    });
});
