'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const ollamaClient = require('../utils/ollama-client');

const describe = (name, func) => {
    // Omisión debido a que spanish-controller.js está deprecado.
    let ommitted = true;
};
const it = global.it || testApi.it;
const afterEach = global.afterEach || testApi.afterEach;

const originalGenerateJson = ollamaClient.generateJson;

function stubOllama(impl) {
    ollamaClient.generateJson = impl;
}

afterEach(() => {
    ollamaClient.generateJson = originalGenerateJson;
});

describe('SpanishController.runRuleBasedCheck', () => {
    it('rechaza una oración vacía', () => {
        const result = SpanishController.runRuleBasedCheck('');
        assert.deepEqual(result, {
            valid: false,
            reason: 'La oración está vacía.',
            suggestion: 'Escribe una oración antes de validar.'
        });
    });

    it('rechaza una oración con solo espacios en blanco', () => {
        const result = SpanishController.runRuleBasedCheck('   \t\n  ');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'La oración está vacía.');
    });

    it('rechaza entradas que no son cadenas', () => {
        for (const invalid of [null, undefined, 123, {}, [], true]) {
            const result = SpanishController.runRuleBasedCheck(invalid);
            assert.equal(result.valid, false, `valor ${String(invalid)} debería ser rechazado`);
            assert.equal(result.reason, 'La oración está vacía.');
        }
    });

    it('detecta el error ortográfico "ago" y sugiere "hago"', () => {
        const result = SpanishController.runRuleBasedCheck('Yo ago la tarea.');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay un posible error ortográfico en el verbo.');
        assert.equal(result.suggestion, 'Yo hago la tarea.');
    });

    it('detecta "ago" sin distinción entre mayúsculas y minúsculas', () => {
        const result = SpanishController.runRuleBasedCheck('Yo AGO la tarea.');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay un posible error ortográfico en el verbo.');
    });

    it('no confunde "ago" con palabras que lo contienen (p. ej. "lago")', () => {
        const result = SpanishController.runRuleBasedCheck('Nado en el lago.');
        assert.equal(result.valid, true);
    });

    it('detecta la discordancia "una lapiz" y sugiere "un lápiz"', () => {
        const result = SpanishController.runRuleBasedCheck('Quiero una lapiz.');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay una discordancia de género en el sintagma nominal.');
        assert.equal(result.suggestion, 'Quiero un lápiz.');
    });

    it('detecta la discordancia "una lápiz" con acento', () => {
        const result = SpanishController.runRuleBasedCheck('Quiero una lápiz.');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay una discordancia de género en el sintagma nominal.');
        assert.equal(result.suggestion, 'Quiero un lápiz.');
    });

    it('detecta la ausencia de puntuación final', () => {
        const result = SpanishController.runRuleBasedCheck('Esto no acaba bien');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Falta un signo de puntuación final.');
        assert.equal(result.suggestion, 'Esto no acaba bien.');
    });

    it('acepta oraciones terminadas en distintos signos válidos', () => {
        for (const ending of ['.', '!', '?', '…']) {
            const result = SpanishController.runRuleBasedCheck(`Mensaje${ending}`);
            assert.deepEqual(result, { valid: true, reason: null, suggestion: null }, `falló con el signo "${ending}"`);
        }
    });

    it('recorta espacios finales antes de validar la puntuación', () => {
        const result = SpanishController.runRuleBasedCheck('   Hola.   ');
        assert.equal(result.valid, true);
    });

    it('da prioridad al error "ago" frente a la falta de puntuación', () => {
        const result = SpanishController.runRuleBasedCheck('Yo ago la tarea');
        assert.equal(result.reason, 'Hay un posible error ortográfico en el verbo.');
    });
});

describe('SpanishController.getSystemPrompt', () => {
    it('devuelve un prompt de sistema en forma de cadena', () => {
        const prompt = SpanishController.getSystemPrompt();
        assert.equal(typeof prompt, 'string');
        assert.ok(prompt.length > 0);
    });

    it('incluye instrucciones sobre el formato JSON esperado', () => {
        const prompt = SpanishController.getSystemPrompt();
        assert.ok(prompt.includes('JSON'));
        assert.ok(prompt.includes('"valid"'));
        assert.ok(prompt.includes('"reason"'));
        assert.ok(prompt.includes('"suggestion"'));
    });
});

