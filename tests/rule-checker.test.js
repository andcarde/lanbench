'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const ruleChecker = require('../business/rule-checker');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('rule-checker', () => {
    it('marca como fallo inmediato las oraciones vacías', () => {
        const result = ruleChecker.check('   ');

        assert.deepEqual(result, {
            valid: false,
            reason: 'La oración está vacía.',
            suggestion: 'Escribe una oración antes de validar.'
        });
        assert.equal(ruleChecker.isImmediateFailure(result), true);
    });

    it('detecta error ortográfico en "ago" sin marcarlo como fallo inmediato', () => {
        const result = ruleChecker.check('Yo ago pruebas.');

        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay un posible error ortográfico en el verbo.');
        assert.equal(result.suggestion, 'Yo hago pruebas.');
        assert.equal(ruleChecker.isImmediateFailure(result), false);
    });

    it('acepta oraciones bien formadas con puntuación final', () => {
        const result = ruleChecker.check('Yo hago pruebas.');

        assert.deepEqual(result, {
            valid: true,
            reason: null,
            suggestion: null
        });
        assert.equal(ruleChecker.isImmediateFailure(result), false);
    });
});
