// @ts-nocheck — proxyquire no instalado y chai 6 sin tipos publicados; pendiente del pase de fixing tests.
const { expect } = require('chai');
const td = require('testdouble');
const proxyquire = require('proxyquire').noCallThru();

describe('ollama-spanish-checker', () => {
  /** @type {any} */
  /** @type {any} */
  let checker;
  /** @type {any} */
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

  describe('getSystemPrompt', () => {
    it('debe devolver el prompt del sistema', () => {
      const prompt = checker.getSystemPrompt();
      expect(prompt).to.include('Eres un revisor experto');
      expect(prompt).to.include('"valid":boolean');
    });

    it('debe devolver el prompt de lote con validations', () => {
      const prompt = checker.getBatchSystemPrompt();
      expect(prompt).to.include('"validations"');
      expect(prompt).to.include('sentenceIndex');
      expect(prompt).to.include('esta en ingles');
    });

    it('debe devolver el prompt de propuestas con proposals', () => {
      const prompt = checker.getCorrectionProposalSystemPrompt();
      expect(prompt).to.include('"proposals"');
      expect(prompt).to.include('sentenceIndex');
      expect(prompt).to.include('propuesta corregida');
    });
  });

  describe('buildCheckPrompt', () => {
    it('genera prompt con todos los campos', () => {
      const prompt = checker.buildCheckPrompt('Hola', {
        triples: [{ subject: 'A', predicate: 'B', object: 'C' }],
        referenceSentence: 'Hello',
        category: 'test',
        eid: 1
      });
      expect(prompt).to.include('Entry ID: 1');
      expect(prompt).to.include('Categoria: test');
      expect(prompt).to.include('Triples RDF');
      expect(prompt).to.include('Oracion de referencia en ingles: Hello');
      expect(prompt).to.include('Oracion en espanol a validar: Hola');
    });

    it('genera prompt con campos mínimos', () => {
      const prompt = checker.buildCheckPrompt('Hola', {});
      expect(prompt).to.include('Triples RDF: no disponibles.');
      expect(prompt).to.include('Oracion de referencia en ingles: no disponible.');
    });

    it('genera prompt de lote con indices, referencias y triples', () => {
      const prompt = checker.buildBatchCheckPrompt(['Uno.', 'Dos.'], {
        eid: 9,
        category: 'Book',
        sourceSentences: ['One.', 'Two.'],
        triples: [{ subject: 'A', predicate: 'author', object: 'B' }]
      });

      expect(prompt).to.include('Indices obligatorios: 0, 1');
      expect(prompt).to.include('"entryId": 9');
      expect(prompt).to.include('"category": "Book"');
      expect(prompt).to.include('"predicate": "author"');
      expect(prompt).to.include('"english": "One."');
      expect(prompt).to.include('"spanishCandidate": "Uno."');
      expect(prompt).to.include('"referenceAvailable": true');
    });

    it('genera prompt de propuesta solo para validaciones rechazadas', () => {
      const prompt = checker.buildCorrectionProposalPrompt(['Mal', 'Bien.'], {
        eid: 9,
        category: 'Place',
        sourceSentences: ['Bad.', 'Good.'],
        triples: [{ subject: 'Madrid', predicate: 'country', object: 'Spain' }]
      }, [
        {
          valid: false,
          reason: 'Objeto incorrecto.',
          alerts: [{ code: 'semantic_mismatch', severity: 'error', message: 'Objeto incorrecto.' }]
        },
        { valid: true, reason: null, suggestion: null }
      ]);

      expect(prompt).to.include('Indices que necesitan propuesta: 0');
      expect(prompt).to.include('"spanishCandidate": "Mal"');
      expect(prompt).to.include('"englishReference": "Bad."');
      expect(prompt).not.to.include('"spanishCandidate": "Bien."');
    });
  });

  describe('normalizeOllamaResult', () => {
    it('devuelve válido si el resultado es válido', () => {
      const result = checker.normalizeOllamaResult({ valid: true }, 'Hola');
      expect(result).to.deep.equal({ valid: true, reason: null, suggestion: null });
    });

    it('devuelve inválido con razón y sugerencia', () => {
      const result = checker.normalizeOllamaResult(
        { valid: false, reason: 'Error', suggestion: 'Hola corregido' },
        'Hola'
      );
      expect(result).to.deep.equal({
        valid: false,
        reason: 'Error',
        suggestion: 'Hola corregido'
      });
    });

    it('rellena valores por defecto si faltan campos', () => {
      const result = checker.normalizeOllamaResult({}, 'Hola');
      expect(result).to.deep.equal({ valid: true, reason: null, suggestion: null });
    });

    it('normaliza validaciones de lote con alertas', () => {
      const result = checker.normalizeBatchOllamaResult({
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
          {
            sentenceIndex: 1,
            valid: true,
            alerts: []
          }
        ]
      }, ['Microsoft was founded by Bill Gates.', 'Microsoft fue fundada por Bill Gates.']);

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

    it('normaliza propuestas de correccion por indice', () => {
      const result = checker.normalizeCorrectionProposalResult({
        proposals: [
          { sentenceIndex: 1, proposal: 'Madrid esta en Espana.' }
        ]
      }, ['Uno.', 'Madrid esta en Francia.']);

      expect(result).to.deep.equal([null, 'Madrid esta en Espana.']);
    });
  });

  describe('parseRawResponse', () => {
    it('parsea un JSON válido', () => {
      const json = '{"valid":true,"reason":null,"suggestion":null}';
      const parsed = checker.parseRawResponse(json);
      expect(parsed).to.deep.equal({ valid: true, reason: null, suggestion: null });
    });

    it('lanza error si no hay JSON', () => {
      expect(() => checker.parseRawResponse('sin json')).to.throw();
    });

    it('lanza error si el JSON es inválido', () => {
      expect(() => checker.parseRawResponse('{invalid json}')).to.throw();
    });
  });

  describe('check', () => {
    it('devuelve el resultado normalizado', async () => {
      td.when(ollamaClientMock.generateJson(td.matchers.anything())).thenResolve({ valid: false, reason: 'Error', suggestion: 'Corregido' });
      const result = await checker.check('Hola', {});
      expect(result).to.deep.equal({
        valid: false,
        reason: 'Error',
        suggestion: 'Corregido'
      });
    });

    it('checkBatch llama a Ollama una sola vez y normaliza por indice', async () => {
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
        sourceSentences: ['Madrid is in Spain.', 'Madrid is in Spain.']
      });

      expect(result).to.have.length(2);
      expect(result[0].valid).to.equal(true);
      expect(result[1].valid).to.equal(false);
      expect(result[1].reason).to.equal('Error semántico: la traducción no refleja el significado del triple: Objeto incorrecto.');
      td.verify(ollamaClientMock.generateJson(td.matchers.anything()), { times: 1 });
    });

    it('proposeCorrectionsBatch llama a Ollama y devuelve propuestas por indice', async () => {
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
  });
});
