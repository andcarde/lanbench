// @ts-nocheck
/**
 * @file Acciones (AJAX) consumidas por la pagina de anotacion.
 *
 * Centraliza las llamadas a `/api/annotations/*` para que la pagina trate
 * la red como una API local; en modo `front-debug` estos modulos se
 * intercambian por mocks (ver `scripts/front-debug.js`).
 */

/**
 * Comprueba check annotations contra el backend y devuelve la validacion semantica.
 * @param {Array} sentences - Oraciones en espanol introducidas por el anotador.
 * @param {*} entryContext - Contexto de la entry (triples, oracion en ingles, etc.).
 * @returns {Promise<*>} Promesa con el array de validaciones devuelto por el backend.
 */
function checkAnnotations(sentences, entryContext) {
    return $.ajax({
        url: '/api/annotations/check',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({ sentences, entryContext })
    });
}

/**
 * Ejecuta post annotations contra el backend para persistir las anotaciones aceptadas.
 * @param {number} datasetId - Identificador del dataset al que pertenece la entry.
 * @param {number} rdfId - Identificador de la entry RDF dentro del dataset.
 * @param {Array} sentences - Oraciones definitivas a guardar.
 * @param {Array} rejectionReasons - Motivos de rechazo asociados a cada oracion.
 * @param {*} options - Opciones adicionales (ej: sectionNumber, isLastEntry).
 * @returns {Promise<*>} Promesa con la respuesta de persistencia.
 */
function postAnnotations(datasetId, rdfId, sentences, rejectionReasons, options = {}) {
    return $.ajax({
        url: '/api/annotations/send',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            datasetId,
            rdfId,
            sentences,
            rejectionReason: rejectionReasons.map(reason => reason || ''),
            sectionNumber: options.sectionNumber,
            isLastEntry: options.isLastEntry
        })
    });
}

/**
 * Solicita al backend continuar con la siguiente sesion de anotacion.
 * @param {number} datasetId - Identificador del dataset.
 * @returns {Promise<*>} Promesa con el resultado de continuacion.
 */
function fetchContinueAnnotation(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));

    return $.ajax({
        url: `/api/annotations/${safeDatasetId}/continue`,
        type: 'POST',
        dataType: 'json'
    });
}

/**
 * Obtiene la entry actual apuntada por la sesion activa del usuario.
 * @param {number} datasetId - Identificador del dataset.
 * @returns {Promise<*>} Promesa con el payload de la entry actual.
 */
function fetchNextEntry(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));

    return $.ajax({
        url: `/api/annotations/${safeDatasetId}/next`,
        type: 'GET',
        dataType: 'json'
    });
}

/**
 * Obtiene las opciones de un dataset desde el backend.
 * @param {number} datasetId - Identificador del dataset.
 * @returns {Promise<*>} Promesa con las opciones del dataset.
 */
function fetchDatasetOptions(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));

    return $.ajax({
        url: `/api/datasets/${safeDatasetId}`,
        type: 'GET',
        dataType: 'json'
    }).then(function (payload) {
        return payload && typeof payload.options === 'object'
            ? payload.options
            : { llmMode: 'correction' };
    });
}

/**
 * Obtiene debug params. En modo servidor no hay defaults: la vista debe tomar
 * los parametros de la URL.
 * @returns {*} Siempre null en modo servidor.
 */
function getDebugParams() {
    return null;
}

window.checkAnnotations = checkAnnotations;
window.postAnnotations = postAnnotations;
window.fetchContinueAnnotation = fetchContinueAnnotation;
window.fetchNextEntry = fetchNextEntry;
window.fetchDatasetOptions = fetchDatasetOptions;
window.getDebugParams = getDebugParams;
