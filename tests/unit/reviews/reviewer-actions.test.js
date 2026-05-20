'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const beforeEach = /** @type {Mocha.HookFunction} */ (globalThis.beforeEach || testApi.beforeEach);
const afterEach = /** @type {Mocha.HookFunction} */ (globalThis.afterEach || testApi.afterEach);

/**
 * Gets actions from the corresponding source.
 * @returns {*} Modulo actions recargado.
 */
function loadActions() {
    delete require.cache[require.resolve('../../../public/js/actions/reviewer-actions.js')];
    return require('../../../public/js/actions/reviewer-actions.js');
}

describe('reviewer-actions (T4.5)', () => {
    /** @type {any} */
    /** @type {any} */
    let originalFetch;
    /** @type {any[]} */
    const calls = [];

    beforeEach(() => {
        calls.length = 0;
        originalFetch = globalThis.fetch;
        globalThis.fetch = /** @type {any} */ (async (/** @type {*} */ url, /** @type {*} */ options = {}) => {
            calls.push({ url, options });
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ url, method: options.method || 'GET' })
            };
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('fetchNextReview hace POST a /api/reviews/request', async () => {
        const actions = loadActions();
        const result = await actions.fetchNextReview();
        assert.equal(calls[0].url, '/api/reviews/request');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(result.ok, true);
        assert.equal(result.status, 200);
    });

    it('fetchNextReview envia datasetId cuando se acota a dataset', async () => {
        const actions = loadActions();
        await actions.fetchNextReview(12);
        assert.equal(calls[0].url, '/api/reviews/request');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(calls[0].options.body), { datasetId: 12 });
    });

    it('fetchReviewContext hace GET con id en path', async () => {
        const actions = loadActions();
        await actions.fetchReviewContext(42);
        assert.equal(calls[0].url, '/api/reviews/42');
        assert.equal(calls[0].options.method, 'GET');
    });

    it('submitDecision serializa body como JSON', async () => {
        const actions = loadActions();
        await actions.submitDecision(7, { criterionCode: 'criterion_grammar', decision: 'accepted' });
        assert.equal(calls[0].url, '/api/reviews/7/decisions');
        assert.equal(calls[0].options.method, 'POST');
        assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
        const parsed = JSON.parse(calls[0].options.body);
        assert.equal(parsed.criterionCode, 'criterion_grammar');
    });

    it('submitCorrection apunta a /corrections', async () => {
        const actions = loadActions();
        await actions.submitCorrection(7, { sentenceIndex: 0, correctedSentence: 'foo', comment: 'fix' });
        assert.equal(calls[0].url, '/api/reviews/7/corrections');
    });

    it('finalizeReview y releaseReview hacen POST', async () => {
        const actions = loadActions();
        await actions.finalizeReview(7);
        assert.equal(calls[0].url, '/api/reviews/7/finalize');
        assert.equal(calls[0].options.method, 'POST');

        await actions.releaseReview(7);
        assert.equal(calls[1].url, '/api/reviews/7/release');
        assert.equal(calls[1].options.method, 'POST');
    });
});
