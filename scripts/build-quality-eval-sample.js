'use strict';

/**
 * @file Builds the 99-entry Experiment 2 corpus from WebNLG `ru_dev.xml`
 * using deterministic stratified random sampling by triple-count complexity.
 *
 * Strata, per `doc-planning/EXPERIMENT-2.md`:
 *   - short  : 1-2 triples
 *   - medium : 3-4 triples
 *   - long   : 5-7 triples
 *
 * The sampler draws 33 entries without replacement from each stratum, yielding
 * 99 total entries. Output is a WebNLG benchmark XML accepted by
 * `utils/xml-reader.js#parseDatasetImport`, plus metadata for traceability.
 *
 * Outputs:
 *   - `test-datasets/experiment-dataset.xml`
 *   - `test-datasets/experiment-dataset-metadata.json`
 *
 * Usage: `node scripts/build-quality-eval-sample.js`
 */

const fs = require('node:fs');
const path = require('node:path');

const {
    loadSourceEntries,
    sampleK,
    mulberry32
} = require('./build-generation-suite');
const { escapeXml } = require('./build-correction-suite');

const CORPUS_DIR = path.join(__dirname, '..', 'test-datasets');
const OUTPUT_XML = 'experiment-dataset.xml';
const OUTPUT_META = 'experiment-dataset-metadata.json';
const PER_STRATUM = 33;
const SEED = 0x65787032; // ASCII 'exp2'.

const STRATA = [
    { key: 'short', label: 'Corto (1-2 tripletas)', match: (n) => n >= 1 && n <= 2 },
    { key: 'medium', label: 'Medio (3-4 tripletas)', match: (n) => n >= 3 && n <= 4 },
    { key: 'long', label: 'Largo (5-7 tripletas)', match: (n) => n >= 5 && n <= 7 }
];

/**
 * Renders a benchmark `<entry>` block, re-assigning `eid` to the clean 1..99
 * sequence and preserving `source_eid` for traceability.
 *
 * @param {Record<string, any>} entry
 * @param {number} newEid
 * @returns {string}
 */
function renderEntry(entry, newEid) {
    const size = entry.triples.length;
    const tripleText = (/** @type {*} */ t) => escapeXml(`${t.subject} | ${t.predicate} | ${t.object}`);
    const otriples = entry.triples
        .map((/** @type {*} */ t) => `        <otriple>${tripleText(t)}</otriple>`)
        .join('\n');
    const mtriples = entry.triples
        .map((/** @type {*} */ t) => `        <mtriple>${tripleText(t)}</mtriple>`)
        .join('\n');

    return [
        `    <entry category="${escapeXml(entry.category)}" eid="${newEid}" shape="(X (X))" shape_type="NA" size="${size}" source_eid="${entry.eid}">`,
        '      <originaltripleset>',
        otriples,
        '      </originaltripleset>',
        '      <modifiedtripleset>',
        mtriples,
        '      </modifiedtripleset>',
        `      <lex comment="reference" lang="en" lid="Id1">${escapeXml(entry.english)}</lex>`,
        '    </entry>'
    ].join('\n');
}

/**
 * Groups source entries into the three Experiment 2 strata.
 * @param {Array<*>} entries
 * @returns {Map<string, Array<*>>}
 */
function partitionByStratum(entries) {
    /** @type {Map<string, Array<*>>} */
    const buckets = new Map(STRATA.map((s) => [s.key, []]));
    for (const entry of entries) {
        const stratum = STRATA.find((s) => s.match(entry.triples.length));
        if (!stratum) continue;
        (buckets.get(stratum.key) || []).push(entry);
    }
    return buckets;
}

/**
 * Draws `PER_STRATUM` entries from each stratum using a single deterministic
 * PRNG sequence so the corpus is reproducible from `SEED`.
 *
 * @param {Map<string, Array<*>>} buckets
 * @returns {Array<{ stratumKey:string, entry:*, sourceEid:number }>}
 */
function drawStratifiedSample(buckets) {
    const rng = mulberry32(SEED);
    /** @type {Array<{ stratumKey:string, entry:*, sourceEid:number }>} */
    const picks = [];

    for (const stratum of STRATA) {
        const pool = buckets.get(stratum.key) || [];
        if (pool.length < PER_STRATUM)
            throw new Error(`stratum '${stratum.key}' has ${pool.length} entries, less than ${PER_STRATUM}`);

        const sampled = sampleK(pool, PER_STRATUM, rng);
        for (const entry of sampled)
            picks.push({ stratumKey: stratum.key, entry, sourceEid: entry.eid });
    }

    return picks;
}

/**
 * Builds the corpus and writes XML + metadata.
 * @returns {{ total:number, perStratum:Record<string, number>, seed:number, xmlPath:string, metadataPath:string }}
 */
function run() {
    const source = loadSourceEntries();
    const buckets = partitionByStratum(source);
    const picks = drawStratifiedSample(buckets);

    // Stable ordering: each section of 33 entries maps to one stratum.
    picks.sort((a, b) => {
        const stratumA = STRATA.findIndex((s) => s.key === a.stratumKey);
        const stratumB = STRATA.findIndex((s) => s.key === b.stratumKey);
        if (stratumA !== stratumB) return stratumA - stratumB;
        return a.sourceEid - b.sourceEid;
    });

    /** @type {Record<string, number>} */
    const perStratum = {};
    for (const stratum of STRATA) perStratum[stratum.key] = 0;
    for (const pick of picks) perStratum[pick.stratumKey] += 1;

    const xml = [
        '<?xml version="1.0" ?>',
        '<benchmark>',
        '  <entries>',
        picks.map((pick, i) => renderEntry(pick.entry, i + 1)).join('\n'),
        '  </entries>',
        '</benchmark>',
        ''
    ].join('\n');

    const metadata = {
        seed: SEED,
        seedHex: `0x${SEED.toString(16)}`,
        total: picks.length,
        perStratum,
        strata: STRATA.map((s) => ({ key: s.key, label: s.label })),
        entries: picks.map((pick, i) => ({
            eid: i + 1,
            sourceEid: pick.sourceEid,
            stratum: pick.stratumKey,
            triples: pick.entry.triples.length,
            category: pick.entry.category
        }))
    };

    const xmlPath = path.join(CORPUS_DIR, OUTPUT_XML);
    const metadataPath = path.join(CORPUS_DIR, OUTPUT_META);
    fs.writeFileSync(xmlPath, xml, 'utf8');
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

    console.log(`OK ${OUTPUT_XML} (${picks.length} entries sampled from ru_dev.xml)`);
    console.log(`OK ${OUTPUT_META}`);
    console.log(`  seed: 0x${SEED.toString(16)} (${SEED})`);
    console.log('  per-stratum count:');
    for (const stratum of STRATA)
        console.log(`    ${stratum.key.padEnd(6)} ${perStratum[stratum.key]}`);

    return { total: picks.length, perStratum, seed: SEED, xmlPath, metadataPath };
}

if (require.main === module)
    run();

module.exports = {
    run,
    partitionByStratum,
    drawStratifiedSample,
    STRATA,
    PER_STRATUM,
    SEED,
    OUTPUT_XML,
    OUTPUT_META
};
