'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const path = require('node:path');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('dto contracts', () => {
    it('define los DTOs canónicos requeridos en contracts/dtos.json', () => {
        const schemaPath = path.join(__dirname, '..', 'contracts', 'dtos.json');
        const schema = require(schemaPath);

        assert.deepEqual(schema.required, [
            'DatasetList',
            'DatasetSection',
            'EntryContext',
            'SentenceValidation',
            'SavedAnnotation'
        ]);
        assert.ok(schema.$defs.DatasetList);
        assert.ok(schema.$defs.DatasetSection);
        assert.ok(schema.$defs.EntryContext);
        assert.ok(schema.$defs.SentenceValidation);
        assert.ok(schema.$defs.SavedAnnotation);
    });

    it('documenta obligatorios y opcionales en los DTOs nucleares', () => {
        const schemaPath = path.join(__dirname, '..', 'contracts', 'dtos.json');
        const schema = require(schemaPath);

        assert.deepEqual(schema.$defs.DatasetList.required, [
            'id',
            'name',
            'totalEntries',
            'completedPercent',
            'remainPercent'
        ]);
        assert.equal(schema.$defs.DatasetList.properties.withoutReviewPercent.description.startsWith('Opcional.'), true);
        assert.deepEqual(schema.$defs.EntryContext.required, [
            'entryId',
            'triples',
            'englishSentences',
            'sectionIndex'
        ]);
        assert.deepEqual(schema.$defs.SentenceValidation.required, [
            'sentence',
            'isValid',
            'alerts',
            'rejectionReasons'
        ]);
    });
});
