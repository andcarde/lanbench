'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createAnnotationsService } = require('../../../services/annotations-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const ENTRY_CONTEXT = /** @type {import('../../../types/typedefs').EntryContextDTO} */ ({
    entryId: 16,
    category: 'Company',
    triples: [{ subject: 'Microsoft', predicate: 'founder', object: 'Bill_Gates' }],
    englishSentences: ['Microsoft was founded by Bill Gates.']
});

/**
 * Builds a spanishService spy that records the context passed to checkBatch.
 * @param {any[]} sink - Records the context.
 * @returns {Record<string, any>}
 */
function spanishServiceSpy(sink) {
    return {
        async checkBatch(/** @type {*} */ _sentences, /** @type {*} */ context) { sink.push(context); return [{ valid: true }]; },
        async save() { throw new Error('not used'); }
    };
}

describe('annotations-service credential propagation (T6)', () => {
    it('injects providerConfig into the check context when the dataset has an active credential', async () => {
        /** @type {any[]} */
        const contexts = [];
        const providerConfig = { provider: 'groq', apiBase: null, model: 'llama', apiKey: 'k' };
        const service = createAnnotationsService({
            spanishService: spanishServiceSpy(contexts),
            datasetsPermissionsRepository: { async findPermitForUser() { return { isAnnotator: true }; } },
            datasetLlmCredentialsService: { async resolveActiveProviderConfig() { return providerConfig; } }
        });

        await service.checkSentences(['Microsoft fue fundada por Bill Gates.'], ENTRY_CONTEXT, { userId: 7, datasetId: 3 });

        assert.deepEqual(contexts[0].providerConfig, providerConfig);
        assert.equal(contexts[0].entryId, 16);
    });

    it('does not inject providerConfig when no datasetId is given (legacy global behaviour)', async () => {
        /** @type {any[]} */
        const contexts = [];
        const service = createAnnotationsService({
            spanishService: spanishServiceSpy(contexts),
            datasetsPermissionsRepository: { async findPermitForUser() { throw new Error('should not be called'); } },
            datasetLlmCredentialsService: { async resolveActiveProviderConfig() { throw new Error('should not be called'); } }
        });

        await service.checkSentences(['Una frase.'], ENTRY_CONTEXT);

        assert.equal('providerConfig' in contexts[0], false);
    });

    it('does not inject providerConfig when the dataset has no active credential', async () => {
        /** @type {any[]} */
        const contexts = [];
        const service = createAnnotationsService({
            spanishService: spanishServiceSpy(contexts),
            datasetsPermissionsRepository: { async findPermitForUser() { return { isAnnotator: true }; } },
            datasetLlmCredentialsService: { async resolveActiveProviderConfig() { return null; } }
        });

        await service.checkSentences(['Una frase.'], ENTRY_CONTEXT, { userId: 7, datasetId: 3 });

        assert.equal('providerConfig' in contexts[0], false);
    });

    it('degrades to the global provider (no throw) when credential resolution fails, but only after access is granted', async () => {
        /** @type {any[]} */
        const contexts = [];
        const service = createAnnotationsService({
            spanishService: spanishServiceSpy(contexts),
            datasetsPermissionsRepository: { async findPermitForUser() { return { isAnnotator: true }; } },
            datasetLlmCredentialsService: { async resolveActiveProviderConfig() { throw new Error('dataset_llm_credentials table missing'); } }
        });

        const result = await service.checkSentences(['Una frase.'], ENTRY_CONTEXT, { userId: 7, datasetId: 3 });

        assert.equal(Array.isArray(result), true);
        assert.equal('providerConfig' in contexts[0], false);
    });

    it('rejects when the user has no access to the requested dataset, without calling the checker', async () => {
        /** @type {any[]} */
        const contexts = [];
        let resolveCalled = false;
        const service = createAnnotationsService({
            spanishService: spanishServiceSpy(contexts),
            datasetsPermissionsRepository: { async findPermitForUser() { return null; } },
            datasetLlmCredentialsService: { async resolveActiveProviderConfig() { resolveCalled = true; return null; } }
        });

        await assert.rejects(
            () => service.checkSentences(['Una frase.'], ENTRY_CONTEXT, { userId: 7, datasetId: 999 }),
            (/** @type {any} */ error) => {
                assert.equal(error.status, 404);
                assert.equal(error.code, 'dataset_not_found');
                return true;
            }
        );

        assert.equal(contexts.length, 0, 'the semantic checker must not run');
        assert.equal(resolveCalled, false, 'the credential must not be resolved for an inaccessible dataset');
    });
});
