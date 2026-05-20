'use strict';

/**
 * Unit tests for `buildAnnotatedDatasetXml` — the dataset XML builder
 * extension that adds Spanish `<lex>` entries from persisted annotations
 * (US-30). Covers the paired/free pairing rule documented in
 * `documentation/TECHNICAL-DESIGN.md` section 8.5.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { buildAnnotatedDatasetXml } = require('../../../utils/dataset-xml');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('buildAnnotatedDatasetXml', () => {
    it('inserta un Spanish lex emparejado con el lid del english lex al mismo sentenceIndex', () => {
        const xml = buildAnnotatedDatasetXml([{
            eid: 1,
            category: 'Place',
            shape: null,
            shapeType: null,
            size: 1,
            originalTriplesets: [{ triples: [{ subject: 'Madrid', predicate: 'isPartOf', object: 'Spain' }] }],
            modifiedTriplesets: [],
            lexes: [
                { lid: 'Id1', lang: 'en', comment: '', text: 'Madrid is in Spain.' },
                { lid: 'Id1', lang: 'ru', comment: '', text: 'Мадрид в Испании.' }
            ],
            dbpediaLinks: [],
            links: [],
            annotations: [
                { sentenceIndex: 0, sentence: 'Madrid está en España.' }
            ]
        }]);

        assert.match(xml, /<lex lid="Id1" lang="en"[^>]*>Madrid is in Spain\.<\/lex>/);
        assert.match(xml, /<lex lid="Id1" lang="ru"[^>]*>Мадрид в Испании\.<\/lex>/);
        assert.match(xml, /<lex lid="Id1" lang="es"[^>]*>Madrid está en España\.<\/lex>/);

        // The matched Spanish lex goes immediately after the last lex of the same lid.
        const lexes = [...xml.matchAll(/<lex\b[^>]*>[^<]*<\/lex>/g)].map(m => m[0]);
        assert.equal(lexes.length, 3);
        assert.match(lexes[2], /lang="es"/);
    });

    it('respeta el orden por sentenceIndex y empareja cada Spanish lex con el lid del english correspondiente', () => {
        const xml = buildAnnotatedDatasetXml([{
            eid: 1,
            category: 'Place',
            shape: null,
            shapeType: null,
            size: 1,
            originalTriplesets: [],
            modifiedTriplesets: [],
            lexes: [
                { lid: 'Id1', lang: 'en', comment: '', text: 'EN 1' },
                { lid: 'Id1', lang: 'ru', comment: '', text: 'RU 1' },
                { lid: 'Id2', lang: 'en', comment: '', text: 'EN 2' },
                { lid: 'Id2', lang: 'ru', comment: '', text: 'RU 2' }
            ],
            dbpediaLinks: [],
            links: [],
            annotations: [
                { sentenceIndex: 1, sentence: 'ES 2' },
                { sentenceIndex: 0, sentence: 'ES 1' }
            ]
        }]);

        const lexLines = [...xml.matchAll(/<lex\b[^>]*>[^<]*<\/lex>/g)].map(m => m[0]);
        assert.equal(lexLines.length, 6);
        // Id1 group first
        assert.match(lexLines[0], /lid="Id1" lang="en"/);
        assert.match(lexLines[1], /lid="Id1" lang="ru"/);
        assert.match(lexLines[2], /lid="Id1" lang="es"[^>]*>ES 1</);
        // Id2 group next
        assert.match(lexLines[3], /lid="Id2" lang="en"/);
        assert.match(lexLines[4], /lid="Id2" lang="ru"/);
        assert.match(lexLines[5], /lid="Id2" lang="es"[^>]*>ES 2</);
    });

    it('marca como free las annotations sin english lex emparejable y usa lid="id<sentenceIndex+1>"', () => {
        const xml = buildAnnotatedDatasetXml([{
            eid: 1,
            category: 'Place',
            shape: null,
            shapeType: null,
            size: 1,
            originalTriplesets: [],
            modifiedTriplesets: [],
            lexes: [
                { lid: 'Id1', lang: 'en', comment: '', text: 'EN 1' }
            ],
            dbpediaLinks: [],
            links: [],
            annotations: [
                { sentenceIndex: 0, sentence: 'Paired ES.' },
                { sentenceIndex: 1, sentence: 'Free ES 2.' },
                { sentenceIndex: 3, sentence: 'Free ES 4.' }
            ]
        }]);

        // Paired
        assert.match(xml, /<lex lid="Id1" lang="es"[^>]*>Paired ES\.<\/lex>/);
        // Free entries use lowercase id<sentenceIndex+1>
        assert.match(xml, /<lex lid="id2" lang="es"[^>]*>Free ES 2\.<\/lex>/);
        assert.match(xml, /<lex lid="id4" lang="es"[^>]*>Free ES 4\.<\/lex>/);

        const lexLines = [...xml.matchAll(/<lex\b[^>]*>[^<]*<\/lex>/g)].map(m => m[0]);
        assert.equal(lexLines.length, 4);
        // Paired Spanish lex goes right after the Id1 english lex.
        assert.match(lexLines[0], /lid="Id1" lang="en"/);
        assert.match(lexLines[1], /lid="Id1" lang="es"/);
        // Free entries are appended at the end of the lex group.
        assert.match(lexLines[2], /lid="id2"/);
        assert.match(lexLines[3], /lid="id4"/);
    });

    it('no añade lex extra si la entry no tiene annotations', () => {
        const entry = {
            eid: 1,
            category: 'Place',
            shape: null,
            shapeType: null,
            size: 1,
            originalTriplesets: [],
            modifiedTriplesets: [],
            lexes: [
                { lid: 'Id1', lang: 'en', comment: '', text: 'EN 1' }
            ],
            dbpediaLinks: [],
            links: []
        };

        const xmlWithoutAnnotations = buildAnnotatedDatasetXml([{ ...entry, annotations: [] }]);
        const xmlWithoutAnnotationsField = buildAnnotatedDatasetXml([entry]);
        const lexCountWithout = [...xmlWithoutAnnotations.matchAll(/<lex\b/g)].length;
        const lexCountWithoutField = [...xmlWithoutAnnotationsField.matchAll(/<lex\b/g)].length;

        assert.equal(lexCountWithout, 1);
        assert.equal(lexCountWithoutField, 1);
    });

    it('preserva el resto de la estructura XML (triplesets y links)', () => {
        const xml = buildAnnotatedDatasetXml([{
            eid: 1,
            category: 'Place',
            shape: null,
            shapeType: null,
            size: 1,
            originalTriplesets: [{ triples: [{ subject: 'Madrid', predicate: 'isPartOf', object: 'Spain' }] }],
            modifiedTriplesets: [{ triples: [{ subject: 'Madrid', predicate: 'capital', object: 'Spain' }] }],
            lexes: [
                { lid: 'Id1', lang: 'en', comment: '', text: 'EN 1' }
            ],
            dbpediaLinks: [
                { direction: 'en2es', subject: 'Madrid', predicate: 'sameAs', object: 'Madrid_(España)' }
            ],
            links: [],
            annotations: [
                { sentenceIndex: 0, sentence: 'ES 1' }
            ]
        }]);

        assert.match(xml, /<otriple>Madrid \| isPartOf \| Spain<\/otriple>/);
        assert.match(xml, /<mtriple>Madrid \| capital \| Spain<\/mtriple>/);
        assert.match(xml, /<dbpedialink direction="en2es">Madrid \| sameAs \| Madrid_\(España\)<\/dbpedialink>/);
        assert.match(xml, /<benchmark>[\s\S]*<\/benchmark>/);
    });
});
