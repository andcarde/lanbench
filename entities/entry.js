'use strict';

/**
 * Datos básicos de una entry del benchmark XML WebNLG.
 */
class EntryDTO {
  /**
   * @param {object}      p
   * @param {number}      p.eid
   * @param {string}      p.category
   * @param {string|null} p.shape
   * @param {string|null} p.shapeType
   * @param {number}      p.size
   */
  constructor({ eid, category, shape, shapeType, size }) {
    this.eid       = eid;
    this.category  = category;
    this.shape     = shape     ?? null;
    this.shapeType = shapeType ?? null;
    this.size      = size;
  }
}

module.exports = { EntryDTO };
