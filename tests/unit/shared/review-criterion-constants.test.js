'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    PHRASE_CRITERIA,
    REVIEW_CRITERIA,
    PHRASE_CRITERION_CODES,
    REVIEW_CRITERION_CODES,
    ALL_CRITERION_CODES,
    getPhraseCriteria,
    getPhraseCriterionCodes,
    getReviewCriterionCodes,
    isPhraseCriterion,
    isReviewCriterion,
    isValidCriterionCode,
    getPhraseCriterionIndex
} = require('../../../constants/review-criterion');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('review-criterion constants (T4.1)', () => {
    it('expone los cinco criterios de frase en orden', () => {
        assert.deepEqual(
            getPhraseCriterionCodes(),
            ['naturalness', 'fluency', 'adequacy', 'completeness', 'coverage']
        );
        assert.equal(PHRASE_CRITERIA.length, 5);
    });

    it('expone diversity como unico criterio de nivel de review', () => {
        assert.deepEqual(getReviewCriterionCodes(), ['diversity']);
        assert.equal(REVIEW_CRITERIA.length, 1);
    });

    it('ALL_CRITERION_CODES concatena criterios de frase y de review', () => {
        assert.equal(ALL_CRITERION_CODES.length, 6);
        assert.deepEqual(
            [...ALL_CRITERION_CODES],
            [...PHRASE_CRITERION_CODES, ...REVIEW_CRITERION_CODES]
        );
    });

    it('getPhraseCriteria devuelve objetos con code, label y description', () => {
        const criteria = getPhraseCriteria();
        assert.equal(criteria.length, 5);
        for (const item of criteria) {
            assert.ok(typeof item.code === 'string' && item.code.length > 0);
            assert.ok(typeof item.label === 'string' && item.label.length > 0);
            assert.ok(typeof item.description === 'string');
            assert.ok(isValidCriterionCode(item.code));
        }
    });

    it('el primer criterio de frase es naturalness', () => {
        assert.equal(getPhraseCriterionCodes()[0], 'naturalness');
    });

    it('isPhraseCriterion / isReviewCriterion clasifican por familia', () => {
        assert.equal(isPhraseCriterion('naturalness'), true);
        assert.equal(isPhraseCriterion('diversity'), false);
        assert.equal(isReviewCriterion('diversity'), true);
        assert.equal(isReviewCriterion('naturalness'), false);
    });

    it('isValidCriterionCode acepta solo codigos conocidos', () => {
        assert.equal(isValidCriterionCode('naturalness'), true);
        assert.equal(isValidCriterionCode('diversity'), true);
        assert.equal(isValidCriterionCode('not_a_criterion'), false);
        assert.equal(isValidCriterionCode(/** @type {any} */ (null)), false);
    });

    it('getPhraseCriterionIndex devuelve la posicion ordenada o -1 si no existe', () => {
        assert.equal(getPhraseCriterionIndex('naturalness'), 0);
        assert.equal(getPhraseCriterionIndex('coverage'), 4);
        assert.equal(getPhraseCriterionIndex('diversity'), -1);
        assert.equal(getPhraseCriterionIndex('xyz'), -1);
    });

    it('getPhraseCriteria devuelve copias mutables sin afectar el original', () => {
        const a = getPhraseCriteria();
        a[0].label = 'mutado';
        const b = getPhraseCriteria();
        assert.notEqual(b[0].label, 'mutado');
    });
});
