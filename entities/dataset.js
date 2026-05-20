'use strict';

/**
 * @file `DatasetDTO` — groups the entries parsed from an XML benchmark file
 * (WebNLG) into a serializable structure.
 *
 * This class is deliberately thin: it acts as a structural container
 * (a list of {@link EntryDTO}) and as an extension point when dataset
 * metadata that travels with the entries needs to be added.
 *
 * @typedef {import('./entry').EntryDTO} EntryDTO
 */

/**
 * Raw data accepted by the constructor.
 *
 * @typedef {Object} DatasetDTOInput
 * @property {EntryDTO[]} [entries]
 */

/**
 * Result of parsing a WebNLG XML benchmark file: a flat list of
 * {@link EntryDTO} with no additional metadata.
 */
class DatasetDTO {
    /**
     * @param {DatasetDTOInput} [options]
     */
    constructor({ entries = [] } = {}) {
        /** @type {EntryDTO[]} Dataset entries (may be empty). */
        this.entries = entries;
    }

    /**
     * Builds a `DatasetDTO` from any source with an `entries` property.
     * If `entries` is not an array, it stays empty.
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
     * Serializes the instance to a JSON-compatible object.
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
