'use strict';

/**
 * @file `EntryDTO` — DTO de una entry parseada desde el XML del benchmark
 * WebNLG. Los atributos siguen los nombres del propio XML (`eid`, `shape`,
 * `shapeType`, `size`) y la categoria semantica asociada.
 *
 * Esta clase NO incluye triples ni oraciones de referencia; se utiliza
 * principalmente como representacion estructural intermedia. Para el
 * contexto canonico expuesto al frontend consumase {@link EntryContextDTO}
 * (ver `types/typedefs.js`).
 */

/**
 * Datos crudos aceptados por el constructor.
 *
 * @typedef {Object} EntryDTOInput
 * @property {string|number} [eid]                  Identificador WebNLG.
 * @property {string} [category]                    Categoria semantica.
 * @property {string|null} [shape]                  Forma del grafo.
 * @property {string|null} [shapeType]              Tipo de forma del grafo.
 * @property {number|string} [size]                 Numero de triples.
 */

/**
 * Entry parseada del benchmark XML WebNLG.
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
     * Construye un `EntryDTO` desde cualquier objeto-fuente WebNLG.
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
     * Serializa la entry a un objeto JSON-compatible.
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
