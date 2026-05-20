'use strict';

/**
 * @file Reader and parser for the WebNLG XML benchmark.
 *
 * Exposes `readDataset` (path -> {@link DatasetDTO}) and `parseDatasetImport`
 * (Buffer -> normalized rows ready to persist). Accepts `legacy` temporary
 * paths by resolving `resolveExistingTempFilePath`.
 */

const { readFileSync } = require('node:fs');
const path = require('node:path');

const { EntryDTO } = require('../entities/entry');
const { DatasetDTO } = require('../entities/dataset');
const {
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple
} = require('./xml-format');
const { resolveExistingTempFilePath } = require('./temp-storage');

const parser = createBenchmarkXmlParser();

/**
 * Reads an XML dataset from the file system and parses it into a DatasetDTO.
 * @param {*} filename - Absolute path or filename in the temporary directory.
 * @returns {*} DatasetDTO with the parsed entries.
 */
function readDataset(filename) {
    const filePath = resolveInputFilePath(filename);
    const xml = readFileSync(filePath, 'utf-8');
    return parseDatasetXml(xml, filePath);
}

/**
 * Parses XML benchmark content and converts it into a DatasetDTO.
 * @param {*} xml - XML content (string or buffer).
 * @param {string} [sourceName] - Human-readable name for error messages.
 * @returns {*} DatasetDTO with the parsed entries.
 */
function parseDatasetXml(xml, sourceName = 'XML') {
    const datasetImport = parseDatasetImport(xml, sourceName);

    return new DatasetDTO({
        entries: datasetImport.entries.map((/** @type {*} */ entry) => new EntryDTO({
            eid: entry.eid,
            category: entry.category,
            shape: entry.shape,
            shapeType: entry.shapeType,
            size: entry.size
        }))
    });
}

/**
 * Parses XML benchmark content into an intermediate structure ready to persist.
 * @param {*} xml - XML content.
 * @param {string} [sourceName] - Human-readable name for error messages.
 * @returns {{entries:Array<*>, languages:Array<string>}} Normalized data.
 */
function parseDatasetImport(xml, sourceName = 'XML') {
    const rawEntries = getRawEntries(xml);

    if (rawEntries.length === 0)
        throw new Error(`No se encontraron entries en ${sourceName}`);

    const entries = rawEntries.map(mapRawEntryToImportRecord);

    return {
        entries,
        languages: collectLanguages(entries)
    };
}

/**
 * Parses XML benchmark content into a list of annotation entries ready for the UI.
 * @param {*} xml - XML content.
 * @returns {Array<*>} Entries with triples and English sentences.
 */
function parseAnnotationEntries(xml) {
    const datasetImport = parseDatasetImport(xml);
    return datasetImport.entries.map(mapImportEntryToAnnotationEntry);
}

/**
 * Adapts a raw entry parsed by fast-xml-parser into the intermediate record.
 * @param {*} rawEntry - Parsed `<entry>` node.
 * @param {*} position - Ordinal index within the dataset.
 * @returns {*} Normalized import record.
 */
function mapRawEntryToImportRecord(rawEntry, position) {
    return {
        position,
        eid: Number(rawEntry['@_eid']),
        category: rawEntry['@_category'] || '',
        shape: rawEntry['@_shape'] ?? null,
        shapeType: rawEntry['@_shape_type'] ?? null,
        size: Number(rawEntry['@_size']),
        originalTriplesets: parseTriplesets(rawEntry.originaltripleset, 'otriple'),
        modifiedTriplesets: parseTriplesets(rawEntry.modifiedtripleset, 'mtriple'),
        lexes: parseLexes(rawEntry.lex),
        dbpediaLinks: parseLinkCollection(rawEntry.dbpedialinks?.dbpedialink),
        links: parseLinkCollection(rawEntry.links?.link)
    };
}

/**
 * Parses an entry's triplesets (original or modified).
 * @param {*} rawTriplesets - Parsed tripleset collection.
 * @param {*} tripleKey - Triple key ("otriple" | "mtriple").
 * @returns {Array<*>} Normalized triplesets with non-null triples.
 */
function parseTriplesets(rawTriplesets, tripleKey) {
    return toArray(rawTriplesets)
        .map((/** @type {*} */ tripleset, /** @type {*} */ triplesetPosition) => ({
            position: triplesetPosition,
            triples: toArray(tripleset?.[tripleKey])
                .map((/** @type {*} */ rawTriple, /** @type {*} */ triplePosition) => {
                    const triple = parsePipeTriple(rawTriple);
                    if (!triple)
                        return null;

                    return {
                        position: triplePosition,
                        subject: triple.subject,
                        predicate: triple.predicate,
                        object: triple.object
                    };
                })
                .filter(Boolean)
        }))
        .filter((/** @type {*} */ tripleset) => tripleset.triples.length > 0);
}

