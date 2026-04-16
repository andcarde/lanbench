/**
 * xml-utils.js
 * Parsea tmp/<userId>.xml (formato WebNLG 2) y persiste via DAOs.
 *
 * Dependencia:  npm install fast-xml-parser
 * DAOs esperados (ESM): ./daos/EntryDAO.js, TriplesetDAO.js,
 *                       TripleDAO.js, LexDAO.js,
 *                       DBpediaLinkDAO.js, LinkDAO.js
 *
 * Cada DAO debe exportar un método estático async save(dto) que devuelve
 * el id generado (necesario para encadenar triplesets → triples).
 */
 
import { readFileSync }   from 'node:fs';
import { join }           from 'node:path';
import { XMLParser }      from 'fast-xml-parser';
 
import EntryDAO           from './daos/EntryDAO.js';
import TriplesetDAO       from './daos/TriplesetDAO.js';
import TripleDAO          from './daos/TripleDAO.js';
import LexDAO             from './daos/LexDAO.js';
import DBpediaLinkDAO     from './daos/DBpediaLinkDAO.js';
import LinkDAO            from './daos/LinkDAO.js';
 
// ─── DTOs ────────────────────────────────────────────────────────────────────
 
export class EntryDTO {
  /**
   * @param {object} p
   * @param {number}  p.eid
   * @param {string}  p.category
   * @param {string|null} p.shape
   * @param {string|null} p.shapeType
   * @param {number}  p.size
   */
  constructor({ eid, category, shape, shapeType, size }) {
    this.eid       = eid;
    this.category  = category;
    this.shape     = shape     ?? null;
    this.shapeType = shapeType ?? null;
    this.size      = size;
  }
}
 
export class TriplesetDTO {
  /**
   * @param {object} p
   * @param {number}           p.eid
   * @param {'original'|'modified'} p.type
   */
  constructor({ eid, type }) {
    this.eid  = eid;
    this.type = type;
  }
}
 
export class TripleDTO {
  /**
   * @param {object} p
   * @param {number} p.triplesetId  — FK al tripleset padre
   * @param {string} p.subject
   * @param {string} p.predicate
   * @param {string} p.object
   */
  constructor({ triplesetId, subject, predicate, object }) {
    this.triplesetId = triplesetId;
    this.subject     = subject;
    this.predicate   = predicate;
    this.object      = object;
  }
}
 
export class LexDTO {
  /**
   * @param {object} p
   * @param {number} p.eid
   * @param {string} p.lid      — agrupa traducciones ("Id1", "Id2" …)
   * @param {string} p.lang     — código ISO ("en", "ru" …)
   * @param {string|null} p.comment
   * @param {string} p.text
   */
  constructor({ eid, lid, lang, comment, text }) {
    this.eid     = eid;
    this.lid     = lid;
    this.lang    = lang;
    this.comment = (comment !== '' && comment != null) ? comment : null;
    this.text    = text;
  }
}
 
export class DBpediaLinkDTO {
  /**
   * @param {object} p
   * @param {number} p.eid
   * @param {string} p.direction  — e.g. "en2ru"
   * @param {string} p.subject
   * @param {string} p.predicate
   * @param {string} p.object
   */
  constructor({ eid, direction, subject, predicate, object }) {
    this.eid       = eid;
    this.direction = direction;
    this.subject   = subject;
    this.predicate = predicate;
    this.object    = object;
  }
}
 
export class LinkDTO {
  /**
   * @param {object} p
   * @param {number} p.eid
   * @param {string} p.direction
   * @param {string} p.subject
   * @param {string} p.predicate
   * @param {string} p.object
   */
  constructor({ eid, direction, subject, predicate, object }) {
    this.eid       = eid;
    this.direction = direction;
    this.subject   = subject;
    this.predicate = predicate;
    this.object    = object;
  }
}
 
// ─── Configuración del parser ─────────────────────────────────────────────────
 
/**
 * Tags que siempre se tratan como array, aunque sólo aparezca una vez.
 * Evita tener que hacer Array.isArray() manualmente en cada acceso.
 */
const ALWAYS_ARRAY = new Set([
  'entry',
  'originaltripleset',
  'modifiedtripleset',
  'otriple',
  'mtriple',
  'lex',
  'dbpedialink',
  'link',
]);
 
const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  textNodeName:        '#text',
  isArray:             (tagName) => ALWAYS_ARRAY.has(tagName),
});
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
/**
 * Divide un raw triple "A | B | C" en sus tres partes.
 * @param {string} raw
 * @returns {{ subject: string, predicate: string, object: string }}
 */
function parseTriple(raw) {
  const [subject, predicate, object] = raw.split('|').map((s) => s.trim());
  if (!subject || !predicate || !object) {
    throw new Error(`Triple malformado: "${raw}"`);
  }
  return { subject, predicate, object };
}
 
