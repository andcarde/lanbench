'use strict';

/**
 * @file Groq client (`cloud` mode) — thin alias over the generic
 * OpenAI-compatible client.
 *
 * Groq is just an OpenAI-compatible provider, so this module now forwards to
 * {@link module:utils/openai-compatible-client} while keeping the historical
 * `Groq` provider name in error messages and preserving the `config.groq.*`
 * defaults. Kept as a named module so existing imports/log strings do not
 * change.
 */

const openaiCompatibleClient = require('./openai-compatible-client');

/** Provider name (for error messages and logs). */
const PROVIDER_NAME = 'Groq';

/**
 * Calls Groq's OpenAI-compatible endpoint and returns parsed JSON.
 * @param {*} options - system, prompt and optional overrides.
 * @returns {Promise<*>} Parsed JSON of the response.
 */
async function generateJson(options) {
    return openaiCompatibleClient.generateJson({ ...options, providerName: PROVIDER_NAME });
}

/**
 * Calls Groq in free-text mode and returns the raw model string.
 * @param {*} options - system, prompt and optional overrides.
 * @returns {Promise<string>} Raw text returned by the model.
 */
async function generateText(options) {
    return openaiCompatibleClient.generateText({ ...options, providerName: PROVIDER_NAME });
}

module.exports = {
    generateJson,
    generateText
};
