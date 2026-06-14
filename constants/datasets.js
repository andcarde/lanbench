'use strict';

/**
 * @file Global constants related to dataset presentation and partitioning.
 */

/**
 * Rotating CSS classes assigned to datasets to distinguish them visually.
 * @type {string[]}
 */
const DATASET_COLORS = ['dataset-purple', 'dataset-violet', 'dataset-green-progress'];

/**
 * Default CSS class for `Dataset.colorClass`. Matches the `@default` in the
 * Prisma schema and is used as a fallback in mappers/services when the row
 * lacks an explicit color.
 * @type {string}
 */
const DEFAULT_DATASET_COLOR = 'dataset-purple';

/**
 * Default size of each section (number of entries per work block) used when a
 * dataset row does not carry an explicit `sectionSize` (legacy rows). Matches
 * the `@default(10)` on `Dataset.sectionSize` in the Prisma schema.
 * @type {number}
 */
const SECTION_SIZE = 10;

/**
 * Resolves the per-dataset section size, falling back to {@link SECTION_SIZE}
 * for legacy rows (or any non-positive/garbage value). Single seam every
 * partitioning/progress consumer uses so the fallback lives in one place.
 *
 * @param {{ sectionSize?: * }|null|undefined} datasetRow - Dataset row (or any
 *   object carrying `sectionSize`).
 * @returns {number} A positive integer section size.
 */
function resolveSectionSize(datasetRow) {
    const raw = Number(datasetRow && datasetRow.sectionSize);
    return Number.isInteger(raw) && raw > 0 ? raw : SECTION_SIZE;
}

/**
 * Languages declared by default in a dataset when the source does not provide
 * the list explicitly.
 * @type {string[]}
 */
const DEFAULT_LANGUAGES = ['Spanish', 'English'];

module.exports = {
    DATASET_COLORS,
    DEFAULT_DATASET_COLOR,
    SECTION_SIZE,
    resolveSectionSize,
    DEFAULT_LANGUAGES
};
