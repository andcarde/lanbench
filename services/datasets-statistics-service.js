'use strict';

/**
 * @file Datasets statistics service — bounded context for US-21
 * (per-user annotation/review statistics over a dataset).
 *
 * Injects `datasetsRepository`. Returns a DTO with two sections
 * (`annotation`, `review`) ready for the statistics panel.
 *
 * @typedef {Object} DatasetsStatisticsServiceDeps
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [datasetsStatisticsRepository]
 */

const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createDatasetsStatisticsRepository } = require('../repositories/datasets-statistics-repository');
const { ServiceError } = require('./service-error');
const { TERMINAL_REVIEW_STATUSES } = require('../constants/review-status');
const { toIntegerNormalized } = require('../utils/validators');

/**
 * Builds the dataset-statistics service.
 *
 * @param {DatasetsStatisticsServiceDeps} [options]
 */
function createDatasetsStatisticsService({ datasetsRepository, datasetsStatisticsRepository } = {}) {
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        datasetsStatisticsRepository: datasetsStatisticsRepository || createDatasetsStatisticsRepository()
    };

    /**
     * Returns a DTO with per-user statistics (annotation + review).
     * @param {number} userId - Current user.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Statistics DTO.
     */
    async function getDatasetStatistics(userId, datasetId) {
        const accessible = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!accessible)
            throw ServiceError.datasetNotFound();

        const dataset = await deps.datasetsStatisticsRepository.findDatasetStatisticsGraph({ datasetId });
        if (!dataset)
            throw ServiceError.datasetNotFound();

        return buildDatasetStatisticsDTO(dataset);
    }

    return {
        getDatasetStatistics
    };
}

/**
 * Builds the dataset statistics DTO.
 * @param {*} dataset - Dataset with minimal relations.
 * @returns {*} Statistics.
 */
function buildDatasetStatisticsDTO(dataset) {
    const totalEntries = toIntegerNormalized(dataset?.totalEntries);
    const annotationRowsByUser = new Map();
    const reviewRowsByUser = new Map();
    const annotationTimeByUser = sumAssignmentTimeByUser(dataset?.sectionAssignments);

    for (const entry of dataset?.entries || []) {
        collectAnnotationEntryStats(annotationRowsByUser, entry);
        collectReviewEntryStats(reviewRowsByUser, entry);
    }

    return {
        dataset: {
            datasetId: Number(dataset?.id || 0),
            name: dataset?.name || '',
            totalEntries
        },
        annotation: buildStatsRows(annotationRowsByUser, totalEntries, annotationTimeByUser),
        review: buildStatsRows(reviewRowsByUser, totalEntries),
        // Dataset-wide weighted average time per task (Σ seconds ÷ Σ tasks),
        // shown as the "general" footer of each table.
        annotationAverage: buildWeightedAverageTime(annotationRowsByUser, annotationTimeByUser),
        reviewAverage: buildWeightedAverageTime(reviewRowsByUser),
        // Multi-round consensus distribution (§4.6 / §10.3.1). `null` when the
        // dataset is single-round (no additional reviews) or when no entry has
        // any terminal review yet — the front-end hides the block on `null`.
        reviewRounds: buildReviewRoundsSummary(dataset)
    };
}

/**
 * Builds the multi-round-review distribution: average rounds per entry and the
 * histogram of round counts (1, 2, 3, ...). Returns `null` when the dataset is
 * single-round or has no terminal reviews yet.
 * @param {*} dataset - Dataset graph (must carry `hasAdditionalReviews` and `entries[].reviews`).
 * @returns {?{ averageRoundsPerEntry: string, histogram: Array<{rounds:number, entryCount:number}> }} Summary.
 */
function buildReviewRoundsSummary(dataset) {
    if (!dataset || !dataset.hasAdditionalReviews)
        return null;

    /** @type {Map<number, number>} entryCount per `rounds` value */
    const byRoundCount = new Map();
    let entriesWithReviews = 0;
    let totalRounds = 0;

    for (const entry of dataset.entries || []) {
        const terminalCount = (entry.reviews || []).filter((/** @type {*} */ r) =>
            TERMINAL_REVIEW_STATUSES.includes(r.status)
        ).length;

        if (terminalCount <= 0)
            continue;

        entriesWithReviews += 1;
        totalRounds += terminalCount;
        byRoundCount.set(terminalCount, (byRoundCount.get(terminalCount) || 0) + 1);
    }

    if (entriesWithReviews === 0)
        return null;

    const maxRounds = Math.max(...byRoundCount.keys());
    /** @type {Array<{rounds:number, entryCount:number}>} */
    const histogram = [];
    for (let rounds = 1; rounds <= maxRounds; rounds += 1)
        histogram.push({ rounds, entryCount: byRoundCount.get(rounds) || 0 });

    const average = totalRounds / entriesWithReviews;

    return {
        averageRoundsPerEntry: average.toFixed(2),
        histogram
    };
}

/**
 * Weighted average time per task across all users: total seconds over total
 * tasks (so a user with more tasks contributes proportionally), formatted like
 * the per-user `averageTime`.
 * @param {Map<*, *>} rowsByUser - Per-user accumulator (carries `totalEntries`).
 * @param {Map<number, number>|null} [timeByUser] - Optional external time source (annotation).
 * @returns {string} Human-readable weighted average, or '-'.
 */
