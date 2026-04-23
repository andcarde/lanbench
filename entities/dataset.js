'use strict';

const { toIntegerNormalized, normalizePercent } = require('../utils/validators');

const DEFAULT_COLOR_CLASS = 'dataset-purple';

/**
 * Formato devuelto por GET /api/datasets:
 * {
 *   id: number,
 *   name: string,
 *   metrics: {
 *     rdfTriples: number,
 *     languages: string[]
 *   },
 *   progress: {
 *     completed: number,
 *     withoutReview: number,
 *     remaining: number
 *   },
 *   ui: {
 *     colorClass: string
 *   }
 * }
 */
class DatasetListItemDTO {
    constructor({ id, name, metrics, progress, ui }) {
        this.id = toIntegerNormalized(id);
        this.name = normalizeName(name, this.id);
        this.metrics = {
            rdfTriples: toIntegerNormalized(metrics?.rdfTriples),
            languages: toStringArray(metrics?.languages)
        };
        this.progress = {
            completed: normalizePercent(progress?.completed),
            withoutReview: normalizePercent(progress?.withoutReview),
            remaining: normalizePercent(progress?.remaining)
        };
        this.ui = {
            colorClass: normalizeColorClass(ui?.colorClass)
        };
    }

    static fromSource(source) {
        return new DatasetListItemDTO({
            id: source?.idDataset ?? source?.id,
            name: source?.name,
            metrics: {
                rdfTriples: source?.triplesRDF ?? source?.records,
                languages: source?.languages
            },
            progress: {
                completed: source?.completedPercent,
                withoutReview: source?.withoutReviewPercent,
                remaining: source?.remainPercent
            },
            ui: {
                colorClass: source?.colorClass
            }
        });
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            metrics: this.metrics,
            progress: this.progress,
            ui: this.ui
        };
    }
}

function normalizeName(name, id) {
    if (typeof name === 'string' && name.trim().length > 0)
        return name.trim();
    return `DATASET ${id || 1}`;
}

function toStringArray(values) {
    if (!Array.isArray(values))
        return [];

    return values.filter(value => typeof value === 'string' && value.trim().length > 0);
}

function normalizeColorClass(value) {
    if (typeof value !== 'string' || value.trim().length === 0)
        return DEFAULT_COLOR_CLASS;
    return value.trim();
}

/**
 * Agrupa las entries parseadas de un fichero benchmark.
 */
class DatasetDTO {
  /** @param {{ entries: EntryDTO[] }} p */
  constructor({ entries = [] }) {
    this.entries = entries;
  }
}

module.exports = {
    DatasetDTO,
    DatasetListItemDTO
};
