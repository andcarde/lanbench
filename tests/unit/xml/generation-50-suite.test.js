'use strict';

/**
 * Network-free consistency coverage for the generation eval corpus
 * (`test-datasets/generation-50-input.xml`). Asserts the file is parseable,
 * holds exactly 50 entries, every entry has triples + an English reference,
 * and the multi-provider eval module exposes both Groq and Gemini provider
 * configs without leaking the actual API keys to the test transcript.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'test-datasets');

function loadInput() {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, 'generation-50-input.xml'), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    return toArray(parsed?.benchmark?.entries?.entry).map((/** @type {*} */ entry) => ({
        eid: Number(entry?.['@_eid']),
        sourceEid: entry?.['@_source_eid'] ? Number(entry['@_source_eid']) : null,
        category: String(entry?.['@_category'] || ''),
        triples: toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean),
        english: toArray(entry?.lex)
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'en')
            .map(nodeText)
            .find(Boolean) || ''
    }));
}

describe('AI-generation evaluation corpus (generation-50)', () => {
    it('input XML parses to exactly 50 entries with triples + English reference', () => {
        const entries = loadInput();
        assert.equal(entries.length, 50);
        const eids = new Set();
        for (const entry of entries) {
            assert.ok(Number.isInteger(entry.eid) && entry.eid > 0, 'eid is a positive integer');
            assert.ok(!eids.has(entry.eid), `eid ${entry.eid} must be unique`);
            eids.add(entry.eid);
            assert.ok(entry.triples.length >= 1, `eid ${entry.eid} has at least one triple`);
            const t = /** @type {Record<string, any>} */ (entry.triples[0]);
            assert.ok(t && t.subject && t.predicate && t.object, `eid ${entry.eid} triple is complete`);
            assert.ok(entry.english.length > 0, `eid ${entry.eid} has an English reference`);
            assert.ok(entry.category.length > 0, `eid ${entry.eid} carries a category`);
        }
    });

    it('eids are re-numbered as a clean 1..50 sequence', () => {
        const entries = loadInput();
        for (let i = 0; i < entries.length; i += 1)
            assert.equal(entries[i].eid, i + 1, `entry ${i} eid is ${i + 1}`);
    });

    it('every entry preserves a source_eid pointing back to ru_dev.xml', () => {
        const entries = loadInput();
        for (const entry of entries)
            assert.ok(Number.isInteger(entry.sourceEid) && /** @type {number} */ (entry.sourceEid) > 0, `eid ${entry.eid} carries source_eid`);
    });

    it('multi-provider eval module exposes Groq and Gemini configs without leaking keys', () => {
        const { PROVIDERS } = require('../../../scripts/eval-correction-quality');
        assert.ok(PROVIDERS.groq && PROVIDERS.gemini, 'both providers are catalogued');

        const groq = PROVIDERS.groq.build();
        const gemini = PROVIDERS.gemini.build();

        assert.equal(groq.provider, 'groq');
        assert.equal(gemini.provider, 'google-ai-studio');
        assert.ok(typeof groq.apiBase === 'string' && groq.apiBase.length > 0);
        assert.ok(typeof gemini.apiBase === 'string' && gemini.apiBase.length > 0);
        assert.ok(typeof groq.model === 'string' && groq.model.length > 0);
        assert.ok(typeof gemini.model === 'string' && gemini.model.length > 0);

        // The provider catalog labels must NOT include the api key. This is the
        // contract the test plan asks for: the harness references .env values
        // by env-var name only, never by their content.
        assert.ok(!PROVIDERS.groq.label.includes(groq.apiKey || 'NONE'));
        assert.ok(!PROVIDERS.gemini.label.includes(gemini.apiKey || 'NONE'));
        assert.equal(PROVIDERS.groq.env, 'GROQ_API_KEY');
        assert.equal(PROVIDERS.gemini.env, 'GEMINI_API_KEY');
    });
});
