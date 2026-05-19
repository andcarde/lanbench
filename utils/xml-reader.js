'use strict';

/**
 * @file Lector y parser del benchmark XML WebNLG.
 *
 * Expone `readDataset` (path -> {@link DatasetDTO}) y `parseDatasetImport`
 * (Buffer -> filas normalizadas listas para persistir). Acepta paths
 * temporales `legacy` resolviendo `resolveExistingTempFilePath`.
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
 * Lee un dataset XML desde el sistema de ficheros y lo parsea a DatasetDTO.
 * @param {*} filename - Ruta absoluta o nombre del fichero en el temporal.
 * @returns {*} DatasetDTO con las entries parseadas.
 */
function readDataset(filename) {
    const filePath = resolveInputFilePath(filename);
    const xml = readFileSync(filePath, 'utf-8');
    return parseDatasetXml(xml, filePath);
}

/**
 * Parsea un contenido XML benchmark y lo convierte en DatasetDTO.
 * @param {*} xml - Contenido XML (string o buffer).
 * @param {string} [sourceName] - Nombre legible para los mensajes de error.
 * @returns {*} DatasetDTO con las entries parseadas.
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
 * Parsea XML benchmark a una estructura intermedia lista para persistir.
 * @param {*} xml - Contenido XML.
 * @param {string} [sourceName] - Nombre legible para los mensajes de error.
 * @returns {{entries:Array<*>, languages:Array<string>}} Datos normalizados.
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
 * Parsea XML benchmark a una lista de annotation entries listas para la UI.
 * @param {*} xml - Contenido XML.
 * @returns {Array<*>} Entries con triples y oraciones en ingles.
 */
function parseAnnotationEntries(xml) {
    const datasetImport = parseDatasetImport(xml);
    return datasetImport.entries.map(mapImportEntryToAnnotationEntry);
}

/**
 * Adapta una entry cruda parseada por fast-xml-parser al registro intermedio.
 * @param {*} rawEntry - Nodo `<entry>` parseado.
 * @param {*} position - Indice ordinal dentro del dataset.
 * @returns {*} Registro de importacion normalizado.
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
 * Parsea los triplesets de una entry (originales o modificados).
 * @param {*} rawTriplesets - Coleccion de triplesets parseada.
 * @param {*} tripleKey - Clave del triple ("otriple" | "mtriple").
 * @returns {Array<*>} Triplesets normalizados con triples no nulos.
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
 * Parsea las lexicalizaciones `<lex>` de una entry.
 * @param {*} rawLexes - Coleccion parseada.
 * @returns {Array<*>} Lexes normalizadas con `lid`, `lang`, `comment` y `text`.
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
 * Parsea una coleccion de enlaces (DBpedia o internos) en triples normalizados.
 * @param {*} rawLinks - Coleccion parseada.
 * @returns {Array<*>} Enlaces normalizados (sin nulos).
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
 * Adapta una entry intermedia al formato consumido por la UI de anotacion.
 * @param {*} entry - Entry intermedia ya parseada.
 * @returns {*} Annotation entry con triples y oraciones en ingles.
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
 * Aplana una coleccion de triplesets en una lista plana de triples.
 * @param {*} triplesets - Coleccion intermedia.
 * @returns {Array<*>} Triples planos.
 */
function flattenTriplesets(triplesets) {
    return toArray(triplesets).flatMap((/** @type {*} */ tripleset) => toArray(tripleset?.triples).map((/** @type {*} */ triple) => ({
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object
    })));
}

/**
 * Recolecta el conjunto unico de codigos de idioma presentes en las entries.
 * @param {*} entries - Lista intermedia de entries con sus lexes.
 * @returns {Array<string>} Codigos de idioma sin repeticiones.
 */
function collectLanguages(entries) {
    return [...new Set(
        entries.flatMap((/** @type {*} */ entry) => entry.lexes.map((/** @type {*} */ lex) => lex.lang).filter(Boolean))
    )];
}

/**
 * Extrae las entries crudas de un benchmark parseado.
 * @param {*} xml - Contenido XML.
 * @returns {Array<*>} Nodos `<entry>` parseados.
 */
function getRawEntries(xml) {
    const parsed = parser.parse(toXmlString(xml));
    return toArray(parsed?.benchmark?.entries?.entry);
}

/**
 * Coacciona contenido XML (Buffer, Uint8Array o string) a una cadena UTF-8.
 * @param {*} xml - Contenido bruto.
 * @returns {string} XML como string.
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
 * Resuelve la ruta absoluta del fichero XML aceptando ruta absoluta o nombre en temporal.
 * @param {*} filename - Ruta o nombre del fichero.
 * @returns {string} Ruta absoluta a leer.
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
