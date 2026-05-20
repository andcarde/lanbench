// @ts-nocheck
/**
 * @file Actions (AJAX) consumed by the annotation page.
 *
 * Centralizes the calls to `/api/annotations/*` so the page treats the
 * network as a local API; in `front-debug` mode these modules are swapped for
 * mocks (see `scripts/front-debug.js`).
 */

/**
 * Checks annotations against the backend and returns the semantic validation.
 * @param {Array} sentences - Spanish sentences entered by the annotator.
 * @param {*} entryContext - Entry context (triples, English sentence, etc.).
 * @returns {Promise<*>} Promise with the array of validations returned by the backend.
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
 * Posts annotations to the backend to persist the accepted annotations.
 *
 * It packs each sentence with its optional rejection reason into a single
 * array of `{ sentence, rejectionReason }` objects to avoid the risk of broken
 * positional pairing between two parallel arrays (AUDIT-2 §22).
 *
 * @param {number} datasetId - Identifier of the dataset the entry belongs to.
 * @param {number} rdfId - Identifier of the RDF entry within the dataset.
 * @param {Array<string>} sentences - Final sentences to save.
 * @param {Array<string|null>} rejectionReasons - Rejection reasons associated with each sentence.
 * @param {*} options - Additional options (e.g. sectionNumber, isLastEntry).
 * @returns {Promise<*>} Promise with the persistence response.
 */
function postAnnotations(datasetId, rdfId, sentences, rejectionReasons, options = {}) {
    const items = sentences.map((sentence, index) => ({
        sentence,
        rejectionReason: rejectionReasons[index] || null
    }));

    return $.ajax({
        url: '/api/annotations/send',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            datasetId,
            rdfId,
            sentences: items,
            sectionNumber: options.sectionNumber,
            isLastEntry: options.isLastEntry
        })
    });
}

/**
 * Asks the backend to continue with the next annotation session.
 * @param {number} datasetId - Dataset identifier.
 * @returns {Promise<*>} Promise with the continuation result.
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
 * Gets the current entry pointed to by the user's active session.
 * @param {number} datasetId - Dataset identifier.
 * @returns {Promise<*>} Promise with the current entry payload.
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
 * Gets a dataset's options from the backend.
 * @param {number} datasetId - Dataset identifier.
 * @returns {Promise<*>} Promise with the dataset options.
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
 * Gets debug params. In server mode there are no defaults: the view must take
 * the parameters from the URL.
 * @returns {*} Always null in server mode.
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
