'use strict';

/**
 * Consistency coverage for the AI-correction evaluation corpus
 * (`test-datasets/correction-{10,20,30,40}-{input.xml,expected.json}`), generated
 * from `correction-suite.master.json` by `scripts/build-correction-suite.js`.
 *
 * These checks are network-free (they do NOT call Groq): they prove the corpus
 * is internally coherent and consumable by the importer, so the live
 * `scripts/eval-correction-quality.js` harness scores a well-formed corpus.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'test-datasets');
const SIZES = [10, 20, 30, 40];
const VALID_SEVERITIES = new Set(['ok', 'warning', 'error']);

/**
 * Parses a correction input fixture into `[{ eid, triples, spanish }]`.
 * @param {string} file
 * @returns {Array<{ eid:number, triples:Array<*>, spanish:string }>}
 */
function loadInput(file) {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    return toArray(parsed?.benchmark?.entries?.entry).map((/** @type {*} */ entry) => ({
        eid: Number(entry?.['@_eid']),
        triples: toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean),
        spanish: toArray(entry?.lex)
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'es')
            .map(nodeText)
            .find(Boolean) || ''
    }));
}

/**
 * Loads the expected-verdicts JSON for a size.
 * @param {number} size
 * @returns {Record<string, any>}
 */
function loadExpected(size) {
    return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `correction-${size}-expected.json`), 'utf8'));
}

describe('AI-correction evaluation corpus (correction-{10,20,30,40})', () => {
    for (const size of SIZES) {
        describe(`size ${size}`, () => {
            it(`input XML parses to ${size} entries, each with triples + a Spanish candidate`, () => {
                const entries = loadInput(`correction-${size}-input.xml`);
                assert.equal(entries.length, size);
                for (const entry of entries) {
                    assert.ok(entry.triples.length >= 1, `eid ${entry.eid} has at least one triple`);
                    const t = entry.triples[0];
                    assert.ok(t.subject && t.predicate && t.object, `eid ${entry.eid} triple is complete`);
                    assert.ok(entry.spanish.length > 0, `eid ${entry.eid} has a Spanish candidate`);
                }
            });

            it('expected JSON aligns 1:1 with the input and uses valid severities', () => {
                const input = loadInput(`correction-${size}-input.xml`);
                const expected = loadExpected(size);
                assert.equal(expected.entryCount, size);
                assert.equal(expected.entries.length, size);
                assert.deepEqual(expected.entries.map((/** @type {*} */ e) => e.eid), input.map(e => e.eid));

                for (const e of expected.entries) {
                    assert.ok(VALID_SEVERITIES.has(e.expectedSeverity), `eid ${e.eid} severity is valid`);
                    assert.ok(Array.isArray(e.expectedCodes), `eid ${e.eid} expectedCodes is an array`);
                    if (e.expectedSeverity === 'ok')
                        assert.equal(e.corrected, null, `accepted eid ${e.eid} needs no correction`);
                    else
                        assert.ok(typeof e.corrected === 'string' && e.corrected.length > 0, `flagged eid ${e.eid} carries a corrected form`);
                }
            });

            it('counts in the expected file match the severities of its entries', () => {
                const expected = loadExpected(size);
                /** @type {Record<string, number>} */
                const tally = { ok: 0, warning: 0, error: 0 };
                for (const e of expected.entries)
                    tally[e.expectedSeverity] += 1;
                assert.deepEqual(expected.counts, tally);
            });
        });
    }

    it('the corpora nest: correction-10 ⊂ 20 ⊂ 30 ⊂ 40 (same eids/candidates)', () => {
        const bySize = SIZES.map(size => loadInput(`correction-${size}-input.xml`));
        for (let i = 0; i < bySize.length - 1; i += 1) {
            const smaller = bySize[i];
            const larger = bySize[i + 1];
            for (let j = 0; j < smaller.length; j += 1) {
                assert.equal(larger[j].eid, smaller[j].eid, 'eids are a stable prefix');
                assert.equal(larger[j].spanish, smaller[j].spanish, 'candidates are a stable prefix');
            }
        }
    });

    it('covers all three verdict families (acceptance, warning, error) in every size', () => {
        for (const size of SIZES) {
            const expected = loadExpected(size);
            assert.ok(expected.counts.ok > 0, `size ${size} has acceptances`);
            assert.ok(expected.counts.warning > 0, `size ${size} has warnings`);
            assert.ok(expected.counts.error > 0, `size ${size} has errors`);
        }
    });
});
