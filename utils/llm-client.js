'use strict';

/**
 * @file LLM dispatcher — elige cliente segun `config.model`.
 *
 * Mantiene una API homogenea (`generateJson`) sobre dos backends:
 *   - `local` -> Ollama (servidor local).
 *   - `cloud` -> Groq (API OpenAI-compatible).
 */

const config = require('../config');
const ollamaClient = require('./ollama-client');
const groqClient = require('./groq-client');

/**
 * Despacha la peticion al cliente LLM segun `config.model`.
 *
 * @param {{ system?: string, prompt?: string, [k: string]: any }} options
 * @returns {Promise<any>} JSON parseado de la respuesta.
 */
async function generateJson(options) {
    if (config.model === 'cloud')
        return groqClient.generateJson(options);

    return ollamaClient.generateJson(options);
}

module.exports = {
    generateJson
};
