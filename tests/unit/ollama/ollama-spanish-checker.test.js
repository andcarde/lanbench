// @ts-nocheck — chai 6 without published types; pending the test-fixing pass.

/**
 * @file Contract tests for `ollama-spanish-checker`. Asserts only on the
 * three public surfaces (`check`, `checkBatch`, `proposeCorrectionsBatch`)
 * — the LLM call is mocked at the `ollamaClient` boundary. Internal
 * helpers (prompt builders, response normalisers, JSON parser) are no
 * longer exported and no longer tested directly: refactoring prompts or
 * normalisation logic must keep these contract tests green, but the tests
 * themselves don't pin the prompt text.
 */

const { expect } = require('chai');
const td = require('testdouble');
const proxyquire = require('proxyquire').noCallThru();

describe('ollama-spanish-checker', () => {
  /** @type {any} */
  let checker;
  /** @type {any} */
  let ollamaClientMock;

  beforeEach(() => {
    ollamaClientMock = {
      generateJson: td.function()
    };
    checker = proxyquire('../../../domain/spanish/ollama-spanish-checker', {
      '../../utils/llm-client': ollamaClientMock,
      '../../../utils/llm-client': ollamaClientMock
    });
  });

  afterEach(() => {
    td.reset();
  });

  describe('check', () => {
    it('devuelve el resultado normalizado a partir del JSON del LLM', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.anything())).thenResolve({
        valid: false,
        reason: 'Error',
        suggestion: 'Corregido'
      });
      const result = await checker.check('Hola', {});
      expect(result).to.deep.equal({
        valid: false,
        reason: 'Error',
        suggestion: 'Corregido'
      });
    });

    it('rellena valores por defecto si el LLM devuelve un payload vacío', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.anything())).thenResolve({});
      const result = await checker.check('Hola', {});
      expect(result).to.deep.equal({ valid: true, reason: null, suggestion: null });
    });
  });

  describe('checkBatch', () => {
    it('llama a Ollama una sola vez y normaliza el resultado por sentenceIndex', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.contains({
        system: td.matchers.isA(String),
        prompt: td.matchers.isA(String)
      }))).thenResolve({
        validations: [
          { sentenceIndex: 0, valid: true, alerts: [] },
          {
            sentenceIndex: 1,
            valid: false,
            alerts: [{
              code: 'semantic_mismatch',
              type: 'semantic',
              severity: 'error',
              message: 'Objeto incorrecto.',
              suggestion: 'Madrid esta en Espana.'
            }]
          }
        ]
      });

      const result = await checker.checkBatch(['Madrid esta en Espana.', 'Madrid esta en Francia.'], {
        triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }],
        englishSentences: ['Madrid is in Spain.', 'Madrid is in Spain.']
      });

      expect(result).to.have.length(2);
      expect(result[0].valid).to.equal(true);
      expect(result[1].valid).to.equal(false);
      expect(result[1].reason).to.equal('Error semántico: la traducción no refleja el significado del triple: Objeto incorrecto.');
      td.verify(ollamaClientMock.generateJson(td.matchers.anything()), { times: 1 });
    });

    it('marca como inválida una oración cuyo alert lleve language_not_spanish', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.anything())).thenResolve({
        validations: [
          {
            sentenceIndex: 0,
            valid: false,
            alerts: [{
              code: 'language_not_spanish',
              type: 'grammar',
              severity: 'error',
              message: 'La frase esta en ingles.',
              suggestion: 'Microsoft fue fundada por Bill Gates.'
            }]
          },
          { sentenceIndex: 1, valid: true, alerts: [] }
        ]
      });

      const result = await checker.checkBatch(
        ['Microsoft was founded by Bill Gates.', 'Microsoft fue fundada por Bill Gates.'],
        {}
      );

      const expectedMessage = 'La oración no está escrita en español: La frase esta en ingles.';
      expect(result[0].valid).to.equal(false);
      expect(result[0].reason).to.equal(expectedMessage);
      expect(result[0].alerts[0]).to.include({
        code: 'language_not_spanish',
        type: 'grammar',
        severity: 'error',
        source: 'llm',
        message: expectedMessage
      });
      expect(result[1]).to.deep.equal({ valid: true, reason: null, suggestion: null });
    });
  });

  describe('proposeCorrectionsBatch', () => {
    it('devuelve propuestas por sentenceIndex', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.contains({
        system: td.matchers.isA(String),
        prompt: td.matchers.isA(String)
      }))).thenResolve({
        proposals: [
          { sentenceIndex: 0, proposal: 'Madrid esta en Espana.' }
        ]
      });

      const result = await checker.proposeCorrectionsBatch(['Madrid esta en Francia.'], {
        triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }]
      }, [
        { valid: false, reason: 'Objeto incorrecto.' }
      ]);

      expect(result).to.deep.equal(['Madrid esta en Espana.']);
      td.verify(ollamaClientMock.generateJson(td.matchers.anything()), { times: 1 });
    });

    it('no llama al LLM cuando no hay validaciones inválidas y devuelve null por slot', async () => {
      const result = await checker.proposeCorrectionsBatch(
        ['Madrid esta en Espana.'],
        {},
        [{ valid: true, reason: null }]
      );

      expect(result).to.deep.equal([null]);
      td.verify(ollamaClientMock.generateJson(td.matchers.anything()), { times: 0, ignoreExtraArgs: true });
    });
  });
});
