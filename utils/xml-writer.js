'use strict';

/**
 * xml-writer.js
 * Serializa un DatasetDTO a un fichero XML WebNLG 2
 * almacenado en /tmp con nombre aleatorio de 32 caracteres.
 *
 * API:  writeDataset(dataset, callback)
 *       callback(error, filename)
 */

const { writeFile }   = require('node:fs').promises;
const { randomBytes } = require('node:crypto');
const { toArray } = require('./xml-format');
const { resolveTempFilePath } = require('./temp-storage');

// ─── Serialización XML ────────────────────────────────────────────────────────

/**
 * Escapa únicamente las comillas dobles para que el valor sea seguro
 * dentro de un atributo XML delimitado por comillas dobles.
 * No tocamos & porque xml-reader usa processEntities:false, con lo que los
 * valores ya son literales crudos y deben round-tripear sin transformación.
 *
 * @param {string|number} value
 * @returns {string}
 */
function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

/**
 * Construye el XML completo a partir de un DatasetDTO.
 * @param {{ entries: Array<{ eid: number, category: string, shape: string|null, shapeType: string|null, size: number }> }} dataset
 * @returns {string}
 */
function buildXml(dataset) {
  const lines = ['<?xml version="1.0" ?>', '<benchmark>', '  <entries>'];

  for (const entry of toArray(dataset && dataset.entries)) {
    const parts = [
      `category="${escapeAttr(entry.category)}"`,
      `eid="${entry.eid}"`,
    ];
    if (entry.shape     != null) parts.push(`shape="${escapeAttr(entry.shape)}"`);
    if (entry.shapeType != null) parts.push(`shape_type="${escapeAttr(entry.shapeType)}"`);
    parts.push(`size="${entry.size}"`);
    lines.push(`    <entry ${parts.join(' ')}/>`);
  }

  lines.push('  </entries>', '</benchmark>');
  return lines.join('\n');
}

// ─── Función exportada ────────────────────────────────────────────────────────

/**
 * Escribe dataset en /tmp/<nombre>, donde <nombre> es una cadena
 * hexadecimal aleatoria de 32 caracteres.
 *
 * @param {{ entries: Array }} dataset
 * @returns {Promise<string>} filename
 */
async function writeDataset(dataset) {
  const filename = randomBytes(16).toString('hex'); // 32 hex chars
  const filePath = resolveTempFilePath(filename);
  const xml = buildXml(dataset);
  await writeFile(filePath, xml, 'utf-8');
  return filename;
}

module.exports = { writeDataset };
