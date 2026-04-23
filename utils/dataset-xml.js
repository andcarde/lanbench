'use strict';

const { toArray } = require('./xml-format');

function buildDatasetXml(entries) {
    const lines = ['<?xml version="1.0" ?>', '<benchmark>', '  <entries>'];

    for (const entry of toArray(entries)) {
        lines.push(renderEntryOpenTag(entry));
        lines.push(...renderTriplesets('originaltripleset', 'otriple', entry.originalTriplesets));
        lines.push(...renderTriplesets('modifiedtripleset', 'mtriple', entry.modifiedTriplesets));
        lines.push(...renderLexes(entry.lexes));
        lines.push(...renderLinksGroup('dbpedialinks', 'dbpedialink', entry.dbpediaLinks, true));
        lines.push(...renderLinksGroup('links', 'link', entry.links, false));
        lines.push('    </entry>');
    }

    lines.push('  </entries>', '</benchmark>');
    return lines.join('\n');
}

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

function renderTriplesets(containerTag, tripleTag, triplesets) {
    const lines = [];

    for (const tripleset of toArray(triplesets)) {
        lines.push(`      <${containerTag}>`);
        for (const triple of toArray(tripleset && tripleset.triples)) {
            lines.push(
                `        <${tripleTag}>${triple.subject} | ${triple.predicate} | ${triple.object}</${tripleTag}>`
            );
        }
        lines.push(`      </${containerTag}>`);
    }

    return lines;
}

function renderLexes(lexes) {
    return toArray(lexes).map(lex => {
        const attributes = [
            `lid="${escapeAttr(lex.lid)}"`,
            `lang="${escapeAttr(lex.lang)}"`
        ];

        if (lex.comment !== null && lex.comment !== undefined)
            attributes.push(`comment="${escapeAttr(lex.comment)}"`);

        return `      <lex ${attributes.join(' ')}>${lex.text}</lex>`;
    });
}

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

function escapeAttr(value) {
    return String(value).replace(/"/g, '&quot;');
}

module.exports = {
    buildDatasetXml
};
