'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { calculatePercentagesFromSectionCounters } = require('../../../utils/dataset-progress');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('dataset-progress', () => {
    it('cuenta entries anotadas dentro de secciones aun no completas (sin revision)', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 0,
            sectionsInReview: 0,
            sectionsPending: 3,
            reviewEnabled: false,
            annotatedEntries: 6,
            totalEntries: 30
        });

        assert.deepEqual(progress, {
            completed: 20,
            withoutReview: 0,
            remaining: 80
        });
    });

    it('combina secciones completadas y anotaciones parciales (sin revision)', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 1,
            sectionsInReview: 0,
            sectionsPending: 2,
            reviewEnabled: false,
            annotatedEntries: 15,
            totalEntries: 30
        });

        assert.deepEqual(progress, {
            completed: 50,
            withoutReview: 0,
            remaining: 50
        });
    });

    it('separa entries revisadas y anotadas no revisadas cuando hay revision', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 1,
            sectionsInReview: 0,
            sectionsPending: 2,
            reviewEnabled: true,
            annotatedEntries: 15,
            totalEntries: 30
        });

        assert.deepEqual(progress, {
            completed: 33,
            withoutReview: 17,
            remaining: 50
        });
    });

    it('usa el conteo real de entries revisadas cuando esta disponible', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 0,
            sectionsInReview: 3,
            sectionsPending: 0,
            reviewEnabled: true,
            annotatedEntries: 99,
            reviewedEntries: 41,
            totalEntries: 99,
            sectionSize: 33
        });

        assert.deepEqual(progress, {
            completed: 41,
            withoutReview: 59,
            remaining: 0
        });
    });

    it('cae a calculo por secciones cuando no se conocen entries anotadas', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 1,
            sectionsInReview: 1,
            sectionsPending: 1,
            reviewEnabled: true
        });

        assert.deepEqual(progress, {
            completed: 33,
            withoutReview: 33,
            remaining: 34
        });
    });

    it('devuelve 100% pendiente cuando el dataset esta vacio', () => {
        const progress = calculatePercentagesFromSectionCounters({
            sectionsCompleted: 0,
            sectionsInReview: 0,
            sectionsPending: 0,
            reviewEnabled: false
        });

        assert.deepEqual(progress, {
            completed: 0,
            withoutReview: 0,
            remaining: 100
        });
    });
});
