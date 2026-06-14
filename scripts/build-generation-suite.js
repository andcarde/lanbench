'use strict';

/**
 * @file Builds the 50-entry generation evaluation corpus from the real WebNLG
 * benchmark `test-datasets/ru_dev.xml` (790 entries) using a deterministic
 * stratified sample by category. Output is a WebNLG benchmark XML accepted by
 * `utils/xml-reader.js#parseDatasetImport`: every selected entry keeps its
 * triples plus the English `<lex>` reference (the Russian lex is dropped so
 * the input stays focused on the generation prompt).
 *
 * The sampler:
 *   - allocates per-category quotas proportional to the category's share of
 *     ru_dev.xml, then rounds-down and distributes the residual slots to the
 *     largest categories until the quota sums to 50;
 *   - picks entries deterministically per category (mulberry32 seed) so the
 *     corpus is reproducible across runs.
 *
 * Output: `test-datasets/generation-50-input.xml`
 *
 * Usage: `node scripts/build-generation-suite.js`
 */

const fs = require('node:fs');
const path = require('node:path');

const {
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple
} = require('../utils/xml-format');
const { escapeXml } = require('./build-correction-suite');

const CORPUS_DIR = path.join(__dirname, '..', 'test-datasets');
const SOURCE_FILE = 'ru_dev.xml';
const OUTPUT_FILE = 'generation-50-input.xml';
const TARGET_SIZE = 50;
const SEED = 0x6c616e62; // ascii 'lanb' — deterministic but project-flavoured.

/**
 * Mulberry32: small deterministic PRNG. Sufficient for reproducible sampling.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Parses ru_dev.xml into normalised entries usable by the eval harness.
 * @returns {Array<{ eid:number, category:string, triples:Array<*>, english:string }>}
 */
function loadSourceEntries() {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, SOURCE_FILE), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    return toArray(parsed?.benchmark?.entries?.entry).map((/** @type {*} */ entry) => {
        const triples = toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean);
        const englishLexes = toArray(entry?.lex)
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'en')
            .map(nodeText)
            .filter((s) => typeof s === 'string' && s.trim().length > 0);
        return {
            eid: Number(entry?.['@_eid']),
            category: String(entry?.['@_category'] || '').trim() || '(none)',
            triples,
            english: englishLexes[0] || ''
        };
    }).filter((entry) => entry.triples.length > 0 && entry.english.length > 0);
}

/**
 * Allocates per-category quotas proportional to category share, then bumps
 * the largest categories until the quotas sum to `targetSize`.
 * @param {Map<string, Array<*>>} byCategory
 * @param {number} targetSize
 * @returns {Map<string, number>}
 */
function allocateQuotas(byCategory, targetSize) {
    const total = Array.from(byCategory.values()).reduce((sum, list) => sum + list.length, 0);
    /** @type {Array<{ category:string, share:number, raw:number, floor:number, frac:number }>} */
    const rows = [];

    for (const [category, list] of byCategory) {
        const share = list.length / total;
        const raw = share * targetSize;
        rows.push({ category, share, raw, floor: Math.floor(raw), frac: raw - Math.floor(raw) });
    }

    const allocated = new Map(rows.map((row) => [row.category, row.floor]));
    let remaining = targetSize - Array.from(allocated.values()).reduce((sum, n) => sum + n, 0);

    // Distribute residual slots to categories with the largest fractional part,
    // capped at the available population so we never ask for more than exists.
    const fractionals = rows.slice().sort((a, b) => b.frac - a.frac);
    let index = 0;
    while (remaining > 0 && fractionals.length > 0) {
        const row = fractionals[index % fractionals.length];
        const populationCap = (byCategory.get(row.category) || []).length;
        const current = allocated.get(row.category) || 0;
        if (current < populationCap) {
            allocated.set(row.category, current + 1);
            remaining -= 1;
        }
        index += 1;
        if (index > targetSize * 10) break; // defensive against an impossible quota.
    }

    return allocated;
}

/**
 * Reservoir-style sample of `k` distinct entries from `list` using `rng`.
 * Deterministic for a fixed seed.
 * @param {Array<*>} list
 * @param {number} k
 * @param {() => number} rng
 * @returns {Array<*>}
 */
function sampleK(list, k, rng) {
    const indexes = list.map((_, i) => i);
    // Fisher-Yates partial shuffle to take k distinct indexes.
    const stopAt = Math.max(0, indexes.length - k);
    for (let i = indexes.length - 1; i >= stopAt; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return indexes.slice(stopAt).map((i) => list[i]);
}

/**
 * Renders a generation `<entry>` block (triples + English lex).
 * The eid is re-assigned to the 1..50 sequence so the output is a clean
 * standalone benchmark.
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
 * Builds the corpus and writes the XML.
 * @returns {{ size:number, perCategory:Record<string, number> }}
 */
function run() {
    const source = loadSourceEntries();
    /** @type {Map<string, Array<*>>} */
    const byCategory = new Map();
    for (const entry of source) {
        const bucket = byCategory.get(entry.category) || [];
        bucket.push(entry);
        byCategory.set(entry.category, bucket);
    }

    const quotas = allocateQuotas(byCategory, TARGET_SIZE);
    const rng = mulberry32(SEED);

    /** @type {Array<*>} */
    const picks = [];
    for (const [category, list] of byCategory) {
        const k = quotas.get(category) || 0;
        if (k === 0) continue;
        picks.push(...sampleK(list, k, rng));
    }

    // Stable ordering: by original eid so the corpus reads in a predictable
    // sequence regardless of the iteration order of the category map.
    picks.sort((a, b) => a.eid - b.eid);

    if (picks.length !== TARGET_SIZE)
        throw new Error(`sampler produced ${picks.length} entries; expected ${TARGET_SIZE}`);

    /** @type {Record<string, number>} */
    const perCategory = {};
    for (const pick of picks)
        perCategory[pick.category] = (perCategory[pick.category] || 0) + 1;

    const xml = [
        '<?xml version="1.0" ?>',
        '<benchmark>',
        '  <entries>',
        picks.map((pick, i) => renderEntry(pick, i + 1)).join('\n'),
        '  </entries>',
        '</benchmark>',
        ''
    ].join('\n');

    fs.writeFileSync(path.join(CORPUS_DIR, OUTPUT_FILE), xml, 'utf8');

    console.log(`✔ ${OUTPUT_FILE}  (${TARGET_SIZE} entries sampled from ${SOURCE_FILE})`);
    console.log('  per-category proportion:');
    for (const [category, count] of Object.entries(perCategory).sort((a, b) => b[1] - a[1]))
        console.log(`    ${category.padEnd(18)} ${count}`);

    return { size: TARGET_SIZE, perCategory };
}

if (require.main === module)
    run();

module.exports = { run, loadSourceEntries, allocateQuotas, sampleK, mulberry32 };
