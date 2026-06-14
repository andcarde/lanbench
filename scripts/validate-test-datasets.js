'use strict';

/**
 * @file Validates the `test-datasets/` corpus (P3).
 *
 * Parses every declared WebNLG XML fixture through the production importer
 * (`utils/xml-reader.js#parseDatasetImport`), asserts it contains at least one
 * entry, and prints its entry count. Exits non-zero on any malformed or empty
 * file so it can gate CI.
 *
 * Usage: `node scripts/validate-test-datasets.js`
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseDatasetImport } = require('../utils/xml-reader');

const CORPUS_DIR = path.join(__dirname, '..', 'test-datasets');

/**
 * The XML fixtures the suites and manual flows rely on, with the minimum entry
 * count each must expose. Keep in sync with `test-datasets/README.md`.
 * @type {Array<{ file:string, minEntries:number }>}
 */
const DECLARED_XML_FILES = [
    { file: 'ru_dev.xml', minEntries: 700 },
    { file: 'ru_dev_2.xml', minEntries: 100 },
    { file: 'test.xml', minEntries: 20 },
    { file: 'test-1.xml', minEntries: 12 },
    { file: 'test-2.xml', minEntries: 8 },
    { file: 'correction-example-1-input.xml', minEntries: 2 },
    { file: 'correction-example-1-expected.xml', minEntries: 2 },
    { file: 'correction-10-input.xml', minEntries: 10 },
    { file: 'correction-20-input.xml', minEntries: 20 },
    { file: 'correction-30-input.xml', minEntries: 30 },
    { file: 'correction-40-input.xml', minEntries: 40 }
];

/**
 * Validates a single fixture file. Throws on any problem.
 * @param {{ file:string, minEntries:number }} declared
 * @returns {number} The entry count.
 */
function validateFile({ file, minEntries }) {
    const filePath = path.join(CORPUS_DIR, file);
    if (!fs.existsSync(filePath))
        throw new Error(`missing file: ${file}`);

    const xml = fs.readFileSync(filePath, 'utf8');
    const dataset = parseDatasetImport(xml, file);
    const count = Array.isArray(dataset.entries) ? dataset.entries.length : 0;

    if (count < minEntries)
        throw new Error(`${file}: expected ≥ ${minEntries} entries, parsed ${count}`);

    return count;
}

/**
 * Runs the validation over the whole declared corpus.
 * @returns {number} Process exit code (0 ok, 1 on failure).
 */
function run() {
    let failures = 0;
    for (const declared of DECLARED_XML_FILES) {
        try {
            const count = validateFile(declared);
            console.log(`✔ ${declared.file.padEnd(34)} ${count} entries`);
        } catch (error) {
            failures += 1;
            console.error(`x ${declared.file.padEnd(34)} ${/** @type {any} */ (error).message}`);
        }
    }

    if (failures > 0) {
        console.error(`\n${failures} corpus file(s) failed validation.`);
        return 1;
    }
    console.log(`\nAll ${DECLARED_XML_FILES.length} corpus files are valid WebNLG.`);
    return 0;
}

if (require.main === module)
    process.exit(run());

module.exports = { validateFile, DECLARED_XML_FILES, run };
