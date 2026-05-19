'use strict';

/**
 * @file `DatasetDTO` — agrupa las entries parseadas de un fichero benchmark
 * XML (WebNLG) en una estructura serializable.
 *
 * Esta clase es deliberadamente delgada: actua como contenedor estructural
 * (lista de {@link EntryDTO}) y como punto de extension cuando se necesite
 * añadir metadatos de dataset que viajen con las entries.
 *
 * @typedef {import('./entry').EntryDTO} EntryDTO
 */

/**
 * Datos crudos aceptados por el constructor.
 *
 * @typedef {Object} DatasetDTOInput
 * @property {EntryDTO[]} [entries]
 */

/**
 * Resultado de parsear un fichero benchmark XML WebNLG: una lista plana de
 * {@link EntryDTO} sin metadatos adicionales.
 */
class DatasetDTO {
    /**
     * @param {DatasetDTOInput} [options]
     */
    constructor({ entries = [] } = {}) {
        /** @type {EntryDTO[]} Entries del dataset (puede estar vacio). */
        this.entries = entries;
    }

    /**
     * Construye un `DatasetDTO` a partir de cualquier fuente con propiedad
     * `entries`. Si `entries` no es un array, queda vacio.
     *
     * @param {{ entries?: EntryDTO[] } | null | undefined} source
     * @returns {DatasetDTO}
     */
    static fromSource(source) {
        return new DatasetDTO({
            entries: Array.isArray(source?.entries) ? source.entries : []
        });
    }

    /**
     * Serializa la instancia a un objeto JSON-compatible.
     * @returns {{ entries: EntryDTO[] }}
     */
    toJSON() {
        return {
            entries: this.entries
        };
    }
}

module.exports = {
    DatasetDTO
};