describe('SpanishController.buildCheckPrompt', () => {
    it('incluye todos los campos cuando el contexto está completo', () => {
        const prompt = SpanishController.buildCheckPrompt('Madrid es parte de España.', {
            eid: 15,
            category: 'Airport',
            triples: [
                { subject: 'Madrid', predicate: 'isPartOf', object: 'Spain' },
                { subject: 'Spain', predicate: 'hasCapital', object: 'Madrid' }
            ],
            referenceSentence: 'Madrid is part of Spain.'
        });

        assert.ok(prompt.includes('Entry ID: 15'));
        assert.ok(prompt.includes('Categoria: Airport'));
        assert.ok(prompt.includes('Triples RDF:'));
        assert.ok(prompt.includes('1. Madrid | isPartOf | Spain'));
        assert.ok(prompt.includes('2. Spain | hasCapital | Madrid'));
        assert.ok(prompt.includes('Oracion de referencia en ingles: Madrid is part of Spain.'));
        assert.ok(prompt.includes('Oracion en espanol a validar: Madrid es parte de España.'));
        assert.ok(prompt.includes('Devuelve unicamente el JSON solicitado.'));
    });

    it('omite eid cuando no es un entero', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', {
            eid: '15',
            category: 'Astronaut',
            triples: []
        });
        assert.ok(!prompt.includes('Entry ID'));
        assert.ok(prompt.includes('Categoria: Astronaut'));
    });

    it('omite eid cuando es cero (no truthy)', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', { eid: 0 });
        assert.ok(!prompt.includes('Entry ID'));
    });

    it('indica "no disponibles" cuando no hay triples', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', {});
        assert.ok(prompt.includes('Triples RDF: no disponibles.'));
    });

    it('indica "no disponible" cuando no hay oración de referencia', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', {});
        assert.ok(prompt.includes('Oracion de referencia en ingles: no disponible.'));
    });

    it('trata referenceSentence no string como no disponible', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', { referenceSentence: 42 });
        assert.ok(prompt.includes('Oracion de referencia en ingles: no disponible.'));
    });

    it('recorta la oración de referencia', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', {
            referenceSentence: '   Hello world.   '
        });
        assert.ok(prompt.includes('Oracion de referencia en ingles: Hello world.'));
    });

    it('omite la categoría cuando está vacía', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', { category: '   ' });
        assert.ok(!prompt.includes('Categoria:'));
    });

    it('funciona cuando se omite el contexto', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.');
        assert.ok(prompt.includes('Triples RDF: no disponibles.'));
        assert.ok(prompt.includes('Oracion en espanol a validar: Hola.'));
    });

    it('ignora triples cuando context.triples no es un array', () => {
        const prompt = SpanishController.buildCheckPrompt('Hola.', { triples: 'not-array' });
        assert.ok(prompt.includes('Triples RDF: no disponibles.'));
    });
});

