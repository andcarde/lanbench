'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSpanishService } = require('../business/spanish-service');

const describe = global.describe || testApi.describe;
const it = global.it || testApi.it;

describe('spanish-service persistence', () => {
    it('save persiste anotaciones ligadas a entry y user mediante el repositorio', async () => {
        const capturedCalls = [];
        const spanishService = createSpanishService({
            annotationsRepository: {
                async replaceForAccessibleEntry(payload) {
                    capturedCalls.push(payload);
                    return { idEntry: 44, savedCount: 2 };
                }
            }
        });

        const result = await spanishService.save({
            idUser: 8,
            idDataset: 3,
            rdfId: 12,
            sentences: ['Primera.', 'Segunda.'],
            rejectionReasons: [null, 'Motivo']
        });

        assert.deepEqual(result, {
            ok: true,
            idDataset: 3,
            rdfId: 12,
            savedCount: 2
        });
        assert.deepEqual(capturedCalls, [{
            idUser: 8,
            idDataset: 3,
            eid: 12,
            sentences: [
                { sentenceIndex: 0, sentence: 'Primera.', rejectionReason: null },
                { sentenceIndex: 1, sentence: 'Segunda.', rejectionReason: 'Motivo' }
            ]
        }]);
    });
});