/**
 * Normaliza el contenido de un nodo que puede venir como string puro
 * (sin atributos) o como objeto { '#text': '…', '@_attr': '…' }.
 * @param {string|object} node
 * @returns {string}
 */
function nodeText(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null) return node['#text'] ?? '';
  return String(node);
}
 
/**
 * Garantiza un array aunque el valor sea undefined/null.
 * @template T
 * @param {T|T[]|undefined|null} value
 * @returns {T[]}
 */
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
 
// ─── Procesado de cada sección ────────────────────────────────────────────────
 
/**
 * Persiste los triplesets (original o modified) de una entry y sus triples.
 * @param {number} eid
 * @param {object[]} rawTriplesets   — ya normalizado a array
 * @param {'original'|'modified'} type
 * @param {string} tripleKey         — "otriple" | "mtriple"
 */
async function processTriplesets(eid, rawTriplesets, type, tripleKey) {
  for (const rawTripleset of rawTriplesets) {
    const triplesetDTO = new TriplesetDTO({ eid, type });
    const triplesetId  = await TriplesetDAO.save(triplesetDTO);
 
    const rawTriples = toArray(rawTripleset[tripleKey]);
    for (const rawTriple of rawTriples) {
      const { subject, predicate, object } = parseTriple(nodeText(rawTriple));
      const tripleDTO = new TripleDTO({ triplesetId, subject, predicate, object });
      await TripleDAO.save(tripleDTO);
    }
  }
}
 
/**
 * Persiste las lexicalizaciones de una entry.
 * @param {number} eid
 * @param {object[]} rawLexList
 */
async function processLex(eid, rawLexList) {
  for (const rawLex of rawLexList) {
    const lexDTO = new LexDTO({
      eid,
      lid:     rawLex['@_lid'],
      lang:    rawLex['@_lang'],
      comment: rawLex['@_comment'],
      text:    nodeText(rawLex),
    });
    await LexDAO.save(lexDTO);
  }
}
 
/**
 * Persiste los dbpedialinks de una entry.
 * @param {number} eid
 * @param {object[]} rawLinks
 */
async function processDBpediaLinks(eid, rawLinks) {
  for (const rawLink of rawLinks) {
    const { subject, predicate, object } = parseTriple(nodeText(rawLink));
    const dto = new DBpediaLinkDTO({
      eid,
      direction: rawLink['@_direction'],
      subject,
      predicate,
      object,
    });
    await DBpediaLinkDAO.save(dto);
  }
}
 
/**
 * Persiste los links libres de una entry.
 * @param {number} eid
 * @param {object[]} rawLinks
 */
async function processLinks(eid, rawLinks) {
  for (const rawLink of rawLinks) {
    const { subject, predicate, object } = parseTriple(nodeText(rawLink));
    const dto = new LinkDTO({
      eid,
      direction: rawLink['@_direction'],
      subject,
      predicate,
      object,
    });
    await LinkDAO.save(dto);
  }
}
 
// ─── Función principal exportada ──────────────────────────────────────────────
 
/**
 * Lee tmp/<userId>.xml, parsea el benchmark WebNLG 2 y persiste
 * todas las entidades a través de los DAOs correspondientes.
 *
 * @param {string|number} userId
 * @returns {Promise<{ processed: number, errors: Array<{ eid: number, error: Error }> }>}
 */
export async function processBenchmark(userId) {
  const filePath = join('tmp', `${userId}.xml`);
  const xml      = readFileSync(filePath, 'utf-8');
  const parsed   = parser.parse(xml);
 
  const entries = toArray(parsed?.benchmark?.entries?.entry);
 
  if (entries.length === 0) {
    throw new Error(`No se encontraron entries en ${filePath}`);
  }
 
  const errors    = [];
  let   processed = 0;
 
  for (const rawEntry of entries) {
    const eid = Number(rawEntry['@_eid']);
 
    try {
      // 1. Entry
      const entryDTO = new EntryDTO({
        eid,
        category:  rawEntry['@_category'],
        shape:     rawEntry['@_shape'],
        shapeType: rawEntry['@_shape_type'],
        size:      Number(rawEntry['@_size']),
      });
      await EntryDAO.save(entryDTO);
 
      // 2. Triplesets originales y modificados
      await processTriplesets(
        eid,
        toArray(rawEntry.originaltripleset),
        'original',
        'otriple',
      );
      await processTriplesets(
        eid,
        toArray(rawEntry.modifiedtripleset),
        'modified',
        'mtriple',
      );
 
      // 3. Lexicalizaciones
      await processLex(eid, toArray(rawEntry.lex));
 
      // 4. DBpedia links
      await processDBpediaLinks(
        eid,
        toArray(rawEntry.dbpedialinks?.dbpedialink),
      );
 
      // 5. Links libres
      await processLinks(
        eid,
        toArray(rawEntry.links?.link),
      );
 
      processed++;
    } catch (error) {
      // Continúa con las demás entries y reporta al final
      errors.push({ eid, error });
    }
  }
 
  return { processed, errors };
}