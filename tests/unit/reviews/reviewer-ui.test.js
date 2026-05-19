'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const ReviewerUI = require('../../../public/js/reviewer.js');
const {
    computeNextActiveCriterion,
    canFinalize,
    buildSentenceReviewState,
    canFinishSentenceReview,
    hasRejectedSentence,
    buildRejectedSentencesComment,
    requiresComment,
    isCriterionUnlocked,
    buildCriteriaState,
    escapeHtml
} = ReviewerUI;

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

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

    describe('computeNextActiveCriterion', () => {
        it('devuelve null si todos estan decididos', () => {
            const result = computeNextActiveCriterion([{ decided: true }, { decided: true }]);
            assert.equal(result, null);
        });

        it('devuelve el primer no decidido', () => {
            const result = computeNextActiveCriterion([
                { code: 'a', decided: true },
                { code: 'b', decided: false },
                { code: 'c', decided: false }
            ]);
            assert.equal(result.code, 'b');
        });

        it('soporta arrays vacios sin lanzar', () => {
            assert.equal(computeNextActiveCriterion([]), null);
            assert.equal(computeNextActiveCriterion(null), null);
        });
    });

    describe('canFinalize', () => {
        it('solo true cuando todos los criterios estan decididos', () => {
            assert.equal(canFinalize([{ decided: true }, { decided: true }]), true);
            assert.equal(canFinalize([{ decided: true }, { decided: false }]), false);
            assert.equal(canFinalize([]), false);
            assert.equal(canFinalize(null), false);
        });
    });

    describe('sentence review helpers', () => {
        it('construye estado de frases desde anotaciones y correcciones previas', () => {
            const state = buildSentenceReviewState(
                [
                    { sentenceIndex: 0, sentence: 'frase uno', origin: 'manual' },
                    { sentenceIndex: 1, sentence: 'frase dos', origin: 'llm' }
                ],
                [{ sentenceIndex: 1, correctedSentence: 'frase dos alternativa' }]
            );

            assert.equal(state.length, 2);
            assert.equal(state[0].decision, null);
            assert.equal(state[1].decision, 'rejected');
            assert.equal(state[1].alternative, 'frase dos alternativa');
        });

        it('solo permite terminar con todas las frases decididas y alternativas completas', () => {
            assert.equal(canFinishSentenceReview([]), false);
            assert.equal(canFinishSentenceReview([{ decision: 'accepted' }]), true);
            assert.equal(canFinishSentenceReview([{ decision: 'rejected', alternative: '' }]), false);
            assert.equal(canFinishSentenceReview([{ decision: 'rejected', alternative: 'otra frase' }]), true);
            assert.equal(canFinishSentenceReview([
                { decision: 'accepted' },
                { decision: null }
            ]), false);
        });

        it('resume las frases rechazadas para la decision global', () => {
            const state = [
                { sentenceIndex: 0, decision: 'accepted' },
                { sentenceIndex: 2, decision: 'rejected' }
            ];

            assert.equal(hasRejectedSentence(state), true);
            assert.equal(buildRejectedSentencesComment(state), 'Frases rechazadas: #2.');
        });
    });

    describe('requiresComment', () => {
        it('rejected y needs_fix exigen comentario', () => {
            assert.equal(requiresComment('rejected'), true);
            assert.equal(requiresComment('needs_fix'), true);
            assert.equal(requiresComment('accepted'), false);
            assert.equal(requiresComment(null), false);
        });
    });

    describe('isCriterionUnlocked', () => {
        it('el primero siempre esta desbloqueado', () => {
            const state = [{ code: 'a', decided: false }, { code: 'b', decided: false }];
            assert.equal(isCriterionUnlocked(state, 'a'), true);
            assert.equal(isCriterionUnlocked(state, 'b'), false);
        });

        it('un criterio se desbloquea cuando los anteriores estan decididos', () => {
            const state = [
                { code: 'a', decided: true },
                { code: 'b', decided: false },
                { code: 'c', decided: false }
            ];
            assert.equal(isCriterionUnlocked(state, 'b'), true);
            assert.equal(isCriterionUnlocked(state, 'c'), false);
        });

        it('codigo desconocido devuelve false', () => {
            assert.equal(isCriterionUnlocked([{ code: 'a', decided: false }], 'z'), false);
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