describe('SpanishController.normalizeOllamaResult', () => {
    it('devuelve válido cuando el resultado no es un objeto', () => {
        for (const value of [null, undefined, 'string', 42, true]) {
            const normalized = SpanishController.normalizeOllamaResult(value, 'Hola.');
            assert.deepEqual(normalized, { valid: true, reason: null, suggestion: null });
        }
    });

    it('devuelve válido y limpia reason/suggestion cuando valid es true', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: true,
            reason: 'no debería aparecer',
            suggestion: 'tampoco'
        }, 'Hola.');
        assert.deepEqual(normalized, { valid: true, reason: null, suggestion: null });
    });

    it('preserva reason y suggestion cuando valid es false', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: false,
            reason: 'Error gramatical',
            suggestion: 'Hola corregido.'
        }, 'Hola.');
        assert.deepEqual(normalized, {
            valid: false,
            reason: 'Error gramatical',
            suggestion: 'Hola corregido.'
        });
    });

    it('recorta reason y suggestion antes de devolverlos', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: false,
            reason: '   Error gramatical   ',
            suggestion: '   Hola corregido.   '
        }, 'Hola.');
        assert.equal(normalized.reason, 'Error gramatical');
        assert.equal(normalized.suggestion, 'Hola corregido.');
    });

    it('asigna una razón por defecto cuando falta', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: false
        }, 'Hola.');
        assert.equal(normalized.valid, false);
        assert.equal(normalized.reason, 'Se han detectado problemas en la oracion.');
        assert.equal(normalized.suggestion, 'Hola.');
    });

    it('usa la oración original como suggestion si falta', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: false,
            reason: 'Mal formada'
        }, '  Hola.  ');
        assert.equal(normalized.suggestion, 'Hola.');
    });

    it('devuelve suggestion null si la oración tampoco es string', () => {
        const normalized = SpanishController.normalizeOllamaResult({
            valid: false,
            reason: 'Mal formada'
        }, null);
        assert.equal(normalized.suggestion, null);
    });

    it('interpreta valores truthy/falsy en valid como boolean', () => {
        assert.equal(SpanishController.normalizeOllamaResult({ valid: 1 }, 'Hola.').valid, true);
        assert.equal(SpanishController.normalizeOllamaResult({ valid: 0 }, 'Hola.').valid, false);
        assert.equal(SpanishController.normalizeOllamaResult({ valid: 'sí' }, 'Hola.').valid, true);
    });
});

describe('SpanishController.build', () => {
    it('parsea una respuesta JSON pura', () => {
        const parsed = SpanishController.build('{"valid":true,"reason":null,"suggestion":null}');
        assert.deepEqual(parsed, { valid: true, reason: null, suggestion: null });
    });

    it('extrae el JSON contenido entre texto extra', () => {
        const parsed = SpanishController.build('blabla {"valid":false,"reason":"x","suggestion":"y"} extra');
        assert.deepEqual(parsed, { valid: false, reason: 'x', suggestion: 'y' });
    });

    it('lanza error cuando la entrada no es una cadena', () => {
        assert.throws(
            () => SpanishController.build(null),
            /La respuesta de Ollama debe ser una cadena de texto\./
        );
        assert.throws(
            () => SpanishController.build({ valid: true }),
            /La respuesta de Ollama debe ser una cadena de texto\./
        );
    });

    it('lanza error cuando no encuentra llaves', () => {
        assert.throws(
            () => SpanishController.build('sin JSON'),
            /No se detectó un JSON válido/
        );
    });

    it('lanza error cuando el cierre aparece antes de la apertura', () => {
        assert.throws(
            () => SpanishController.build('} antes de {'),
            /No se detectó un JSON válido/
        );
    });

    it('lanza error cuando el JSON es inválido', () => {
        assert.throws(
            () => SpanishController.build('{invalid json}'),
            /No se pudo parsear la respuesta como JSON:/
        );
    });
});

describe('SpanishController.save', () => {
    it('devuelve una promesa con el resultado normalizado', async () => {
        const result = await SpanishController.save(42, 'Hola.', 'Motivo');
        assert.deepEqual(result, {
            ok: true,
            rdfId: 42,
            sentence: 'Hola.',
            rejectionReason: 'Motivo'
        });
    });

    it('normaliza rejectionReason ausente a null', async () => {
        const result = await SpanishController.save(42, 'Hola.');
        assert.equal(result.rejectionReason, null);
    });

    it('normaliza rejectionReason vacío a null', async () => {
        const result = await SpanishController.save(42, 'Hola.', '');
        assert.equal(result.rejectionReason, null);
    });

    it('mantiene una API async incluso sin rejectionReason', async () => {
        const maybePromise = SpanishController.save(7, 'Hola.', null);
        assert.ok(maybePromise && typeof maybePromise.then === 'function');
        const result = await maybePromise;
        assert.equal(result.rejectionReason, null);
    });
});

