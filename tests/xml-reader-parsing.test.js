'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    parseDatasetXml,
    parseDatasetImport,
    parseAnnotationEntries,
    DatasetDTO,
    EntryDTO
} = require('../utils/xml-reader');
const { writeDataset } = require('../utils/xml-writer');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('xml-reader parsing with shared xml-format helpers', () => {
    it('parseDatasetXml acepta XML inline y devuelve DTOs del dominio', () => {
        const dataset = parseDatasetXml([
            '<benchmark>',
            '  <entries>',
            '    <entry eid="1" category="Airport" shape="(X)" shape_type="NA" size="1">',
            '      <lex lid="Id1" lang="en">Airport sentence</lex>',
            '    </entry>',
            '  </entries>',
            '</benchmark>'
        ].join(''), 'inline.xml');

        assert.ok(dataset instanceof DatasetDTO);
        assert.equal(dataset.entries.length, 1);
        assert.ok(dataset.entries[0] instanceof EntryDTO);
        assert.equal(dataset.entries[0].eid, 1);
        assert.equal(dataset.entries[0].category, 'Airport');
        assert.equal(dataset.entries[0].shape, '(X)');
        assert.equal(dataset.entries[0].shapeType, 'NA');
        assert.equal(dataset.entries[0].size, 1);
    });

    it('parseDatasetImport produce un grafo canónico con hijos y orden estable', () => {
        const datasetImport = parseDatasetImport([
            '<benchmark>',
            '  <entries>',
            '    <entry eid="7" category="Building" size="2">',
            '      <originaltripleset>',
            '        <otriple>Airport | locatedIn | Madrid</otriple>',
            '      </originaltripleset>',
            '      <modifiedtripleset>',
            '        <mtriple>Airport|hasCode|MAD|Barajas</mtriple>',
            '      </modifiedtripleset>',
            '      <lex comment="" lid="Id1" lang="en">The airport is in Madrid.</lex>',
            '      <lex comment="nota" lid="Id1" lang="es">El aeropuerto está en Madrid.</lex>',
            '      <dbpedialinks>',
            '        <dbpedialink direction="en2es">Madrid | sameAs | Madrid</dbpedialink>',
            '      </dbpedialinks>',
            '      <links>',
            '        <link direction="en2es">Airport | sameAs | aeropuerto</link>',
            '      </links>',
            '    </entry>',
            '  </entries>',
            '</benchmark>'
        ].join(''));

        assert.equal(datasetImport.entries.length, 1);
        assert.deepEqual(datasetImport.entries[0], {
            position: 0,
            eid: 7,
            category: 'Building',
            shape: null,
            shapeType: null,
            size: 2,
            originalTriplesets: [{
                position: 0,
                triples: [{
                    position: 0,
                    subject: 'Airport',
                    predicate: 'locatedIn',
                    object: 'Madrid'
                }]
            }],
            modifiedTriplesets: [{
                position: 0,
                triples: [{
                    position: 0,
                    subject: 'Airport',
                    predicate: 'hasCode',
                    object: 'MAD | Barajas'
                }]
            }],
            lexes: [{
                position: 0,
                lid: 'Id1',
                lang: 'en',
                comment: '',
                text: 'The airport is in Madrid.'
            }, {
                position: 1,
                lid: 'Id1',
                lang: 'es',
                comment: 'nota',
                text: 'El aeropuerto está en Madrid.'
            }],
            dbpediaLinks: [{
                position: 0,
                direction: 'en2es',
                subject: 'Madrid',
                predicate: 'sameAs',
                object: 'Madrid'
            }],
            links: [{
                position: 0,
                direction: 'en2es',
                subject: 'Airport',
                predicate: 'sameAs',
                object: 'aeropuerto'
            }]
        });
    });

    it('parseAnnotationEntries reutiliza el parser compartido para triples y frases en inglés', () => {
        const entries = parseAnnotationEntries(Buffer.from([
            '<benchmark>',
            '  <entries>',
            '    <entry eid="7" category="Building" size="2">',
            '      <originaltripleset>',
            '        <otriple>Airport | locatedIn | Madrid</otriple>',
            '      </originaltripleset>',
            '      <modifiedtripleset>',
            '        <mtriple>Airport|hasCode|MAD|Barajas</mtriple>',
            '      </modifiedtripleset>',
            '      <lex lid="Id1" lang="en">The airport is in Madrid.</lex>',
            '      <lex lid="Id1" lang="es">El aeropuerto está en Madrid.</lex>',
            '    </entry>',
            '  </entries>',
            '</benchmark>'
        ].join('')));

        assert.deepEqual(entries, [{
            eid: 7,
            category: 'Building',
            shape: null,
            shapeType: null,
            size: 2,
            originalTriples: [{
                subject: 'Airport',
                predicate: 'locatedIn',
                object: 'Madrid'
            }],
            modifiedTriples: [{
                subject: 'Airport',
                predicate: 'hasCode',
                object: 'MAD | Barajas'
            }],
            sourceSentences: ['The airport is in Madrid.']
        }]);
    });

    it('xml-writer sigue exportando la operación de escritura tras la migración al módulo común', () => {
        assert.equal(typeof writeDataset, 'function');
    });
});
