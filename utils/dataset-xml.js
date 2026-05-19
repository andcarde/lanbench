'use strict';

/**
 * @file Serializador XML del benchmark WebNLG.
 *
 * Genera la representacion textual `<benchmark>...</benchmark>` a partir
 * del grafo de entries (con sus triplesets, lexes y links). Mantener este
 * serializador escrito a mano evita la dependencia de librerias XML
 * pesadas y conserva el formato exacto que esperan los datasets de prueba.
 */

const { toArray, escapeAttr } = require('./xml-format');

/**
 * Construye el XML completo del benchmark a partir de las entries dadas.
 *
 * @param {Array<Record<string, any>>|Record<string, any>} entries
 * @returns {string}
 */
function buildDatasetXml(entries) {
    const lines = ['<?xml version="1.0" ?>', '<benchmark>', '  <entries>'];

    for (const entry of toArray(entries)) {
        lines.push(
            renderEntryOpenTag(entry),
            ...renderTriplesets('originaltripleset', 'otriple', entry.originalTriplesets),
            ...renderTriplesets('modifiedtripleset', 'mtriple', entry.modifiedTriplesets),
            ...renderLexes(entry.lexes),
            ...renderLinksGroup('dbpedialinks', 'dbpedialink', entry.dbpediaLinks),
            ...renderLinksGroup('links', 'link', entry.links),
            '    </entry>'
        );
    }

    lines.push('  </entries>', '</benchmark>');
    return lines.join('\n');
}

/**
 * Construye la etiqueta de apertura de un `<entry>` con sus atributos.
 * @param {*} entry - Entry con category, eid, size y shape opcionales.
 * @returns {string} Linea XML con la etiqueta de apertura.
 */
function renderEntryOpenTag(entry) {
    const parts = [
        `category="${escapeAttr(entry.category)}"`,
        `eid="${entry.eid}"`
    ];

    if (entry.shape != null)
        parts.push(`shape="${escapeAttr(entry.shape)}"`);

    if (entry.shapeType != null)
        parts.push(`shape_type="${escapeAttr(entry.shapeType)}"`);

    parts.push(`size="${entry.size}"`);

    return `    <entry ${parts.join(' ')}>`;
}

/**
 * Serializa una coleccion de triplesets (originales o modificados) en XML.
 * @param {*} containerTag - Etiqueta envoltorio (p.ej. "originaltripleset").
 * @param {*} tripleTag - Etiqueta para cada triple (p.ej. "otriple").
 * @param {*} triplesets - Lista o tripleset unico a serializar.
 * @returns {Array<string>} Lineas XML.
 */
function renderTriplesets(containerTag, tripleTag, triplesets) {
    /** @type {any[]} */
    const lines = [];

    for (const tripleset of toArray(triplesets)) {
        lines.push(`      <${containerTag}>`);
        for (const triple of toArray(tripleset?.triples)) {
            lines.push(
                `        <${tripleTag}>${triple.subject} | ${triple.predicate} | ${triple.object}</${tripleTag}>`
            );
        }
        lines.push(`      </${containerTag}>`);
    }

    return lines;
}

/**
 * Serializa las lexicalizaciones (`<lex>`) de una entry.
 * @param {*} lexes - Lista o lex unico a serializar.
 * @returns {Array<string>} Lineas XML.
 */
function renderLexes(lexes) {
    return toArray(lexes).map((/** @type {*} */ lex) => {
        const attributes = [
            `lid="${escapeAttr(lex.lid)}"`,
            `lang="${escapeAttr(lex.lang)}"`
        ];

        if (lex.comment !== null && lex.comment !== undefined)
            attributes.push(`comment="${escapeAttr(lex.comment)}"`);

        return `      <lex ${attributes.join(' ')}>${lex.text}</lex>`;
    });
}

/**
 * Serializa un grupo de enlaces (DBpedia o internos) usando las etiquetas dadas.
 * @param {*} groupTag - Etiqueta envoltorio (p.ej. "links").
 * @param {*} itemTag - Etiqueta para cada enlace (p.ej. "link").
 * @param {*} links - Lista o link unico a serializar.
 * @returns {Array<string>} Lineas XML (vacio si no hay enlaces).
 */
function renderLinksGroup(groupTag, itemTag, links) {
    const normalizedLinks = toArray(links);
    if (normalizedLinks.length === 0)
        return [];

    const lines = [`      <${groupTag}>`];

    for (const link of normalizedLinks) {
        lines.push(
            `        <${itemTag} direction="${escapeAttr(link.direction)}">${link.subject} | ${link.predicate} | ${link.object}</${itemTag}>`
        );
    }

    lines.push(`      </${groupTag}>`);
    return lines;
}

module.exports = {
    buildDatasetXml
};
