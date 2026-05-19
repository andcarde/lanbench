'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    ENTRY_PENDING,
    ENTRY_IN_PROGRESS,
    ENTRY_ANNOTATED,
    ENTRY_UNDER_REVIEW,
    ENTRY_REVIEWED,
    ENTRY_DISPUTED,
    ALL_ENTRY_STATUSES
} = require('../../../constants/entry-status');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('entry-status constants', () => {
    it('exporta los tres valores base de estado de entrada', () => {
        assert.equal(ENTRY_PENDING, 'pending');
        assert.equal(ENTRY_IN_PROGRESS, 'in_progress');
        assert.equal(ENTRY_ANNOTATED, 'annotated');
    });

    it('exporta los tres estados de revision (E4)', () => {
        assert.equal(ENTRY_UNDER_REVIEW, 'under_review');
        assert.equal(ENTRY_REVIEWED, 'reviewed');
        assert.equal(ENTRY_DISPUTED, 'disputed');
    });

    it('los estados de revision no colisionan con los de anotacion', () => {
        assert.notEqual(ENTRY_UNDER_REVIEW, ENTRY_ANNOTATED);
        assert.notEqual(ENTRY_REVIEWED, ENTRY_ANNOTATED);
        assert.notEqual(ENTRY_DISPUTED, ENTRY_ANNOTATED);
    });

    it('ALL_ENTRY_STATUSES contiene exactamente los seis estados', () => {
        assert.equal(ALL_ENTRY_STATUSES.length, 6);
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_PENDING));
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_IN_PROGRESS));
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_ANNOTATED));
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_UNDER_REVIEW));
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_REVIEWED));
        assert.ok(ALL_ENTRY_STATUSES.includes(ENTRY_DISPUTED));
    });
});
