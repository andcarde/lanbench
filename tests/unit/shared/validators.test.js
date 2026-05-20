'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    toPositiveInteger,
    toIntegerNormalized,
    trimmedOr,
    normalizeEmail,
    toBoolean,
    normalizePercent,
    isStringArray,
    getErrorMessage
} = require('../../../utils/validators');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

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

    it('trimmedOr recorta cadenas no vacías y devuelve fallback en cualquier otro caso', () => {
        assert.equal(trimmedOr('  hola  '), 'hola');
        assert.equal(trimmedOr('   '), null);
        assert.equal(trimmedOr(''), null);
        assert.equal(trimmedOr(null), null);
        assert.equal(trimmedOr(42), null);
        assert.equal(trimmedOr(undefined, 'fallback'), 'fallback');
        assert.equal(trimmedOr('', ''), '');
        assert.equal(trimmedOr('   ', 'localhost'), 'localhost');
        assert.equal(trimmedOr('valor', 'fallback'), 'valor');
    });

    it('normalizeEmail aplica trim+lowercase y devuelve fallback en valores inválidos', () => {
        assert.equal(normalizeEmail(' A@B.com '), 'a@b.com');
        assert.equal(normalizeEmail('Tom@Gmail.COM'), 'tom@gmail.com');
        assert.equal(normalizeEmail('   '), null);
        assert.equal(normalizeEmail(''), null);
        assert.equal(normalizeEmail(null), null);
        assert.equal(normalizeEmail(42), null);
        assert.equal(normalizeEmail(' ', ''), '');
        assert.equal(normalizeEmail(undefined, ''), '');
    });

    it('toBoolean acepta booleanos nativos, 0/1 numéricos y los tokens true/1/false/0', () => {
        assert.equal(toBoolean(true), true);
        assert.equal(toBoolean(false), false);
        assert.equal(toBoolean(1), true);
        assert.equal(toBoolean(0), false);
        assert.equal(toBoolean('true'), true);
        assert.equal(toBoolean(' TRUE '), true);
        assert.equal(toBoolean('1'), true);
        assert.equal(toBoolean('false'), false);
        assert.equal(toBoolean('0'), false);
    });

    it('toBoolean devuelve fallback para valores no reconocidos (incluidos null/undefined y tokens descartados)', () => {
        assert.equal(toBoolean('yes'), null);
        assert.equal(toBoolean('no'), null);
        assert.equal(toBoolean('on'), null);
        assert.equal(toBoolean('si'), null);
        assert.equal(toBoolean('sí'), null);
        assert.equal(toBoolean('garbage'), null);
        assert.equal(toBoolean(null), null);
        assert.equal(toBoolean(undefined), null);
        assert.equal(toBoolean({}), null);
        assert.equal(toBoolean(undefined, true), true);
        assert.equal(toBoolean('garbage', false), false);
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
