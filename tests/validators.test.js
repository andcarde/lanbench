'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    toPositiveInteger,
    toIntegerNormalized,
    normalizePercent,
    isStringArray,
    getErrorMessage
} = require('../utils/validators');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('validators', () => {
    it('toPositiveInteger devuelve enteros positivos y rechaza valores no válidos', () => {
        assert.equal(toPositiveInteger('15'), 15);
        assert.equal(toPositiveInteger(3), 3);
        assert.equal(toPositiveInteger(0), null);
        assert.equal(toPositiveInteger(-2), null);
        assert.equal(toPositiveInteger(1.5), null);
        assert.equal(toPositiveInteger('abc'), null);
    });

    it('toIntegerNormalized trunca números y normaliza negativos o no numéricos a 0', () => {
        assert.equal(toIntegerNormalized(8.9), 8);
        assert.equal(toIntegerNormalized('12'), 12);
        assert.equal(toIntegerNormalized(-4.2), 0);
        assert.equal(toIntegerNormalized('NaN'), 0);
    });

    it('normalizePercent limita el rango a 0..100', () => {
        assert.equal(normalizePercent(-5), 0);
        assert.equal(normalizePercent(145), 100);
        assert.equal(normalizePercent(42.5), 42.5);
        assert.equal(normalizePercent('foo'), 0);
    });

    it('isStringArray acepta arrays de cadenas con contenido y rechaza el resto', () => {
        assert.equal(isStringArray(['uno', 'dos']), true);
        assert.equal(isStringArray(['uno', '   ']), false);
        assert.equal(isStringArray('no-array'), false);
        assert.equal(isStringArray([1, 2, 3]), false);
    });

    it('getErrorMessage devuelve mensaje por defecto cuando no existe error.message', () => {
        assert.equal(getErrorMessage(new Error('fallo')), 'fallo');
        assert.equal(getErrorMessage({ message: 'mensaje plano' }), 'mensaje plano');
        assert.equal(getErrorMessage({}), 'Error desconocido');
        assert.equal(getErrorMessage(null), 'Error desconocido');
    });
});
