'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createSpanishService } = require('../../../domain/spanish/spanish-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

const PUNJAB_TRIPLE = {
    subject: 'Punjab,_Pakistan',
    predicate: 'leaderTitle',
    object: 'Provincial_Assembly_of_the_Punjab'
};

const CONTEXT = {
    eid: 100,
    category: 'Place',
    triples: [PUNJAB_TRIPLE],
    sourceSentences: [null, null, null]
};

describe('spanish-service — "ejerce el liderazgo" regresion', () => {
    function makeService(/** @type {any[]} */ llmAlerts = []) {
        return createSpanishService({
            semanticChecker: {
                async checkBatch() {
                    return [{ valid: llmAlerts.length === 0, alerts: llmAlerts }];
                },
                async proposeCorrectionsBatch() { return [null]; }
            }
        });
    }

    it('no genera incomplete_sentence para "ejerce el liderazgo"', async () => {
        const service = makeService();
        const results = await service.checkBatch(
            ['La Asamblea Provincial del Punjab ejerce el liderazgo en Punjab, Pakistán.'],
            CONTEXT
        );
        const codes = results[0].alerts ? results[0].alerts.map((/** @type {*} */ a) => a.code) : [];
        assert.ok(
            !codes.includes('incomplete_sentence'),
            `No deberia haber incomplete_sentence. Alertas: ${JSON.stringify(codes)}`
        );
    });

    it('no genera relation_missing para "ejerce el liderazgo"', async () => {
        const service = makeService();
        const results = await service.checkBatch(
            ['La Asamblea Provincial del Punjab ejerce el liderazgo en Punjab, Pakistán.'],
            CONTEXT
        );
        const codes = results[0].alerts ? results[0].alerts.map((/** @type {*} */ a) => a.code) : [];
        assert.ok(
            !codes.includes('relation_missing'),
            `No deberia haber relation_missing. Alertas: ${JSON.stringify(codes)}`
        );
    });

    it('valida como correcta sin alertas de error cuando el LLM tambien la acepta', async () => {
        const service = makeService();
        const results = await service.checkBatch(
            ['La Asamblea Provincial del Punjab ejerce el liderazgo en Punjab, Pakistán.'],
            CONTEXT
        );
        assert.equal(results[0].valid, true);
        const errorAlerts = (results[0].alerts || []).filter((/** @type {*} */ a) => a.severity === 'error');
        assert.equal(errorAlerts.length, 0, `No deberia haber error alerts. Alertas: ${JSON.stringify(results[0].alerts)}`);
    });

    it('suprime rdf_error del LLM cuando la oracion cubre el triple con sinonimos validos', async () => {
        const service = makeService([{
            code: 'rdf_error',
            type: 'coverage',
            severity: 'error',
            source: 'llm',
            message: 'Error RDF: la verbalizacion del triple es incorrecta.'
        }]);
        const results = await service.checkBatch(
            ['La Asamblea Provincial del Punjab ejerce el liderazgo en Punjab, Pakistán.'],
            CONTEXT
        );
        const codes = (results[0].alerts || []).map((/** @type {*} */ a) => a.code);
        assert.ok(
            !codes.includes('rdf_error') || results[0].valid !== false,
            `rdf_error del LLM deberia suprimirse o no bloquear cuando la cobertura es correcta. Alertas: ${JSON.stringify(codes)}`
        );
    });

    it('reconoce "ejerce" como marcador de oracion completa', async () => {
        const service = makeService();
        const results = await service.checkBatch(
            ['La Asamblea Provincial del Punjab ejerce el liderazgo en Punjab, Pakistán.'],
            CONTEXT
        );
        const codes = (results[0].alerts || []).map((/** @type {*} */ a) => a.code);
        assert.ok(!codes.includes('incomplete_sentence'), `ejerce debe ser reconocido como verbo completo. Alertas: ${JSON.stringify(codes)}`);
    });

    it('sigue detectando errores reales: objeto cambiado en leaderTitle', async () => {
        const service = makeService([{
            code: 'semantic_mismatch',
            type: 'semantic',
            severity: 'error',
            source: 'llm',
            message: 'Error semántico: la traducción no refleja el significado del triple: objeto incorrecto'
        }]);
        const results = await service.checkBatch(
            ['La Asamblea Nacional de Pakistan gobierna Punjab.'],
            CONTEXT
        );
        assert.equal(results[0].valid, false, 'Una oracion con objeto incorrecto debe ser invalida');
    });
});
