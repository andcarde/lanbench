'use strict';

/**
 * @file XML parsing/escaping helpers.
 *
 * Exposes the shared `fast-xml-parser` configuration (tags that should always
 * be treated as arrays) and low-level utilities: `escapeXml`, `renderAttrs`,
 * `toArray` and `nodeText`.
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

/**
 * Creates a `fast-xml-parser` instance configured for the WebNLG benchmark.
 * @param {Record<string, *>} [overrides] - Options that override the defaults.
 * @returns {XMLParser} Configured parser.
 */
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
 * Returns `value` as an array: wraps it, leaves it as-is, or returns [] for nulls.
 * @param {*} value - Value to normalize.
 * @returns {Array<*>} Equivalent array.
 */
function toArray(value) {
    if (value == null)
        return [];

    return Array.isArray(value) ? value : [value];
}

/**
 * Extracts the text from a node parsed by fast-xml-parser.
 * @param {*} node - String node or object with `#text`.
 * @returns {string} Node text, or empty string.
 */
function nodeText(node) {
    if (typeof node === 'string')
        return node;

    if (node && typeof node === 'object')
        return node['#text'] ?? '';

    return String(node ?? '');
}

/**
 * Parses a node in "subject | predicate | object" format into a normalized triple.
 * @param {*} value - XML node or text to parse.
 * @returns {?{subject:string, predicate:string, object:string}} Parsed triple, or null if invalid.
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
 * Escapes a value for use as XML content or attribute.
 * Replaces the five reserved characters (&, <, >, ", ') with their entities.
 * @param {*} value - Value to escape.
 * @returns {string} Text safe to emit.
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
 * Builds the attribute list of an XML tag from an object. Returns the string
 * with a leading space (` k1="v1" k2="v2"`) so it can be concatenated directly
 * between the tag name and the closing `>`. `null` or `undefined` values are
 * omitted, which covers the conditional pattern used by the current
 * serializers (optional attributes like `shape`).
 *
 * @param {Record<string, *>} attrs - Attribute/value pairs.
 * @returns {string} Formatted attributes, ready to insert into a tag.
 */
function renderAttrs(attrs) {
    if (!attrs)
        return '';

    let result = '';
    for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined)
            continue;
        result += ` ${key}="${escapeXml(value)}"`;
    }
    return result;
}

module.exports = {
    ALWAYS_ARRAY_TAGS,
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple,
    escapeXml,
    renderAttrs
};
