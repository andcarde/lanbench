'use strict';

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

function readDataset(filename) {
    const filePath = resolveInputFilePath(filename);
    const xml = readFileSync(filePath, 'utf-8');
    return parseDatasetXml(xml, filePath);
}

function parseDatasetXml(xml, sourceName = 'XML') {
    const datasetImport = parseDatasetImport(xml, sourceName);

    return new DatasetDTO({
        entries: datasetImport.entries.map(entry => new EntryDTO({
            eid: entry.eid,
            category: entry.category,
            shape: entry.shape,
            shapeType: entry.shapeType,
            size: entry.size
        }))
    });
}

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

function parseAnnotationEntries(xml) {
    const datasetImport = parseDatasetImport(xml);
    return datasetImport.entries.map(mapImportEntryToAnnotationEntry);
}

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
        dbpediaLinks: parseLinkCollection(rawEntry.dbpedialinks && rawEntry.dbpedialinks.dbpedialink),
        links: parseLinkCollection(rawEntry.links && rawEntry.links.link)
    };
}

function parseTriplesets(rawTriplesets, tripleKey) {
    return toArray(rawTriplesets)
        .map((tripleset, triplesetPosition) => ({
            position: triplesetPosition,
            triples: toArray(tripleset && tripleset[tripleKey])
                .map((rawTriple, triplePosition) => {
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
        .filter(tripleset => tripleset.triples.length > 0);
}

function parseLexes(rawLexes) {
    return toArray(rawLexes).map((rawLex, position) => ({
        position,
        lid: typeof rawLex?.['@_lid'] === 'string' ? rawLex['@_lid'].trim() : '',
        lang: typeof rawLex?.['@_lang'] === 'string' ? rawLex['@_lang'].trim() : '',
        comment: Object.prototype.hasOwnProperty.call(rawLex || {}, '@_comment')
            ? String(rawLex['@_comment'])
            : null,
        text: nodeText(rawLex)
    }));
}

function parseLinkCollection(rawLinks) {
    return toArray(rawLinks)
        .map((rawLink, position) => {
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
            .filter(lex => lex && lex.lang === 'en')
            .map(lex => lex.text.trim())
            .filter(Boolean)
    };
}

function flattenTriplesets(triplesets) {
    return toArray(triplesets).flatMap(tripleset => toArray(tripleset && tripleset.triples).map(triple => ({
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object
    })));
}

function collectLanguages(entries) {
    return [...new Set(
        entries.flatMap(entry => entry.lexes.map(lex => lex.lang).filter(Boolean))
    )];
}

function getRawEntries(xml) {
    const parsed = parser.parse(toXmlString(xml));
    return toArray(parsed?.benchmark?.entries?.entry);
}

function toXmlString(xml) {
    if (Buffer.isBuffer(xml))
        return xml.toString('utf-8');

    if (xml instanceof Uint8Array)
        return Buffer.from(xml).toString('utf-8');

    if (typeof xml === 'string')
        return xml;

    throw new Error('El contenido XML no es válido.');
}

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
