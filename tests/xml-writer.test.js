'use strict';

/**
 * Test de integración: round-trip xml-reader → xml-writer → xml-reader.
 *
 * Flujo:
 *   1. Lee test_datasets/ru_dev.xml  →  DatasetDTO original
 *   2. Serializa ese DTO             →  fichero temporal en /tmp
 *   3. Vuelve a leer el fichero      →  DatasetDTO resultado
 *   4. Compara ambos DTOs            →  deben ser idénticos
 */

const assert   = require('node:assert/strict');
const testApi  = require('node:test');
const { copyFileSync, unlinkSync } = require('node:fs');
const { join }         = require('node:path');

const { readDataset }  = require('../utils/xml-reader');
const { writeDataset } = require('../utils/xml-writer');
const { TEMP_STORAGE_DIR, ensureTempStorageDir } = require('../utils/temp-storage');

const describe = global.describe || testApi.describe;
const it       = global.it       || testApi.it;
const before   = global.before   || testApi.before;
const after    = global.after    || testApi.after;

const TEST_XML = join(__dirname, '..', 'test_datasets', 'ru_dev.xml');
const TMP_SRC  = join(ensureTempStorageDir(), 'ru_dev.xml');

describe('xml-writer — integración round-trip', () => {
    let generatedFilename = null;

    before(() => {
        copyFileSync(TEST_XML, TMP_SRC);
    });

    after(() => {
        if (generatedFilename) {
            try { unlinkSync(join(TEMP_STORAGE_DIR, generatedFilename)); } catch { /* ignorar */ }
        }
    });

    it('writeDataset serializa el dataset y devuelve un nombre de 32 caracteres', async () => {
        const original = readDataset('ru_dev.xml');
        generatedFilename = await writeDataset(original);

        assert.ok(generatedFilename, 'El nombre no debe ser falsy');
        assert.equal(generatedFilename.length, 32, 'El nombre debe tener exactamente 32 caracteres');
        assert.match(generatedFilename, /^[0-9a-f]{32}$/, 'El nombre debe ser hexadecimal en minúsculas');
    });

    it('el DatasetDTO resultante es idéntico al original (round-trip completo)', async () => {
        const original  = readDataset('ru_dev.xml');
        const filename  = await writeDataset(original);
        generatedFilename = filename;

        const resultado = readDataset(filename);

        assert.equal(resultado.entries.length, original.entries.length,
            'Número de entries debe coincidir');

        assert.deepEqual(resultado.entries, original.entries,
            'Todas las entries deben ser idénticas tras el round-trip');
    });

    it('cada entry del fichero generado conserva eid, category, shape, shapeType y size', async () => {
        const original  = readDataset('ru_dev.xml');
        const filename  = await writeDataset(original);
        generatedFilename = filename;

        const resultado = readDataset(filename);

        for (let i = 0; i < original.entries.length; i++) {
            const orig = original.entries[i];
            const res  = resultado.entries[i];
            assert.equal(res.eid,       orig.eid,       `entries[${i}].eid`);
            assert.equal(res.category,  orig.category,  `entries[${i}].category`);
            assert.equal(res.shape,     orig.shape,     `entries[${i}].shape`);
            assert.equal(res.shapeType, orig.shapeType, `entries[${i}].shapeType`);
            assert.equal(res.size,      orig.size,      `entries[${i}].size`);
        }
    });
});
