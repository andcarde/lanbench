'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    CRITERION_GRAMMAR,
    CRITERION_COVERAGE,
    CRITERION_DIVERSITY,
    CRITERION_SEMANTIC_FIDELITY,
    ALL_CRITERION_CODES,
    getOrderedCriteria,
    getOrderedCriterionCodes,
    isValidCriterionCode,
    getCriterionIndex
} = require('../../../constants/review-criterion');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('review-criterion constants (T4.1)', () => {
    it('exporta los cuatro codigos de criterio con prefijo coherente', () => {
        assert.equal(CRITERION_GRAMMAR, 'criterion_grammar');
        assert.equal(CRITERION_COVERAGE, 'criterion_coverage');
        assert.equal(CRITERION_DIVERSITY, 'criterion_diversity');
        assert.equal(CRITERION_SEMANTIC_FIDELITY, 'criterion_semantic_fidelity');
    });

    it('ALL_CRITERION_CODES lista los cuatro codigos', () => {
        assert.equal(ALL_CRITERION_CODES.length, 4);
    });

    it('getOrderedCriteria devuelve objetos con code, label y description', () => {
        const criteria = getOrderedCriteria();
        assert.equal(criteria.length, 4);
        for (const item of criteria) {
            assert.ok(typeof item.code === 'string' && item.code.length > 0);
            assert.ok(typeof item.label === 'string' && item.label.length > 0);
            assert.ok(typeof item.description === 'string');
            assert.ok(isValidCriterionCode(item.code));
        }
    });

    it('el primer criterio del orden es criterion_grammar', () => {
        assert.equal(getOrderedCriterionCodes()[0], CRITERION_GRAMMAR);
    });

    it('isValidCriterionCode acepta solo codigos conocidos', () => {
        assert.equal(isValidCriterionCode(CRITERION_GRAMMAR), true);
        assert.equal(isValidCriterionCode('not_a_criterion'), false);
        assert.equal(isValidCriterionCode(/** @type {any} */ (null)), false);
    });

    it('getCriterionIndex devuelve la posicion ordenada o -1 si no existe', () => {
        assert.equal(getCriterionIndex(CRITERION_GRAMMAR), 0);
        assert.equal(getCriterionIndex(CRITERION_SEMANTIC_FIDELITY), 3);
        assert.equal(getCriterionIndex('xyz'), -1);
    });

    it('getOrderedCriteria devuelve copias mutables sin afectar el original', () => {
        const a = getOrderedCriteria();
        a[0].label = 'mutado';
        const b = getOrderedCriteria();
        assert.notEqual(b[0].label, 'mutado');
    });
});
