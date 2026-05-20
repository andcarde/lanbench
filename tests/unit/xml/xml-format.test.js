'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    ALWAYS_ARRAY_TAGS,
    createBenchmarkXmlParser,
    toArray,
    nodeText,
    parsePipeTriple,
    renderAttrs
} = require('../../../utils/xml-format');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('xml-format shared helpers', () => {
    it('expone la lista canónica de tags XML que siempre deben tratarse como array', () => {
        assert.deepEqual(ALWAYS_ARRAY_TAGS, [
            'entry',
            'originaltripleset',
            'modifiedtripleset',
            'otriple',
            'mtriple',
            'lex',
            'dbpedialink',
            'link'
        ]);
    });

    it('crea un parser que normaliza tags singleton como arrays', () => {
        const parser = createBenchmarkXmlParser();
        const parsed = parser.parse([
            '<benchmark>',
            '  <entries>',
            '    <entry eid="1" category="Airport" size="1">',
            '      <lex lid="Id1" lang="en">Airport sentence</lex>',
            '      <originaltripleset>',
            '        <otriple>A | B | C</otriple>',
            '      </originaltripleset>',
            '    </entry>',
            '  </entries>',
            '</benchmark>'
        ].join(''));

        assert.ok(Array.isArray(parsed.benchmark.entries.entry));
        assert.ok(Array.isArray(parsed.benchmark.entries.entry[0].lex));
        assert.ok(Array.isArray(parsed.benchmark.entries.entry[0].originaltripleset));
        assert.ok(Array.isArray(parsed.benchmark.entries.entry[0].originaltripleset[0].otriple));
    });

    it('normaliza valores opcionales a array', () => {
        assert.deepEqual(toArray(null), []);
        assert.deepEqual(toArray(undefined), []);
        assert.deepEqual(toArray('x'), ['x']);
        assert.deepEqual(toArray(['x', 'y']), ['x', 'y']);
    });

    it('extrae texto desde strings y nodos parseados', () => {
        assert.equal(nodeText('plain'), 'plain');
        assert.equal(nodeText({ '#text': 'from-node', '@_lang': 'en' }), 'from-node');
        assert.equal(nodeText(42), '42');
    });

    it('renderAttrs formatea pares atributo/valor escapando todos los reservados XML', () => {
        assert.equal(renderAttrs({ a: '1', b: '2' }), ' a="1" b="2"');
        assert.equal(renderAttrs({}), '');
        assert.equal(renderAttrs(null), '');
        assert.equal(renderAttrs({ a: '1', b: null, c: undefined, d: 'x' }), ' a="1" d="x"');
        assert.equal(renderAttrs({ q: 'a"b' }), ' q="a&quot;b"');
        assert.equal(renderAttrs({ q: 'a&b<c>d' }), ' q="a&amp;b&lt;c&gt;d"');
        assert.equal(renderAttrs({ size: 42 }), ' size="42"');
    });

    it('parsea triples separados por pipes conservando pipes adicionales en el objeto', () => {
        assert.deepEqual(parsePipeTriple('A | B | C'), {
            subject: 'A',
            predicate: 'B',
            object: 'C'
        });
        assert.deepEqual(parsePipeTriple('A|B|C|D'), {
            subject: 'A',
            predicate: 'B',
            object: 'C | D'
        });
        assert.deepEqual(parsePipeTriple({ '#text': 'X | Y | Z' }), {
            subject: 'X',
            predicate: 'Y',
            object: 'Z'
        });
        assert.equal(parsePipeTriple('malformed'), null);
    });

});
