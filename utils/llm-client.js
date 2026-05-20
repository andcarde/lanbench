'use strict';

/**
 * @file LLM dispatcher — picks the client based on `config.model`.
 *
 * Keeps a homogeneous API (`generateJson`) over two backends:
 *   - `local` -> Ollama (local server).
 *   - `cloud` -> Groq (OpenAI-compatible API).
 */

const config = require('../config');
const ollamaClient = require('./ollama-client');
const groqClient = require('./groq-client');

/**
 * Dispatches the request to the LLM client based on `config.model`.
 *
 * @param {{ system?: string, prompt?: string, [k: string]: any }} options
 * @returns {Promise<any>} Parsed JSON of the response.
 */
async function generateJson(options) {
    if (config.model === 'cloud')
        return groqClient.generateJson(options);

    return ollamaClient.generateJson(options);
}

module.exports = {
    generateJson
};
