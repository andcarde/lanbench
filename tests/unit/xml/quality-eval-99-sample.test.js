'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { createBenchmarkXmlParser, toArray, parsePipeTriple } = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'test-datasets');
const XML_FILE = 'experiment-dataset.xml';
const META_FILE = 'experiment-dataset-metadata.json';

function loadEntries() {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, XML_FILE), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    return toArray(parsed?.benchmark?.entries?.entry).map((/** @type {*} */ entry) => ({
        eid: Number(entry?.['@_eid']),
        sourceEid: entry?.['@_source_eid'] ? Number(entry['@_source_eid']) : null,
        category: String(entry?.['@_category'] || ''),
        triples: toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean)
    }));
}

describe('Experiment 2 quality corpus (experiment-dataset)', () => {
    it('contains exactly 99 entries with a clean 1..99 eid sequence', () => {
        const entries = loadEntries();
        assert.equal(entries.length, 99);
        entries.forEach((entry, index) => {
            assert.equal(entry.eid, index + 1);
            assert.ok(Number.isInteger(entry.sourceEid) && entry.sourceEid > 0);
            assert.ok(entry.category.length > 0);
            assert.ok(entry.triples.length >= 1);
        });
    });

    it('has exactly 33 entries in each Experiment 2 stratum', () => {
        const metadata = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, META_FILE), 'utf8'));
        assert.equal(metadata.total, 99);
        assert.deepEqual(metadata.perStratum, {
            short: 33,
            medium: 33,
            long: 33
        });
    });

    it('aligns XML entries with metadata and preserves unique source_eid values', () => {
        const entries = loadEntries();
        const metadata = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, META_FILE), 'utf8'));
        const sourceEids = new Set();

        for (const entry of entries) {
            const meta = metadata.entries.find((/** @type {*} */ row) => row.eid === entry.eid);
            assert.ok(meta, `metadata exists for eid ${entry.eid}`);
            assert.equal(meta.sourceEid, entry.sourceEid);
            assert.equal(meta.triples, entry.triples.length);
            assert.ok(!sourceEids.has(entry.sourceEid), `source_eid ${entry.sourceEid} is unique`);
            sourceEids.add(entry.sourceEid);
        }
    });
});
