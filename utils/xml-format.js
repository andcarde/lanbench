'use strict';

/**
 * @file Helpers de parsing/escapado XML.
 *
 * Expone la configuracion compartida de `fast-xml-parser` (etiquetas que
 * siempre deben tratarse como arrays) y utilidades de bajo nivel:
 * `escapeXml`, `escapeAttr`, `toArray` y `splitWhitespace`.
 */

const { XMLParser } = require('fast-xml-parser');

const ALWAYS_ARRAY_TAGS = Object.freeze([
    'entry',
    'originaltripleset',
    'modifiedtripleset',
    'otriple',
    'mtriple',
    'lex',
    'dbpedialink',
    'link'
]);

const ALWAYS_ARRAY_LOOKUP = new Set(ALWAYS_ARRAY_TAGS);

function createBenchmarkXmlParser(overrides = {}) {
    return new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        processEntities: false,
        isArray: tagName => ALWAYS_ARRAY_LOOKUP.has(tagName),
        ...overrides
    });
}

/**
 * Devuelve `value` como array: lo envuelve, lo deja igual o devuelve [] para nulos.
 * @param {*} value - Valor a normalizar.
 * @returns {Array<*>} Array equivalente.
 */
function toArray(value) {
    if (value == null)
        return [];

    return Array.isArray(value) ? value : [value];
}

/**
 * Extrae el texto de un nodo parseado por fast-xml-parser.
 * @param {*} node - Nodo string u objeto con `#text`.
 * @returns {string} Texto del nodo o cadena vacia.
 */
function nodeText(node) {
    if (typeof node === 'string')
        return node;

    if (node && typeof node === 'object')
        return node['#text'] ?? '';

    return String(node ?? '');
}

/**
 * Parsea un nodo en formato "subject | predicate | object" a un triple normalizado.
 * @param {*} value - Nodo XML o texto a parsear.
 * @returns {?{subject:string, predicate:string, object:string}} Triple parseado o null si no es valido.
 */
function parsePipeTriple(value) {
    const normalized = nodeText(value).trim();
    if (!normalized)
        return null;

    const parts = normalized.includes(' | ')
        ? normalized.split(' | ')
        : normalized.split('|').map((/** @type {*} */ part) => part.trim());

    if (parts.length < 3)
        return null;

    const [subject, predicate, ...objectParts] = parts;
    const normalizedSubject = subject.trim();
    const normalizedPredicate = predicate.trim();
    const normalizedObject = objectParts.join(' | ').trim();

    if (!normalizedSubject || !normalizedPredicate || !normalizedObject)
        return null;

    return {
        subject: normalizedSubject,
        predicate: normalizedPredicate,
        object: normalizedObject
    };
}

/**
 * Escapa un valor para usarlo como contenido o atributo XML.
 * Sustituye los cinco caracteres reservados (&, <, >, ", ') por sus entidades.
 * @param {*} value - Valor a escapar.
 * @returns {string} Texto seguro para emitir.
 */
function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

/**
 * Escapa un valor para usarlo dentro de comillas dobles en un atributo XML.
 * Más conservador que `escapeXml`: solo sustituye comillas dobles.
 * @param {*} value - Valor a escapar.
 * @returns {string} Texto seguro para atributos.
 */
function escapeAttr(value) {
    return String(value ?? '').replaceAll('"', '&quot;');
}

module.exports = {
    ALWAYS_ARRAY_TAGS,
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple,
    escapeXml,
    escapeAttr
};
