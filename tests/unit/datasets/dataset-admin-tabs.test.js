'use strict';

/**
 * Unit coverage for the statistics-tab visibility rules in the admin frontend
 * (`computeTabVisibilityState`). The Revisión tab is only offered when review
 * is enabled, and the section always resets to the Anotación tab so Bootstrap
 * never ends up with zero active panes — the condition that left the Revisión
 * tab inert (P2).
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { computeTabVisibilityState } = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('dataset-admin — computeTabVisibilityState (P2)', () => {
    it('hides the Revisión tab when review is disabled and keeps Anotación active', () => {
        assert.deepEqual(computeTabVisibilityState(false), {
            reviewTabHidden: true,
            activeTab: 'annotationStatsTab'
        });
    });

    it('shows the Revisión tab when review is enabled, still resetting to Anotación', () => {
        assert.deepEqual(computeTabVisibilityState(true), {
            reviewTabHidden: false,
            activeTab: 'annotationStatsTab'
        });
    });
});