function buildWeightedAverageTime(rowsByUser, timeByUser = null) {
    let totalTasks = 0;
    let totalSeconds = 0;

    for (const row of rowsByUser.values()) {
        totalTasks += toIntegerNormalized(row.totalEntries);
        totalSeconds += timeByUser instanceof Map
            ? (timeByUser.get(row.userId) || 0)
            : toIntegerNormalized(row.timeSpentSeconds);
    }

    return formatAverageTime(totalSeconds, totalTasks);
}

/**
 * Accumulates annotation statistics per entry.
 * @param {Map<*, *>} rowsByUser - Accumulator.
 * @param {*} entry - Entry.
 */
function collectAnnotationEntryStats(rowsByUser, entry) {
    const byUserForEntry = new Map();

    for (const annotation of entry?.annotations || []) {
        const userId = Number(annotation.userId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        const current = byUserForEntry.get(userId) || {
            userId,
            email: annotation.user?.email || '',
            isAcceptedFirstTry: true
        };
        current.isAcceptedFirstTry = current.isAcceptedFirstTry && annotation.isAcceptedFirstTry !== false;
        if (!current.email && annotation.user?.email)
            current.email = annotation.user.email;
        byUserForEntry.set(userId, current);
    }

    for (const item of byUserForEntry.values())
        incrementStatsRow(rowsByUser, item);
}

/**
 * Accumulates review statistics per entry.
 * @param {Map<*, *>} rowsByUser - Accumulator.
 * @param {*} entry - Entry.
 */
function collectReviewEntryStats(rowsByUser, entry) {
    for (const review of entry?.reviews || []) {
        if (!TERMINAL_REVIEW_STATUSES.includes(review.status))
            continue;

        const userId = Number(review.reviewerId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        const comments = Array.isArray(review.comments) ? review.comments : [];
        incrementStatsRow(rowsByUser, {
            userId,
            email: review.reviewer?.email || '',
            isAcceptedFirstTry: comments.every((/** @type {*} */ comment) => comment.isAcceptedFirstTry !== false),
            timeSpentSeconds: toIntegerNormalized(review.timeSpentSeconds)
        });
    }
}

/**
 * Increments a statistics row.
 * @param {Map<*, *>} rowsByUser - Accumulator.
 * @param {*} item - Item.
 */
function incrementStatsRow(rowsByUser, item) {
    const row = rowsByUser.get(item.userId) || {
        userId: item.userId,
        email: item.email || '',
        totalEntries: 0,
        acceptedFirstTryEntries: 0,
        timeSpentSeconds: 0
    };

    row.totalEntries += 1;
    if (item.isAcceptedFirstTry)
        row.acceptedFirstTryEntries += 1;
    row.timeSpentSeconds += toIntegerNormalized(item.timeSpentSeconds);
    if (!row.email && item.email)
        row.email = item.email;

    rowsByUser.set(item.userId, row);
}

/**
 * Sums assignment times per user.
 * @param {Array<*>} assignments - Assignments.
 * @returns {Map<number, number>} Time per user.
 */
function sumAssignmentTimeByUser(assignments) {
    const result = new Map();

    for (const assignment of assignments || []) {
        const userId = Number(assignment.userId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        result.set(
            userId,
            (result.get(userId) || 0) + toIntegerNormalized(assignment.timeSpentSeconds)
        );
    }

    return result;
}

/**
 * Builds the final, sorted rows.
 * @param {Map<*, *>} rowsByUser - Accumulator.
 * @param {number} totalDatasetEntries - Total entries.
 * @param {Map<*, *>|null} [timeByUser] - Optional time per user.
 * @returns {Array<*>} Rows.
 */
function buildStatsRows(rowsByUser, totalDatasetEntries, timeByUser = null) {
    return [...rowsByUser.values()]
        .map(row => {
            const totalTime = timeByUser instanceof Map
                ? (timeByUser.get(row.userId) || 0)
                : row.timeSpentSeconds;

            return {
                userId: row.userId,
                email: row.email,
                totalEntries: row.totalEntries,
                datasetPercent: formatFloorPercent(row.totalEntries, totalDatasetEntries),
                averageTime: formatAverageTime(totalTime, row.totalEntries),
                precision: formatFloorPercent(row.acceptedFirstTryEntries, row.totalEntries)
            };
        })
        .sort((a, b) => (
            b.totalEntries - a.totalEntries
            || a.email.localeCompare(b.email)
        ));
}

/**
 * Formats a percentage with two decimals, rounding down.
 * @param {number} numerator - Numerator.
 * @param {number} denominator - Denominator.
 * @returns {string} Percentage.
 */
function formatFloorPercent(numerator, denominator) {
    const safeNumerator = toIntegerNormalized(numerator);
    const safeDenominator = toIntegerNormalized(denominator);

    if (safeDenominator <= 0)
        return '0.00%';

    const cents = Math.floor((safeNumerator * 10000) / safeDenominator);
    return `${(cents / 100).toFixed(2)}%`;
}

/**
 * Formats the average time per entry.
 * @param {number} totalSeconds - Total seconds.
 * @param {number} totalEntries - Entries.
 * @returns {string} Human-readable time.
 */
function formatAverageTime(totalSeconds, totalEntries) {
    const seconds = toIntegerNormalized(totalSeconds);
    const entries = toIntegerNormalized(totalEntries);

    if (seconds <= 0 || entries <= 0)
        return '-';

    const average = Math.floor(seconds / entries);
    const minutes = Math.floor(average / 60);
    const remainingSeconds = average % 60;

    if (minutes <= 0)
        return `${remainingSeconds}s`;

    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

module.exports = {
    createDatasetsStatisticsService
};
