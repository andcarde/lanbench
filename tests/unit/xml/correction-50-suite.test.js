'use strict';

/**
 * Network-free consistency coverage for the 50-entry labelled-errors corpus
 * used by the multi-provider AI-correction eval. Asserts the file pair
 * `correction-50-input.xml` + `correction-50-expected.json` honours the test
 * plan mix (30 ok / 10 spelling / 10 fluency) and is internally coherent.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'test-datasets');
const VALID_SEVERITIES = new Set(['ok', 'warning', 'error']);
const SPELLING_CODES = new Set(['spelling_error', 'accent_error']);
const FLUENCY_CODES = new Set(['unnatural_expression', 'vague_translation']);

function loadInput() {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, 'correction-50-input.xml'), 'utf8');
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

function loadExpected() {
    return JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, 'correction-50-expected.json'), 'utf8'));
}

/**
 * @param {Record<string, any>} entry
 * @returns {'ok'|'spelling'|'fluency'|'other'}
 */
function classify(entry) {
    if (entry.expectedSeverity === 'ok')
        return 'ok';
    const codes = entry.expectedCodes || [];
    if (codes.some((/** @type {string} */ c) => SPELLING_CODES.has(c)))
        return 'spelling';
    if (codes.some((/** @type {string} */ c) => FLUENCY_CODES.has(c)))
        return 'fluency';
    return 'other';
}

describe('AI-correction labelled-errors corpus (correction-50)', () => {
    it('input XML parses to exactly 50 entries with triples + a Spanish candidate', () => {
        const entries = loadInput();
        assert.equal(entries.length, 50);
        const eids = new Set();
        for (const entry of entries) {
            assert.ok(!eids.has(entry.eid), `eid ${entry.eid} must be unique`);
            eids.add(entry.eid);
            assert.ok(entry.triples.length >= 1, `eid ${entry.eid} has at least one triple`);
            const t = /** @type {Record<string, any>} */ (entry.triples[0]);
            assert.ok(t && t.subject && t.predicate && t.object, `eid ${entry.eid} triple is complete`);
            assert.ok(entry.spanish.length > 0, `eid ${entry.eid} has a Spanish candidate`);
        }
    });

    it('expected JSON aligns 1:1 with the input and uses valid severities', () => {
        const input = loadInput();
        const expected = loadExpected();
        assert.equal(expected.entryCount, 50);
        assert.equal(expected.entries.length, 50);
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

    it('mix exactly matches the test plan: 30 ok + 10 spelling + 10 fluency', () => {
        const expected = loadExpected();
        const tally = { ok: 0, spelling: 0, fluency: 0, other: 0 };
        for (const e of expected.entries)
            tally[classify(e)] += 1;
        assert.deepEqual(tally, { ok: 30, spelling: 10, fluency: 10, other: 0 });
    });

    it('counts in the expected file match the severities of its entries', () => {
        const expected = loadExpected();
        /** @type {Record<string, number>} */
        const tally = { ok: 0, warning: 0, error: 0 };
        for (const e of expected.entries)
            tally[e.expectedSeverity] += 1;
        assert.deepEqual(expected.counts, tally);
    });
});
