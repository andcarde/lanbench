// @ts-nocheck
/**
 * @file Mock of `fetchDatasetText` for `front-debug` mode.
 *
 * Always returns the same synthetic XML with a single entry, enough for the
 * `dataset-view.html` page to render something without a backend.
 */

/**
 * Mock: returns a synthetic dataset XML (ignores `datasetId`).
 *
 * @param {number} _datasetId
 * @returns {Promise<string>}
 */
function fetchDatasetText(_datasetId) {
    const baseBlock = [
        '<benchmark>',
        '  <entry id="debug-001" category="Airport" language="es">',
        '    <source>Madrid-Barajas conecta vuelos nacionales e internacionales.</source>',
        '    <triple>Madrid-Barajas | cityServed | Madrid</triple>',
        '    <triple>Madrid-Barajas | runwayLength | 3500m</triple>',
        '    <triple>Madrid-Barajas | operator | AENA</triple>',
        '  </entry>',
        '  <entry id="debug-002" category="University" language="es">',
        '    <source>La UCM cuenta con facultades, bibliotecas y laboratorios distribuidos por distintos campus.</source>',
        '    <triple>UCM | locatedIn | Madrid</triple>',
        '    <triple>UCM | hasFaculty | Informatica</triple>',
        '    <triple>UCM | foundedIn | 1499</triple>',
        '  </entry>',
        '</benchmark>'
    ].join('\n');

    const text = (`${baseBlock}\n\n`).repeat(40).slice(0, 6000);
    return $.Deferred().resolve(text).promise();
}

globalThis.fetchDatasetText = fetchDatasetText;
