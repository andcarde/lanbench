'use strict';

const ollamaClient = require('../utils/ollama-client');

async function check(sentence, context = {}) {
    const prompt = buildCheckPrompt(sentence, context);
    const response = await ollamaClient.generateJson({
        system: getSystemPrompt(),
        prompt
    });

    return normalizeOllamaResult(response, sentence);
}

function getSystemPrompt() {
    return [
        'Eres un revisor experto de oraciones en espanol para un benchmark RDF.',
        'Debes revisar ortografia, gramatica, puntuacion y adecuacion semantica respecto a los triples y la frase inglesa de referencia.',
        'Responde SOLO en JSON con este formato exacto:',
        '{"valid":boolean,"reason":string|null,"suggestion":string|null}',
        'Si la oracion es correcta, usa {"valid":true,"reason":null,"suggestion":null}.',
        'Si no es correcta, explica el problema en "reason" y devuelve en "suggestion" una version corregida en espanol.'
    ].join('\n');
}

function buildCheckPrompt(sentence, context = {}) {
    const triples = Array.isArray(context.triples) ? context.triples : [];
    const referenceSentence = typeof context.referenceSentence === 'string'
        ? context.referenceSentence.trim()
        : '';
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const eid = Number.isInteger(context.eid) ? context.eid : null;

    return [
        eid ? `Entry ID: ${eid}` : null,
        category ? `Categoria: ${category}` : null,
        triples.length
            ? `Triples RDF:\n${triples.map((triple, index) => `${index + 1}. ${triple.subject} | ${triple.predicate} | ${triple.object}`).join('\n')}`
            : 'Triples RDF: no disponibles.',
        referenceSentence
            ? `Oracion de referencia en ingles: ${referenceSentence}`
            : 'Oracion de referencia en ingles: no disponible.',
        `Oracion en espanol a validar: ${sentence}`,
        'Devuelve unicamente el JSON solicitado.'
    ].filter(Boolean).join('\n\n');
}

function normalizeOllamaResult(result, sentence) {
    if (!result || typeof result !== 'object') {
        return {
            valid: true,
            reason: null,
            suggestion: null
        };
    }

    const valid = result.valid !== false;
    const trimmedSentence = typeof sentence === 'string' ? sentence.trim() : '';
    const reason = typeof result.reason === 'string' && result.reason.trim().length > 0
        ? result.reason.trim()
        : null;
    const suggestion = typeof result.suggestion === 'string' && result.suggestion.trim().length > 0
        ? result.suggestion.trim()
        : null;

    if (valid) {
        return {
            valid: true,
            reason: null,
            suggestion: null
        };
    }

    return {
        valid: false,
        reason: reason || 'Se han detectado problemas en la oracion.',
        suggestion: suggestion || trimmedSentence || null
    };
}

function parseRawResponse(rawResponse) {
    if (typeof rawResponse !== 'string')
        throw new Error('La respuesta de Ollama debe ser una cadena de texto.');

    const startIndex = rawResponse.indexOf('{');
    const endIndex = rawResponse.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
        throw new Error('No se detectó un JSON válido en la respuesta de Ollama.');

    try {
        const response = JSON.parse(rawResponse.substring(startIndex, endIndex + 1));
        if (typeof response !== 'object' || response === null)
            throw new Error('La respuesta parseada no es un objeto.');
        return response;
    } catch (error) {
        throw new Error(`No se pudo parsear la respuesta como JSON: ${error.message}`);
    }
}

module.exports = {
    check,
    getSystemPrompt,
    buildCheckPrompt,
    normalizeOllamaResult,
    parseRawResponse
};
