'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const ReviewerUI = require('../../../public/js/reviewer.js');
const {
    buildCriteriaState,
    activeCriterionIndex,
    canFinalize,
    predictedOutcome,
    buildSentenceState,
    requiresComment,
    readDatasetIdFromLocation,
    messageFromResult,
    escapeHtml,
    computeRequestButtonMode,
    describeRequestButton
} = ReviewerUI;

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('reviewer request-button state (P5 affordance)', () => {
    it('is enabled ("siguiente") when there is no open review — lets the reviewer pull a candidate', () => {
        assert.equal(computeRequestButtonMode({}), 'siguiente');
        assert.equal(computeRequestButtonMode({ hasOpenReview: false }), 'siguiente');
        assert.equal(describeRequestButton('siguiente').disabled, false);
    });

    it('is disabled while fetching or while a review is open with criteria pending', () => {
        assert.equal(computeRequestButtonMode({ fetching: true }), 'pendiente');
        assert.equal(computeRequestButtonMode({ hasOpenReview: true, finalized: false }), 'pendiente');
        assert.equal(describeRequestButton('pendiente').disabled, true);
    });

    it('shows "finalizado" (disabled) right after a finalized review', () => {
        assert.equal(computeRequestButtonMode({ hasOpenReview: true, finalized: true }), 'finalizado');
        const view = describeRequestButton('finalizado');
        assert.equal(view.disabled, true);
        assert.equal(view.variant, 'btn-success');
    });
});

describe('reviewer UI helpers (T4.5)', () => {
    describe('buildCriteriaState', () => {
        it('marca como decided los criterios con decision previa', () => {
            const state = buildCriteriaState(
                [{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }],
                [{ criterionCode: 'a', decision: 'accepted', comment: null }]
            );
            assert.equal(state[0].decided, true);
            assert.equal(state[0].decision, 'accepted');
            assert.equal(state[1].decided, false);
        });

        it('soporta inputs vacios', () => {
            assert.deepEqual(buildCriteriaState([], []), []);
            assert.deepEqual(buildCriteriaState(/** @type {any} */ (null), /** @type {any} */ (null)), []);
        });
    });

    describe('activeCriterionIndex', () => {
        it('devuelve la posicion del primer criterio no decidido', () => {
            assert.equal(activeCriterionIndex([
                { decided: true },
                { decided: false },
                { decided: false }
            ]), 1);
        });

        it('devuelve la longitud cuando todos estan decididos', () => {
            assert.equal(activeCriterionIndex([{ decided: true }, { decided: true }]), 2);
        });
    });

    describe('canFinalize', () => {
        it('solo true cuando hay criterios y todos estan decididos', () => {
            assert.equal(canFinalize([{ decided: true }, { decided: true }]), true);
            assert.equal(canFinalize([{ decided: true }, { decided: false }]), false);
            assert.equal(canFinalize([]), false);
            assert.equal(canFinalize(/** @type {any} */ (null)), false);
        });
    });

    describe('predictedOutcome', () => {
        it('completed si todo es accepted, disputed en otro caso', () => {
            assert.equal(predictedOutcome([{ decision: 'accepted' }, { decision: 'accepted' }]), 'completed');
            assert.equal(predictedOutcome([{ decision: 'accepted' }, { decision: 'rejected' }]), 'disputed');
        });
    });

    describe('buildSentenceState', () => {
        it('construye estado por frase desde anotaciones y correcciones previas', () => {
            const state = buildSentenceState(
                [
                    { sentenceIndex: 0, sentence: 'frase uno', origin: 'manual' },
                    { sentenceIndex: 1, sentence: 'frase dos', origin: 'edited' }
                ],
                [{ sentenceIndex: 1, correctedSentence: 'frase dos alternativa', comment: 'mejor' }]
            );

            assert.equal(state.length, 2);
            assert.equal(state[0].persistedCorrection, false);
            assert.equal(state[1].persistedCorrection, true);
            assert.equal(state[1].correctedSentence, 'frase dos alternativa');
        });
    });

    describe('requiresComment', () => {
        it('solo "rejected" ("No") exige comentario', () => {
            assert.equal(requiresComment('rejected'), true);
            assert.equal(requiresComment('accepted'), false);
            assert.equal(requiresComment(/** @type {any} */ (null)), false);
        });
    });

    describe('readDatasetIdFromLocation', () => {
        it('lee datasetId de la query string', () => {
            assert.equal(readDatasetIdFromLocation(/** @type {any} */ ({ search: '?datasetId=12' })), 12);
        });

        it('devuelve null sin datasetId valido (cola global)', () => {
            assert.equal(readDatasetIdFromLocation(/** @type {any} */ ({ search: '' })), null);
            assert.equal(readDatasetIdFromLocation(/** @type {any} */ ({ search: '?datasetId=0' })), null);
            assert.equal(readDatasetIdFromLocation(/** @type {any} */ ({ search: '?datasetId=abc' })), null);
            assert.equal(readDatasetIdFromLocation(/** @type {any} */ (null)), null);
        });
    });

    describe('messageFromResult', () => {
        it('extrae message o code del resultado', () => {
            assert.equal(messageFromResult({ data: { message: 'boom' } }), 'boom');
            assert.equal(messageFromResult({ data: { code: 'criterion_locked' } }), 'criterion_locked');
            assert.equal(messageFromResult({ status: 404, data: null }), 'HTTP 404');
            assert.equal(messageFromResult(null), 'Error desconocido');
        });
    });

    describe('escapeHtml', () => {
        it('escapa los caracteres peligrosos', () => {
            assert.equal(escapeHtml('<a href="x">"hi"</a>'), '&lt;a href=&quot;x&quot;&gt;&quot;hi&quot;&lt;/a&gt;');
            assert.equal(escapeHtml(null), '');
            assert.equal(escapeHtml(undefined), '');
            assert.equal(escapeHtml(5), '5');
        });
    });
});
