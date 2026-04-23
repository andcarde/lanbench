'use strict';

const config = require('../config');

async function generateJson({ system, prompt, model, host, timeoutMs }) {
    const normalizedHost = normalizeHost(host || config.ollama.host);
    const normalizedModel = model || config.ollama.model;
    const normalizedTimeout = timeoutMs || config.ollama.requestTimeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), normalizedTimeout);

    try {
        const response = await fetch(`${normalizedHost}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: normalizedModel,
                system,
                prompt,
                stream: false,
                format: 'json',
                options: {
                    temperature: 0.1
                }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await safeReadText(response);
            throw new Error(`Ollama respondió con ${response.status}: ${errorText || response.statusText}`);
        }

        const payload = await response.json();
        if (!payload || typeof payload.response !== 'string')
            throw new Error('La respuesta de Ollama no contiene un campo response válido.');

        return parseJsonPayload(payload.response);
    } catch (error) {
        if (error && error.name === 'AbortError')
            throw new Error('La petición a Ollama ha excedido el tiempo máximo de espera.');
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeHost(host) {
    return String(host || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch (_error) {
        return '';
    }
}

function parseJsonPayload(rawResponse) {
    const startIndex = rawResponse.indexOf('{');
    const endIndex = rawResponse.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
        throw new Error('Ollama no devolvió un JSON válido.');

    try {
        return JSON.parse(rawResponse.substring(startIndex, endIndex + 1));
    } catch (error) {
        throw new Error(`No se pudo parsear el JSON de Ollama: ${error.message}`);
    }
}

module.exports = {
    generateJson
};
