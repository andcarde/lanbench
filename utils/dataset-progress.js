'use strict';

/**
 * @file Dataset progress calculation.
 *
 * Converts section counters + the number of annotated entries into
 * percentages (`completed`, `remaining`, `withoutReview`) used by the UI and
 * the administrative export.
 */

const { SECTION_SIZE, resolveSectionSize } = require('../constants/datasets');

/**
 * Calculates progress percentages combining section counters and, when
 * provided, the number of annotated entries in the dataset.
 *
 * When `annotatedEntries` and `totalEntries` are available they are used so
 * that annotations in sections that are not yet complete also count toward
 * progress.
 *
 * When `reviewEnabled` is false, all annotated entries count as completed.
 * When it is true, terminally reviewed entries (`reviewed` / `disputed`) count
 * as completed; the remaining annotations are reported in `withoutReview`.
 * If the caller cannot provide an entry-level reviewed count, the legacy
 * section-based approximation (`sectionsCompleted * sectionSize`) is used.
 *
 * @param {*} options - Section counters and, optionally, per-entry counts.
 * @returns {{completed: number, withoutReview: number, remaining: number}}
 */
function calculatePercentagesFromSectionCounters({
    sectionsCompleted = 0,
    sectionsInReview = 0,
    sectionsPending = 0,
    reviewEnabled = false,
    annotatedEntries = null,
    reviewedEntries = null,
    totalEntries = null,
    sectionSize = SECTION_SIZE
} = {}) {
    const completedSections = nonNegativeInteger(sectionsCompleted);
    const inReviewSections = reviewEnabled ? nonNegativeInteger(sectionsInReview) : 0;
    const pendingSections = nonNegativeInteger(sectionsPending);
    const totalSections = completedSections + inReviewSections + pendingSections;

    const totalEntryCount = nonNegativeInteger(totalEntries);
    const annotatedEntryCount = clampToCeiling(nonNegativeInteger(annotatedEntries), totalEntryCount);
    const resolvedSectionSize = resolveSectionSize({ sectionSize });

    if (canUseEntryBasedMath(annotatedEntries, totalEntryCount))
        return computeEntryBasedPercentages({
            annotatedEntryCount,
            reviewedEntryCount: reviewedEntries,
            totalEntryCount,
            completedSections,
            reviewEnabled,
            sectionSize: resolvedSectionSize
        });

    if (totalSections === 0)
        return { completed: 0, withoutReview: 0, remaining: 100 };

    const completed = clampPercent(Math.round((completedSections / totalSections) * 100));
    const withoutReview = reviewEnabled
        ? clampPercent(Math.round((inReviewSections / totalSections) * 100))
        : 0;
    const remaining = clampPercent(100 - completed - withoutReview);

    return { completed, withoutReview, remaining };
}

/**
 * Calculates progress percentages based on entries (not sections).
 * @param {*} options - { annotatedEntryCount, reviewedEntryCount, totalEntryCount, completedSections, reviewEnabled }.
 * @returns {{completed:number, withoutReview:number, remaining:number}} Percentages clamped to [0,100].
 */
function computeEntryBasedPercentages(/** @type {*} */ {
    annotatedEntryCount,
    reviewedEntryCount = null,
    totalEntryCount,
    completedSections,
    reviewEnabled,
    sectionSize = SECTION_SIZE
}) {
    const sectionBasedReviewedEntries = completedSections * sectionSize;
    const reviewedEntries = reviewEnabled
        ? clampToCeiling(
            reviewedEntryCount === null || reviewedEntryCount === undefined
                ? sectionBasedReviewedEntries
                : nonNegativeInteger(reviewedEntryCount),
            totalEntryCount
        )
        : 0;
    const completedEntries = reviewEnabled
        ? reviewedEntries
        : annotatedEntryCount;
    const inReviewEntries = reviewEnabled
        ? Math.max(annotatedEntryCount - reviewedEntries, 0)
        : 0;

    const completed = clampPercent(Math.round((completedEntries / totalEntryCount) * 100));
    const withoutReview = reviewEnabled
        ? clampPercent(Math.round((inReviewEntries / totalEntryCount) * 100))
        : 0;
    const remaining = clampPercent(100 - completed - withoutReview);

    return { completed, withoutReview, remaining };
}

/**
 * Indicates whether the per-entry counts allow a more precise progress calculation.
 * @param {*} annotatedEntries - Annotated entries, or null/undefined.
 * @param {*} totalEntryCount - Total entries in the dataset.
 * @returns {boolean} True if the per-entry math can be used.
 */
function canUseEntryBasedMath(annotatedEntries, totalEntryCount) {
    return annotatedEntries !== null
        && annotatedEntries !== undefined
        && totalEntryCount > 0;
}

/**
 * Clamps a value to a non-negative ceiling.
 * @param {number} value - Value to clamp.
 * @param {number} ceiling - Upper bound (returns 0 if it is <= 0).
 * @returns {number} Value bounded to [0, ceiling].
 */
function clampToCeiling(/** @type {number} */ value, /** @type {number} */ ceiling) {
    if (ceiling <= 0) return 0;
    if (value > ceiling) return ceiling;
    return value;
}

/**
 * Coerces a value to a non-negative integer (floors it; 0 for non-positive/non-finite).
 * @param {*} value - Value to coerce.
 * @returns {number} Non-negative integer.
 */
function nonNegativeInteger(/** @type {*} */ value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
}

/**
 * Clamps a value to the percentage range [0, 100].
 * @param {*} value - Value to clamp.
 * @returns {number} Value bounded to [0, 100].
 */
function clampPercent(/** @type {*} */ value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

module.exports = {
    calculatePercentagesFromSectionCounters
};
