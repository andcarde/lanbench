'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const OwnStadsUI = require('../../../public/js/own-stads.js');
const {
    formatDuration,
    buildSummaryCards,
    messageFromResult,
    escapeHtml
} = OwnStadsUI;

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('own-stads UI helpers (US-14)', () => {
    describe('formatDuration', () => {
        it('formatea minutos y segundos', () => {
            assert.equal(formatDuration(95), '1m 35s');
            assert.equal(formatDuration(130), '2m 10s');
            assert.equal(formatDuration(45), '45s');
        });

        it('devuelve un guion sin actividad', () => {
            assert.equal(formatDuration(0), '—');
            assert.equal(formatDuration(null), '—');
            assert.equal(formatDuration(/** @type {any} */ (undefined)), '—');
            assert.equal(formatDuration(-5), '—');
        });
    });

    describe('buildSummaryCards', () => {
        it('proyecta los seis indicadores globales en orden', () => {
            const cards = buildSummaryCards({
                annotations: 42,
                reviews: 18,
                datasetsAnnotated: 2,
                datasetsReviewed: 3,
                avgAnnotationSeconds: 95,
                avgReviewSeconds: 130
            });

            assert.equal(cards.length, 6);
            assert.equal(cards[0].value, 42);
            assert.equal(cards[1].value, 18);
            assert.equal(cards[2].value, 2);
            assert.equal(cards[3].value, 3);
            assert.equal(cards[4].value, '1m 35s');
            assert.equal(cards[5].value, '2m 10s');
        });

        it('tolera totales ausentes', () => {
            const cards = buildSummaryCards(/** @type {any} */ (undefined));
            assert.equal(cards.length, 6);
            assert.equal(cards[0].value, 0);
            assert.equal(cards[4].value, '—');
        });
    });

    describe('messageFromResult', () => {
        it('extrae message/code o un fallback HTTP', () => {
            assert.equal(messageFromResult({ data: { message: 'boom' } }), 'boom');
            assert.equal(messageFromResult({ data: { code: 'x' } }), 'x');
            assert.equal(messageFromResult({ status: 500, data: null }), 'HTTP 500');
            assert.equal(messageFromResult(null), 'Error desconocido');
        });
    });

    describe('escapeHtml', () => {
        it('escapa caracteres peligrosos', () => {
            assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
            assert.equal(escapeHtml(null), '');
            assert.equal(escapeHtml(7), '7');
        });
    });
});
