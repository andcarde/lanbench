const { expect } = require('chai');
const td = require('testdouble');
const proxyquire = require('proxyquire').noCallThru();

describe('ollama-spanish-checker', () => {
  let checker;
  let ollamaClientMock;

  beforeEach(() => {
    ollamaClientMock = {
      generateJson: td.function()
    };
    checker = proxyquire('../business/ollama-spanish-checker', {
      '../utils/ollama-client': ollamaClientMock
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
  });
});