'use strict';

/**
 * Unit coverage for the AI-correction example fixtures (P3, T3.2). Asserts the
 * paired `correction-example-1-{input,expected}.xml` files load via the shared
 * `fast-xml-parser` configuration and expose the triple/sentence shape the
 * correction flow consumes (triples + a Spanish candidate sentence), and that
 * the expected file genuinely corrects the flawed input.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'test-datasets');

/**
 * Parses a correction fixture into `[{ triples, spanish }]`, mirroring what the
 * correction flow consumes: each entry's modified triples plus its `es` lex.
 * @param {string} file - Fixture filename under test-datasets/.
 * @returns {Array<{ triples:Array<{subject:string,predicate:string,object:string}>, spanish:string }>}
 */
function loadCorrectionEntries(file) {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8');
    const parser = createBenchmarkXmlParser();
    const parsed = parser.parse(xml);
    const entries = toArray(parsed?.benchmark?.entries?.entry);

    return entries.map(entry => {
        const triples = toArray(entry?.modifiedtripleset)
            .flatMap(tripleset => toArray(tripleset?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean);
        const spanish = toArray(entry?.lex)
            .filter(lex => lex && lex['@_lang'] === 'es')
            .map(nodeText)
            .find(Boolean) || '';
        return { triples: /** @type {any} */ (triples), spanish };
    });
}

describe('AI-correction example fixtures (P3, T3.2)', () => {
    it('the input fixture exposes triples and a Spanish candidate per entry', () => {
        const entries = loadCorrectionEntries('correction-example-1-input.xml');
        assert.equal(entries.length, 2);
        for (const entry of entries) {
            assert.ok(entry.triples.length >= 1, 'each entry exposes at least one triple');
            const triple = entry.triples[0];
            assert.ok(triple.subject && triple.predicate && triple.object, 'triple has subject/predicate/object');
            assert.ok(entry.spanish.length > 0, 'each entry exposes a Spanish candidate sentence');
        }
    });

    it('the expected fixture corrects each Spanish candidate while keeping the triples', () => {
        const input = loadCorrectionEntries('correction-example-1-input.xml');
        const expected = loadCorrectionEntries('correction-example-1-expected.xml');
        assert.equal(input.length, expected.length);

        for (let i = 0; i < input.length; i += 1) {
            assert.deepEqual(expected[i].triples, input[i].triples, 'the triples are unchanged by the correction');
            assert.notEqual(expected[i].spanish, input[i].spanish, 'the corrected sentence differs from the candidate');
            assert.ok(expected[i].spanish.length > 0);
        }
    });
});
