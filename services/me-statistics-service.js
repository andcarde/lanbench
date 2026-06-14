'use strict';

/**
 * @file Personal-statistics service — the bounded context behind
 * `GET /api/me/stats` (US-14).
 *
 * Aggregates the current user's annotation and review activity into a global
 * summary plus a per-dataset breakdown (only datasets where the user has at
 * least one annotation or review). Averages are *total seconds ÷ task count*,
 * floored, or `null` when there is no activity.
 *
 * @typedef {Object} MeStatisticsServiceDeps
 * @property {Record<string, any>} [meStatisticsRepository]
 */

const { createMeStatisticsRepository } = require('../repositories/me-statistics-repository');

/**
 * Builds the personal-statistics service.
 *
 * @param {MeStatisticsServiceDeps} [options]
 */
function createMeStatisticsService({ meStatisticsRepository } = {}) {
    const deps = {
        meStatisticsRepository: meStatisticsRepository || createMeStatisticsRepository()
    };

    /**
     * Returns the `{ user, totals, datasets }` statistics DTO for a user.
     * @param {{ userId:number, email?:string|null }} input - The current user.
     * @returns {Promise<*>} Statistics DTO.
     */
    async function getMyStatistics({ userId, email = null }) {
        const [annotatedEntries, assignmentTimes, reviews] = await Promise.all([
            deps.meStatisticsRepository.findAnnotatedEntries(userId),
            deps.meStatisticsRepository.findSectionAssignmentTimes(userId),
            deps.meStatisticsRepository.findTerminalReviews(userId)
        ]);

        const datasetIds = collectDatasetIds(annotatedEntries, assignmentTimes, reviews);
        const datasetNames = await deps.meStatisticsRepository.findDatasetsByIds(datasetIds);

        return buildMyStatisticsDTO({ userId, email, annotatedEntries, assignmentTimes, reviews, datasetNames });
    }

    return {
        getMyStatistics
    };
}

/**
 * Type guard: a present, strictly-positive integer dataset id.
 * @param {*} value
 * @returns {value is number}
 */
function isValidDatasetId(value) {
    return Number.isInteger(value) && value > 0;
}

/**
 * Collects the distinct dataset ids present across the activity rows.
 * @param {...Array<{datasetId:?number}>} sources - Activity row arrays.
 * @returns {number[]} Distinct, valid dataset ids.
 */
function collectDatasetIds(...sources) {
    const ids = new Set();
    for (const rows of sources)
        for (const row of rows || [])
            if (isValidDatasetId(row.datasetId))
                ids.add(row.datasetId);
    return [...ids];
}

/**
 * Floored average of `seconds / count`, or `null` when there is no activity.
 * @param {number} seconds - Total seconds.
 * @param {number} count - Number of tasks.
 * @returns {?number} Average seconds, or null.
 */
function averageSeconds(seconds, count) {
    return count > 0 ? Math.floor(seconds / count) : null;
}

/**
 * Builds the personal-statistics DTO from raw per-user activity. Pure: all the
 * aggregation lives here, so it is unit-testable without a database.
 *
 * @param {Object} input
 * @param {number} input.userId
 * @param {?string} [input.email]
 * @param {Array<{datasetId:number, entryId:number}>} input.annotatedEntries
 * @param {Array<{datasetId:number, timeSpentSeconds:number}>} input.assignmentTimes
 * @param {Array<{datasetId:?number, timeSpentSeconds:number}>} input.reviews
 * @param {Array<{id:number, name:string}>} input.datasetNames
 * @returns {*} The `{ user, totals, datasets }` DTO.
 */
function buildMyStatisticsDTO({ userId, email = null, annotatedEntries, assignmentTimes, reviews, datasetNames }) {
    const nameById = new Map((datasetNames || []).map(d => [d.id, d.name]));
    /** @type {Map<number, {datasetId:number, annotations:number, annotationSeconds:number, reviews:number, reviewSeconds:number}>} */
    const byDataset = new Map();

    const bucket = (/** @type {number} */ datasetId) => {
        let acc = byDataset.get(datasetId);
        if (!acc) {
            acc = { datasetId, annotations: 0, annotationSeconds: 0, reviews: 0, reviewSeconds: 0 };
            byDataset.set(datasetId, acc);
        }
        return acc;
    };

    for (const row of annotatedEntries || [])
        if (isValidDatasetId(row.datasetId))
            bucket(row.datasetId).annotations += 1;

    for (const row of assignmentTimes || [])
        if (isValidDatasetId(row.datasetId))
            bucket(row.datasetId).annotationSeconds += toSeconds(row.timeSpentSeconds);

    for (const row of reviews || [])
        if (isValidDatasetId(row.datasetId)) {
            const entry = bucket(row.datasetId);
            entry.reviews += 1;
            entry.reviewSeconds += toSeconds(row.timeSpentSeconds);
        }

    const datasets = [...byDataset.values()]
        .filter(d => d.annotations > 0 || d.reviews > 0)
        .map(d => ({
            datasetId: d.datasetId,
            datasetName: nameById.get(d.datasetId) || `#${d.datasetId}`,
            annotations: d.annotations,
            reviews: d.reviews,
            avgAnnotationSeconds: averageSeconds(d.annotationSeconds, d.annotations),
            avgReviewSeconds: averageSeconds(d.reviewSeconds, d.reviews)
        }))
        .sort((a, b) => a.datasetName.localeCompare(b.datasetName));

    const totalAnnotations = sum(byDataset, d => d.annotations);
    const totalReviews = sum(byDataset, d => d.reviews);
    // Only count time from datasets that actually have tasks, so section-time
    // recorded with no saved annotation cannot skew the average downwards.
    const totalAnnotationSeconds = sum(byDataset, d => (d.annotations > 0 ? d.annotationSeconds : 0));
    const totalReviewSeconds = sum(byDataset, d => d.reviewSeconds);

    return {
        user: { id: userId, email: email || null },
        totals: {
            annotations: totalAnnotations,
            reviews: totalReviews,
            datasetsAnnotated: [...byDataset.values()].filter(d => d.annotations > 0).length,
            datasetsReviewed: [...byDataset.values()].filter(d => d.reviews > 0).length,
            avgAnnotationSeconds: averageSeconds(totalAnnotationSeconds, totalAnnotations),
            avgReviewSeconds: averageSeconds(totalReviewSeconds, totalReviews)
        },
        datasets
    };
}

/**
 * Coerces a value to a non-negative integer number of seconds.
 * @param {*} value - Raw value.
 * @returns {number} Seconds (>= 0).
 */
function toSeconds(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Sums a projection over the per-dataset accumulator.
 * @param {Map<number, *>} byDataset - Accumulator.
 * @param {(d:*) => number} project - Projection.
 * @returns {number} Sum.
 */
function sum(byDataset, project) {
    let total = 0;
    for (const d of byDataset.values())
        total += project(d);
    return total;
}

module.exports = {
    createMeStatisticsService,
    buildMyStatisticsDTO
};
