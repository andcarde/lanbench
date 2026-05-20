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
 * Target size of each section (number of entries per work block).
 * @type {number}
 */
const SECTION_SIZE = 10;

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
    DEFAULT_LANGUAGES
};