/**
 * Parses an entry's `<lex>` lexicalizations.
 * @param {*} rawLexes - Parsed collection.
 * @returns {Array<*>} Normalized lexes with `lid`, `lang`, `comment` and `text`.
 */
function parseLexes(rawLexes) {
    return toArray(rawLexes).map((/** @type {*} */ rawLex, /** @type {*} */ position) => ({
        position,
        lid: typeof rawLex?.['@_lid'] === 'string' ? rawLex['@_lid'].trim() : '',
        lang: typeof rawLex?.['@_lang'] === 'string' ? rawLex['@_lang'].trim() : '',
        comment: Object.hasOwn(rawLex || {}, '@_comment')
            ? String(rawLex['@_comment'])
            : null,
        text: nodeText(rawLex)
    }));
}

/**
 * Parses a collection of links (DBpedia or internal) into normalized triples.
 * @param {*} rawLinks - Parsed collection.
 * @returns {Array<*>} Normalized links (without nulls).
 */
function parseLinkCollection(rawLinks) {
    return toArray(rawLinks)
        .map((/** @type {*} */ rawLink, /** @type {*} */ position) => {
            const triple = parsePipeTriple(rawLink);
            if (!triple)
                return null;

            return {
                position,
                direction: typeof rawLink?.['@_direction'] === 'string'
                    ? rawLink['@_direction'].trim()
                    : '',
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            };
        })
        .filter(Boolean);
}

/**
 * Adapts an intermediate entry to the format consumed by the annotation UI.
 * @param {*} entry - Already-parsed intermediate entry.
 * @returns {*} Annotation entry with triples and English sentences.
 */
function mapImportEntryToAnnotationEntry(entry) {
    return {
        eid: entry.eid,
        category: entry.category,
        shape: entry.shape,
        shapeType: entry.shapeType,
        size: entry.size,
        originalTriples: flattenTriplesets(entry.originalTriplesets),
        modifiedTriples: flattenTriplesets(entry.modifiedTriplesets),
        sourceSentences: entry.lexes
            .filter((/** @type {*} */ lex) => lex?.lang === 'en')
            .map((/** @type {*} */ lex) => lex.text.trim())
            .filter(Boolean)
    };
}

/**
 * Flattens a collection of triplesets into a flat list of triples.
 * @param {*} triplesets - Intermediate collection.
 * @returns {Array<*>} Flat triples.
 */
function flattenTriplesets(triplesets) {
    return toArray(triplesets).flatMap((/** @type {*} */ tripleset) => toArray(tripleset?.triples).map((/** @type {*} */ triple) => ({
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object
    })));
}

/**
 * Collects the unique set of language codes present in the entries.
 * @param {*} entries - Intermediate list of entries with their lexes.
 * @returns {Array<string>} Language codes without duplicates.
 */
function collectLanguages(entries) {
    return [...new Set(
        entries.flatMap((/** @type {*} */ entry) => entry.lexes.map((/** @type {*} */ lex) => lex.lang).filter(Boolean))
    )];
}

/**
 * Extracts the raw entries from a parsed benchmark.
 * @param {*} xml - XML content.
 * @returns {Array<*>} Parsed `<entry>` nodes.
 */
function getRawEntries(xml) {
    const parsed = parser.parse(toXmlString(xml));
    return toArray(parsed?.benchmark?.entries?.entry);
}

/**
 * Coerces XML content (Buffer, Uint8Array or string) into a UTF-8 string.
 * @param {*} xml - Raw content.
 * @returns {string} XML as a string.
 */
function toXmlString(xml) {
    if (Buffer.isBuffer(xml))
        return xml.toString('utf-8');

    if (xml instanceof Uint8Array)
        return Buffer.from(xml).toString('utf-8');

    if (typeof xml === 'string')
        return xml;

    throw new Error('El contenido XML no es válido.');
}

/**
 * Resolves the absolute path of the XML file, accepting an absolute path or a name in the temporary directory.
 * @param {*} filename - File path or name.
 * @returns {string} Absolute path to read.
 */
function resolveInputFilePath(filename) {
    if (typeof filename !== 'string' || filename.trim().length === 0)
        throw new Error('El nombre del fichero XML es inválido.');

    if (path.isAbsolute(filename))
        return filename;

    return resolveExistingTempFilePath(filename);
}

module.exports = {
    readDataset,
    parseDatasetXml,
    parseDatasetImport,
    parseAnnotationEntries,
    DatasetDTO,
    EntryDTO
};
