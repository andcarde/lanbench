'use strict';

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

function toArray(value) {
    if (value == null)
        return [];

    return Array.isArray(value) ? value : [value];
}

function nodeText(node) {
    if (typeof node === 'string')
        return node;

    if (node && typeof node === 'object')
        return node['#text'] ?? '';

    return String(node ?? '');
}

function parsePipeTriple(value) {
    const normalized = nodeText(value).trim();
    if (!normalized)
        return null;

    const parts = normalized.includes(' | ')
        ? normalized.split(' | ')
        : normalized.split('|').map(part => part.trim());

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

module.exports = {
    ALWAYS_ARRAY_TAGS,
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple
};