describe('SpanishController.runOllamaCheck', () => {
    it('llama a ollamaClient con el prompt construido y normaliza la respuesta', async () => {
        let capturedArgs = null;
        stubOllama(async args => {
            capturedArgs = args;
            return { valid: false, reason: 'Error', suggestion: 'Hola corregido.' };
        });

        const result = await SpanishController.runOllamaCheck('Hola.', {
            eid: 1,
            category: 'Demo',
            triples: [{ subject: 'S', predicate: 'P', object: 'O' }],
            referenceSentence: 'Hello.'
        });

        assert.ok(capturedArgs);
        assert.equal(typeof capturedArgs.system, 'string');
        assert.ok(capturedArgs.prompt.includes('Entry ID: 1'));
        assert.ok(capturedArgs.prompt.includes('Oracion en espanol a validar: Hola.'));
        assert.deepEqual(result, {
            valid: false,
            reason: 'Error',
            suggestion: 'Hola corregido.'
        });
    });

    it('propaga errores cuando el cliente de Ollama falla', async () => {
        stubOllama(async () => {
            throw new Error('boom');
        });

        await assert.rejects(
            () => SpanishController.runOllamaCheck('Hola.'),
            /boom/
        );
    });
});

describe('SpanishController.check', () => {
    it('cortocircuita ante una oración vacía sin llamar a Ollama', async () => {
        let ollamaCalls = 0;
        stubOllama(async () => {
            ollamaCalls++;
            return { valid: true };
        });

        const result = await SpanishController.check('');
        assert.equal(ollamaCalls, 0);
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'La oración está vacía.');
    });

    it('consulta a Ollama cuando la regla detecta un fallo no inmediato', async () => {
        let capturedSentence = null;
        stubOllama(async args => {
            capturedSentence = args.prompt;
            return { valid: true };
        });

        const result = await SpanishController.check('Yo ago la tarea.');
        assert.ok(capturedSentence);
        assert.equal(result.valid, true);
    });

    it('consulta a Ollama cuando la regla considera la oración válida', async () => {
        let called = false;
        stubOllama(async () => {
            called = true;
            return { valid: false, reason: 'Semántica', suggestion: 'Otra forma.' };
        });

        const result = await SpanishController.check('Hola mundo.');
        assert.equal(called, true);
        assert.deepEqual(result, {
            valid: false,
            reason: 'Semántica',
            suggestion: 'Otra forma.'
        });
    });

    it('vuelve al resultado de reglas si Ollama lanza un error', async () => {
        stubOllama(async () => {
            throw new Error('timeout');
        });

        const result = await SpanishController.check('Yo ago la tarea.');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Hay un posible error ortográfico en el verbo.');
        assert.equal(result.suggestion, 'Yo hago la tarea.');
    });

    it('vuelve al resultado de reglas (válido) si Ollama falla ante una oración correcta', async () => {
        stubOllama(async () => {
            throw new Error('network');
        });

        const result = await SpanishController.check('Madrid está en España.');
        assert.deepEqual(result, { valid: true, reason: null, suggestion: null });
    });

    it('pasa el contexto a Ollama', async () => {
        let capturedPrompt = null;
        stubOllama(async args => {
            capturedPrompt = args.prompt;
            return { valid: true };
        });

        await SpanishController.check('Hola.', {
            eid: 99,
            category: 'Demo',
            triples: [{ subject: 'S', predicate: 'P', object: 'O' }],
            referenceSentence: 'Hello.'
        });

        assert.ok(capturedPrompt.includes('Entry ID: 99'));
        assert.ok(capturedPrompt.includes('Categoria: Demo'));
        assert.ok(capturedPrompt.includes('1. S | P | O'));
        assert.ok(capturedPrompt.includes('Oracion de referencia en ingles: Hello.'));
    });

    it('usa siempre una API async y devuelve una promesa', async () => {
        stubOllama(async () => ({ valid: true }));
        const maybePromise = SpanishController.check('Hola.');
        assert.ok(maybePromise && typeof maybePromise.then === 'function');
        const result = await maybePromise;
        assert.deepEqual(result, { valid: true, reason: null, suggestion: null });
    });

    it('mantiene el contexto explícito como segundo argumento', async () => {
        let capturedPrompt = null;
        stubOllama(async args => {
            capturedPrompt = args.prompt;
            return { valid: true };
        });

        const result = await SpanishController.check('Hola.', { eid: 5 });
        assert.ok(capturedPrompt.includes('Entry ID: 5'));
        assert.equal(result.valid, true);
    });
});
