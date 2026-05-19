'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    VALIDATION_CODES,
    ALL_CODES,
    ERROR_CODES,
    WARNING_CODES,
    DUPLICATE_CODES,
    resolveMessage,
    isKnownCode
} = require('../../../constants/validation-codes');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('validation-codes', () => {
    describe('VALIDATION_CODES', () => {
        it('contiene todos los codigos base requeridos', () => {
            const required = [
                'ok', 'spelling_error', 'grammar_error', 'semantic_mismatch',
                'rdf_error', 'language_not_spanish', 'mixed_language',
                'incomplete_sentence', 'inverted_relation', 'imprecise_entity_name',
                'accent_error', 'missing_comma', 'punctuation_missing',
                'unnatural_expression', 'repeated_sentence'
            ];
            for (const code of required)
                assert.ok((/** @type {Record<string,*>} */ (VALIDATION_CODES))[code], `Falta el codigo: ${code}`);
        });

        it('cada entrada tiene severity, type y messageTemplate', () => {
            const validSeverities = new Set(['ok', 'error', 'warning', 'duplicate']);
            const validTypes = new Set(['none', 'orthography', 'grammar', 'semantic', 'coverage', 'diversity']);
            for (const [code, entry] of Object.entries(VALIDATION_CODES)) {
                assert.ok(validSeverities.has(entry.severity), `Severidad invalida en ${code}: ${entry.severity}`);
                assert.ok(validTypes.has(entry.type), `Tipo invalido en ${code}: ${entry.type}`);
                assert.equal(typeof entry.messageTemplate, 'string', `messageTemplate ausente en ${code}`);
                assert.ok(entry.messageTemplate.length > 0, `messageTemplate vacio en ${code}`);
            }
        });

        it('repeated_sentence tiene severity duplicate', () => {
            assert.equal(VALIDATION_CODES.repeated_sentence.severity, 'duplicate');
        });

        it('ok tiene severity ok', () => {
            assert.equal(VALIDATION_CODES.ok.severity, 'ok');
        });
    });

    describe('ALL_CODES', () => {
        it('contiene todos los codigos de VALIDATION_CODES', () => {
            assert.deepEqual(
                [...ALL_CODES].sort(),
                Object.keys(VALIDATION_CODES).sort()
            );
        });
    });

    describe('ERROR_CODES', () => {
        it('solo contiene codigos de severidad error', () => {
            for (const code of ERROR_CODES)
                assert.equal((/** @type {Record<string,*>} */ (VALIDATION_CODES))[code].severity, 'error');
        });

        it('incluye spelling_error y semantic_mismatch', () => {
            assert.ok(ERROR_CODES.includes('spelling_error'));
            assert.ok(ERROR_CODES.includes('semantic_mismatch'));
        });

        it('no incluye warning ni duplicate', () => {
            assert.ok(!ERROR_CODES.includes('accent_error'));
            assert.ok(!ERROR_CODES.includes('repeated_sentence'));
        });
    });

    describe('WARNING_CODES', () => {
        it('solo contiene codigos de severidad warning', () => {
            for (const code of WARNING_CODES)
                assert.equal((/** @type {Record<string,*>} */ (VALIDATION_CODES))[code].severity, 'warning');
        });

        it('incluye accent_error, missing_comma y unnatural_expression', () => {
            assert.ok(WARNING_CODES.includes('accent_error'));
            assert.ok(WARNING_CODES.includes('missing_comma'));
            assert.ok(WARNING_CODES.includes('unnatural_expression'));
        });
    });

    describe('DUPLICATE_CODES', () => {
        it('contiene repeated_sentence', () => {
            assert.ok(DUPLICATE_CODES.includes('repeated_sentence'));
        });

        it('solo contiene codigos de severidad duplicate', () => {
            for (const code of DUPLICATE_CODES)
                assert.equal((/** @type {Record<string,*>} */ (VALIDATION_CODES))[code].severity, 'duplicate');
        });
    });

    describe('resolveMessage', () => {
        it('devuelve el messageTemplate sin explicacion', () => {
            const msg = resolveMessage('spelling_error', null);
            assert.equal(msg, 'Falta ortográfica');
        });

        it('concatena la explicacion al messageTemplate', () => {
            const msg = resolveMessage('spelling_error', 'uevo en lugar de huevo');
            assert.equal(msg, 'Falta ortográfica: uevo en lugar de huevo');
        });

        it('ignora explicacion vacia', () => {
            const msg = resolveMessage('grammar_error', '   ');
            assert.equal(msg, 'Error sintáctico');
        });

        it('devuelve la explicacion si el codigo no existe', () => {
            const msg = resolveMessage('codigo_inexistente', 'algo raro');
            assert.equal(msg, 'algo raro');
        });

        it('devuelve mensaje generico si codigo y explicacion son desconocidos', () => {
            const msg = resolveMessage('codigo_inexistente', null);
            assert.equal(msg, 'Problema de validacion desconocido.');
        });

        it('devuelve el mensaje de repeated_sentence sin explicacion', () => {
            const msg = resolveMessage('repeated_sentence', null);
            assert.ok(msg.includes('Oración repetida'));
        });
    });

    describe('isKnownCode', () => {
        it('devuelve true para codigos validos', () => {
            assert.ok(isKnownCode('ok'));
            assert.ok(isKnownCode('spelling_error'));
            assert.ok(isKnownCode('repeated_sentence'));
        });

        it('devuelve false para codigos desconocidos', () => {
            assert.ok(!isKnownCode('unknown_code'));
            assert.ok(!isKnownCode(''));
            assert.ok(!isKnownCode(/** @type {any} */ (null)));
            assert.ok(!isKnownCode(/** @type {any} */ (undefined)));
            assert.ok(!isKnownCode(/** @type {any} */ (42)));
        });
    });
});
