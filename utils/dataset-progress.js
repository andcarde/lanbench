'use strict';

/**
 * @file Calculo de progreso de un dataset.
 *
 * Convierte contadores de seccion + numero de entries anotadas en
 * porcentajes (`completed`, `remaining`, `withoutReview`) usados por
 * la UI y la exportacion administrativa.
 */

const { SECTION_SIZE } = require('../constants/datasets');

/**
 * Calcula porcentajes de avance combinando contadores de seccion y, cuando
 * se aporta, el numero de entries anotadas en el dataset.
 *
 * Cuando `annotatedEntries` y `totalEntries` estan disponibles se usan para
 * que las anotaciones de secciones aun no completas tambien sumen al progreso.
 *
 * Cuando `reviewEnabled` es false, todas las entries anotadas cuentan como
 * completadas. Cuando es true, solo las entries de secciones marcadas como
 * `sectionsCompleted` (revisadas) cuentan como completadas; el resto de
 * anotaciones se reportan en `withoutReview`.
 *
 * @param {*} options - Contadores de seccion y, opcionalmente, conteos por entry.
 * @returns {{completed: number, withoutReview: number, remaining: number}}
 */
function calculatePercentagesFromSectionCounters({
    sectionsCompleted = 0,
    sectionsInReview = 0,
    sectionsPending = 0,
    reviewEnabled = false,
    annotatedEntries = null,
    totalEntries = null
} = {}) {
    const completedSections = nonNegativeInteger(sectionsCompleted);
    const inReviewSections = reviewEnabled ? nonNegativeInteger(sectionsInReview) : 0;
    const pendingSections = nonNegativeInteger(sectionsPending);
    const totalSections = completedSections + inReviewSections + pendingSections;

    const totalEntryCount = nonNegativeInteger(totalEntries);
    const annotatedEntryCount = clampToCeiling(nonNegativeInteger(annotatedEntries), totalEntryCount);

    if (canUseEntryBasedMath(annotatedEntries, totalEntryCount))
        return computeEntryBasedPercentages({
            annotatedEntryCount,
            totalEntryCount,
            completedSections,
            reviewEnabled
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
 * Calcula porcentajes de avance basandose en entries (no en secciones).
 * @param {*} options - { annotatedEntryCount, totalEntryCount, completedSections, reviewEnabled }.
 * @returns {{completed:number, withoutReview:number, remaining:number}} Porcentajes acotados a [0,100].
 */
function computeEntryBasedPercentages(/** @type {*} */ {
    annotatedEntryCount,
    totalEntryCount,
    completedSections,
    reviewEnabled
}) {
    const reviewedEntries = reviewEnabled
        ? Math.min(completedSections * SECTION_SIZE, totalEntryCount)
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
 * Indica si los conteos por entry permiten un calculo mas preciso del progreso.
 * @param {*} annotatedEntries - Entries anotadas o null/undefined.
 * @param {*} totalEntryCount - Total de entries del dataset.
 * @returns {boolean} True si se puede usar la matematica por entries.
 */
function canUseEntryBasedMath(annotatedEntries, totalEntryCount) {
    return annotatedEntries !== null
        && annotatedEntries !== undefined
        && totalEntryCount > 0;
}

function clampToCeiling(/** @type {number} */ value, /** @type {number} */ ceiling) {
    if (ceiling <= 0) return 0;
    if (value > ceiling) return ceiling;
    return value;
}

function nonNegativeInteger(/** @type {*} */ value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
}

function clampPercent(/** @type {*} */ value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

module.exports = {
    calculatePercentagesFromSectionCounters
};
