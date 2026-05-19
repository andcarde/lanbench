'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const {
    formatFeedbackRow,
    formatStatusLabel,
    formatFailedCriteria,
    formatCorrections,
    renderFeedbackTable
} = require('../../../public/js/annotations-feedback.js');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('annotations-feedback (T4.6)', () => {
    describe('formatStatusLabel', () => {
        it('mapea completed a Aceptada y disputed a En disputa', () => {
            assert.equal(formatStatusLabel('completed'), 'Aceptada');
            assert.equal(formatStatusLabel('disputed'), 'En disputa');
            assert.equal(formatStatusLabel('foo'), 'foo');
            assert.equal(formatStatusLabel(/** @type {any} */ (null)), 'Desconocido');
        });
    });

    describe('formatFailedCriteria', () => {
        it('devuelve Ninguno cuando no hay fallos', () => {
            assert.equal(formatFailedCriteria([]), 'Ninguno');
            assert.equal(formatFailedCriteria(/** @type {any} */ (null)), 'Ninguno');
        });

        it('lista codigos y decisiones separados por coma', () => {
            const out = formatFailedCriteria([
                { criterionCode: 'criterion_grammar', decision: 'rejected' },
                { criterionCode: 'criterion_coverage', decision: 'needs_fix' }
            ]);
            assert.ok(out.includes('criterion_grammar (rejected)'));
            assert.ok(out.includes('criterion_coverage (needs_fix)'));
        });
    });

    describe('formatCorrections', () => {
        it('devuelve Sin cambios cuando no hay correcciones', () => {
            assert.equal(formatCorrections([]), 'Sin cambios');
            assert.equal(formatCorrections(/** @type {any} */ (null)), 'Sin cambios');
        });

        it('proyecta sentenceIndex y correctedSentence', () => {
            const out = formatCorrections([
                { sentenceIndex: 0, correctedSentence: 'foo' },
                { sentenceIndex: 2, correctedSentence: 'bar' }
            ]);
            assert.ok(out.includes('#0: "foo"'));
            assert.ok(out.includes('#2: "bar"'));
        });
    });

    describe('formatFeedbackRow', () => {
        it('review disputed con criterio fallido devuelve string con codigo', () => {
            const row = formatFeedbackRow({
                reviewId: 1,
                entryId: 5,
                status: 'disputed',
                failedCriteria: [{ criterionCode: 'criterion_coverage', decision: 'rejected' }],
                corrections: []
            });
            assert.ok(row.failedSummary.includes('criterion_coverage'));
            assert.equal(row.statusLabel, 'En disputa');
            assert.ok(row.html.includes('<tr>'));
        });

        it('review completed sin criterios fallidos devuelve etiqueta Aceptada', () => {
            const row = formatFeedbackRow({
                reviewId: 1, entryId: 5, status: 'completed',
                failedCriteria: [], corrections: []
            });
            assert.equal(row.statusLabel, 'Aceptada');
            assert.equal(row.failedSummary, 'Ninguno');
            assert.equal(row.correctionsSummary, 'Sin cambios');
        });

        it('review con texto corregido lo refleja en correctionsSummary', () => {
            const row = formatFeedbackRow({
                reviewId: 1, entryId: 5, status: 'disputed',
                failedCriteria: [],
                corrections: [{ sentenceIndex: 1, correctedSentence: 'mejor texto' }]
            });
            assert.ok(row.correctionsSummary.includes('mejor texto'));
        });

        it('null o no objeto devuelve null', () => {
            assert.equal(formatFeedbackRow(null), null);
            assert.equal(formatFeedbackRow('string'), null);
        });
    });

    describe('renderFeedbackTable', () => {
        it('mensaje informativo cuando no hay feedback', () => {
            const html = renderFeedbackTable([]);
            assert.ok(html.includes('Aun no hay revisiones cerradas'));
        });

        it('genera una tabla con una fila por revision', () => {
            const html = renderFeedbackTable([
                { reviewId: 1, entryId: 10, status: 'completed', failedCriteria: [], corrections: [] },
                { reviewId: 2, entryId: 11, status: 'disputed', failedCriteria: [{ criterionCode: 'c', decision: 'rejected' }], corrections: [] }
            ]);
            assert.ok(html.includes('<table'));
            assert.ok(html.includes('Aceptada'));
            assert.ok(html.includes('En disputa'));
        });
    });
});
