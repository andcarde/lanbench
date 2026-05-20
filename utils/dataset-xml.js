'use strict';

/**
 * @file WebNLG benchmark XML serializer.
 *
 * Generates the textual representation `<benchmark>...</benchmark>` from the
 * entry graph (with its triplesets, lexes and links). Keeping this serializer
 * hand-written avoids a dependency on heavy XML libraries and preserves the
 * exact format the test datasets expect.
 */

const { toArray, renderAttrs } = require('./xml-format');

/**
 * Builds the complete benchmark XML from the given entries.
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
 * Builds the extended benchmark XML, adding, per entry, a `<lex lang="es">`
 * for each persisted `Annotation`. The pairing rule (paired vs free) is
 * documented in `documentation/TECHNICAL-DESIGN.md` (section 8.5).
 *
 * @param {Array<Record<string, any>>|Record<string, any>} entries
 * @returns {string}
 */
function buildAnnotatedDatasetXml(entries) {
    const augmentedEntries = toArray(entries).map(entry => ({
        ...entry,
        lexes: mergeSpanishAnnotationsIntoLexes(toArray(entry.lexes), toArray(entry.annotations))
    }));

    return buildDatasetXml(augmentedEntries);
}

/**
 * Merges the `Annotation`s into an entry's lex list following the pairing
 * rule: paired (lid of the corresponding English lex) or free
 * (`id<sentenceIndex+1>`). Paired Spanish lexes are inserted immediately after
 * the last existing lex with the same lid; free Spanish lexes are appended at
 * the end.
 *
 * @param {Array<Record<string, any>>} lexes - Original lexes.
 * @param {Array<Record<string, any>>} annotations - Annotations to merge.
 * @returns {Array<Record<string, any>>} Lexes with the Spanish entries merged in.
 */
function mergeSpanishAnnotationsIntoLexes(lexes, annotations) {
    if (annotations.length === 0)
        return lexes;

    const englishLexes = lexes.filter(lex => lex && lex.lang === 'en');
    const sortedAnnotations = [...annotations].sort(
        (a, b) => (a.sentenceIndex || 0) - (b.sentenceIndex || 0)
    );

    const result = [...lexes];

    for (const annotation of sortedAnnotations) {
        const sentenceIndex = Number(annotation.sentenceIndex) || 0;
        const isPaired = sentenceIndex < englishLexes.length;
        const lid = isPaired
            ? englishLexes[sentenceIndex].lid
            : `id${sentenceIndex + 1}`;

        const spanishLex = {
            lid,
            lang: 'es',
            comment: '',
            text: String(annotation.sentence || '')
        };

        if (!isPaired) {
            result.push(spanishLex);
            continue;
        }

        let insertAfter = -1;
        for (let i = 0; i < result.length; i++) {
            if (result[i] && result[i].lid === lid)
                insertAfter = i;
        }

        if (insertAfter === -1)
            result.push(spanishLex);
        else
            result.splice(insertAfter + 1, 0, spanishLex);
    }

    return result;
}

/**
 * Builds the opening tag of an `<entry>` with its attributes.
 * @param {*} entry - Entry with category, eid, size and optional shape.
 * @returns {string} XML line with the opening tag.
 */
function renderEntryOpenTag(entry) {
    return `    <entry${renderAttrs({
        category: entry.category,
        eid: entry.eid,
        shape: entry.shape,
        shape_type: entry.shapeType,
        size: entry.size
    })}>`;
}

/**
 * Serializes a collection of triplesets (original or modified) into XML.
 * @param {*} containerTag - Wrapper tag (e.g. "originaltripleset").
 * @param {*} tripleTag - Tag for each triple (e.g. "otriple").
 * @param {*} triplesets - List or single tripleset to serialize.
 * @returns {Array<string>} XML lines.
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
 * Serializes an entry's lexicalizations (`<lex>`).
 * @param {*} lexes - List or single lex to serialize.
 * @returns {Array<string>} XML lines.
 */
function renderLexes(lexes) {
    return toArray(lexes).map((/** @type {*} */ lex) => `      <lex${renderAttrs({
        lid: lex.lid,
        lang: lex.lang,
        comment: lex.comment
    })}>${lex.text}</lex>`);
}

/**
 * Serializes a group of links (DBpedia or internal) using the given tags.
 * @param {*} groupTag - Wrapper tag (e.g. "links").
 * @param {*} itemTag - Tag for each link (e.g. "link").
 * @param {*} links - List or single link to serialize.
 * @returns {Array<string>} XML lines (empty if there are no links).
 */
function renderLinksGroup(groupTag, itemTag, links) {
    const normalizedLinks = toArray(links);
    if (normalizedLinks.length === 0)
        return [];

    const lines = [`      <${groupTag}>`];

    for (const link of normalizedLinks) {
        lines.push(
            `        <${itemTag}${renderAttrs({ direction: link.direction })}>${link.subject} | ${link.predicate} | ${link.object}</${itemTag}>`
        );
    }

    lines.push(`      </${groupTag}>`);
    return lines;
}

module.exports = {
    buildDatasetXml,
    buildAnnotatedDatasetXml
};
