'use strict';

/**
 * @file Helpers HTTP comunes a los clientes LLM.
 *
 * Provee `fetchWithTimeout`, `extractJsonPayload` (parser tolerante a
 * codigo markdown) y `removeTrailingSlashes`, todos sin dependencias
 * externas para evitar bibliotecas redundantes.
 */

/**
 * Quita barras finales sin expresiones regulares.
 * @param {string} value - Texto de entrada.
 * @returns {string} Texto sin barras finales.
 */
function removeTrailingSlashes(value) {
    let endIndex = value.length;
    while (endIndex > 0 && value[endIndex - 1] === '/')
        endIndex -= 1;
    return value.slice(0, endIndex);
}

/**
 * Lee de forma defensiva el cuerpo textual de una respuesta.
 * @param {*} response - Respuesta fetch.
 * @returns {Promise<string>} Texto o cadena vacia.
 */
async function safeReadText(response) {
    try {
        return await response.text();
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        return `No se pudo leer el cuerpo de error: ${error.message}`;
    }
}

/**
 * Extrae y parsea el primer JSON encontrado en una cadena.
 * @param {string} rawResponse - Texto bruto.
 * @param {string} providerName - Nombre del proveedor para mensajes de error.
 * @returns {*} Objeto JSON.
 */
function extractJsonPayload(rawResponse, providerName) {
    const startIndex = rawResponse.indexOf('{');
    const endIndex = rawResponse.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex)
        throw new Error(`${providerName} no devolvió un JSON válido.`);

    try {
        return JSON.parse(rawResponse.substring(startIndex, endIndex + 1));
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        throw new Error(`No se pudo parsear el JSON de ${providerName}: ${error.message}`);
    }
}

/**
 * Ejecuta una peticion fetch con timeout abortable. Devuelve el texto crudo del cuerpo.
 * @param {*} options - URL, init de fetch, timeout y proveedor.
 * @returns {Promise<*>} Respuesta lista para parsear.
 */
async function fetchWithTimeout({ url, init, timeoutMs, providerName }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (!response.ok) {
            const errorText = await safeReadText(response);
            throw new Error(`${providerName} respondió con ${response.status}: ${errorText || response.statusText}`);
        }

        return response;
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        if (error?.name === 'AbortError')
            throw new Error(`La petición a ${providerName} ha excedido el tiempo máximo de espera.`);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = {
    removeTrailingSlashes,
    safeReadText,
    extractJsonPayload,
    fetchWithTimeout
};
