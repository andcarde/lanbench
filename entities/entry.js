'use strict';

/**
 * @file `EntryDTO` — DTO of an entry parsed from the WebNLG benchmark XML.
 * The attributes follow the XML's own names (`eid`, `shape`, `shapeType`,
 * `size`) plus the associated semantic category.
 *
 * This class does NOT include triples or reference sentences; it is used
 * mainly as an intermediate structural representation. For the canonical
 * context exposed to the frontend, use {@link EntryContextDTO}
 * (see `types/typedefs.js`).
 */

/**
 * Raw data accepted by the constructor.
 *
 * @typedef {Object} EntryDTOInput
 * @property {string|number} [eid]                  WebNLG identifier.
 * @property {string} [category]                    Semantic category.
 * @property {string|null} [shape]                  Graph shape.
 * @property {string|null} [shapeType]              Graph shape type.
 * @property {number|string} [size]                 Number of triples.
 */

/**
 * Entry parsed from the WebNLG XML benchmark.
 */
class EntryDTO {
    /**
     * @param {EntryDTOInput} [options]
     */
    constructor({ eid, category, shape, shapeType, size } = {}) {
        /** @type {string|number|undefined} */
        this.eid = eid;
        /** @type {string|undefined} */
        this.category = category;
        /** @type {string|null} */
        this.shape = shape ?? null;
        /** @type {string|null} */
        this.shapeType = shapeType ?? null;
        /** @type {number|string|undefined} */
        this.size = size;
    }

    /**
     * Builds an `EntryDTO` from any WebNLG source object.
     *
     * @param {EntryDTOInput | null | undefined} source
     * @returns {EntryDTO}
     */
    static fromSource(source) {
        return new EntryDTO({
            eid: source?.eid,
            category: source?.category,
            shape: source?.shape,
            shapeType: source?.shapeType,
            size: source?.size
        });
    }

    /**
     * Serializes the entry to a JSON-compatible object.
     * @returns {EntryDTOInput}
     */
    toJSON() {
        return {
            eid: this.eid,
            category: this.category,
            shape: this.shape,
            shapeType: this.shapeType,
            size: this.size
        };
    }
}

module.exports = { EntryDTO };
