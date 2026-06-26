'use strict';

/**
 * Fixes the per-k acceptance breakdown computed by
 * scripts/eval-acceptance-by-triple-count.js against the canonical snapshot
 * documentation/experiment-dataset/corrected.json. If the snapshot or the
 * acceptance definition change, this test breaks loudly and the memory
 * (06_Resultados.tex) must be updated in lock-step.
 *
 * Network-free, DB-free.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
    computeAcceptanceByTripleCount,
    isEntryAccepted
} = require('../../../scripts/eval-acceptance-by-triple-count');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const SNAPSHOT_PATH = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'documentation',
    'experiment-dataset',
    'corrected.json'
);

describe('eval-acceptance-by-triple-count', () => {
    it('reproduces the published per-k acceptance breakdown from corrected.json', () => {
        const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
        const result = computeAcceptanceByTripleCount(snapshot);

        assert.deepEqual(result.rows, [
            { k: 1, n: 19, accepted: 15, ratePercent: 78.9 },
            { k: 2, n: 14, accepted: 11, ratePercent: 78.6 },
            { k: 3, n: 20, accepted: 13, ratePercent: 65.0 },
            { k: 4, n: 13, accepted: 10, ratePercent: 76.9 },
            { k: 5, n: 22, accepted: 12, ratePercent: 54.5 },
            { k: 6, n: 7, accepted: 5, ratePercent: 71.4 },
            { k: 7, n: 4, accepted: 3, ratePercent: 75.0 }
        ]);
        assert.deepEqual(result.total, { n: 99, accepted: 69, ratePercent: 69.7 });
    });

    it('cross-checks per-stratum subtotals against the figures reported in 05_Experimento.tex', () => {
        const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
        const result = computeAcceptanceByTripleCount(snapshot);

        const sumOver = (range) => range.reduce(
            (acc, k) => {
                const row = result.rows.find((r) => r.k === k);
                return { n: acc.n + row.n, accepted: acc.accepted + row.accepted };
            },
            { n: 0, accepted: 0 }
        );

        const short = sumOver([1, 2]);
        const medium = sumOver([3, 4]);
        const long = sumOver([5, 6, 7]);

        assert.equal(short.n, 33);
        assert.equal(short.accepted, 26);
        assert.equal(medium.n, 33);
        assert.equal(medium.accepted, 23);
        assert.equal(long.n, 33);
        assert.equal(long.accepted, 20);
    });

    it('isEntryAccepted requires all annotations un-rewritten and all decisions accepted', () => {
        assert.equal(isEntryAccepted({
            annotations: [
                {
                    wasCorrected: false,
                    decisions: [
                        { decision: 'accepted' },
                        { decision: 'accepted' },
                        { decision: 'accepted' },
                        { decision: 'accepted' },
                        { decision: 'accepted' }
                    ]
                }
            ]
        }), true);

        assert.equal(isEntryAccepted({
            annotations: [
                {
                    wasCorrected: true,
                    decisions: [{ decision: 'accepted' }]
                }
            ]
        }), false);

        assert.equal(isEntryAccepted({
            annotations: [
                {
                    wasCorrected: false,
                    decisions: [
                        { decision: 'accepted' },
                        { decision: 'rejected' }
                    ]
                }
            ]
        }), false);

        assert.equal(isEntryAccepted({ annotations: [] }), false);
    });
});
