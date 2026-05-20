// @ts-nocheck
/**
 * @file Actions (AJAX) consumed by the dataset detail page.
 *
 * Exposes `fetchDatasetText` as a global (required because the HTML loads
 * scripts without a module system).
 */

/**
 * Gets the dataset's XML text from the backend.
 *
 * @param {number} datasetId
 * @returns {Promise<string>}
 */
function fetchDatasetText(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));

    return $.ajax({
        url: `/api/datasets/${safeDatasetId}/text`,
        method: 'GET',
        dataType: 'text'
    });
}

globalThis.fetchDatasetText = fetchDatasetText;

/**
 * Triggers the download of the dataset's original XML.
 *
 * Creates a temporary `<a>` pointing at the download endpoint; the browser
 * respects the `Content-Disposition` header to set the filename.
 *
 * @param {number} datasetId
 * @returns {void}
 */
function downloadDatasetXml(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));
    const link = document.createElement('a');
    link.href = `/api/datasets/${safeDatasetId}/download`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

globalThis.downloadDatasetXml = downloadDatasetXml;

/**
 * Triggers the download of the extended XML (original + Spanish annotations).
 *
 * @param {number} datasetId
 * @returns {void}
 */
function downloadAnnotatedDatasetXml(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));
    const link = document.createElement('a');
    link.href = `/api/datasets/${safeDatasetId}/download/annotated`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

globalThis.downloadAnnotatedDatasetXml = downloadAnnotatedDatasetXml;

/**
 * Gets the dataset's basic data (includes `completedPercent`) to decide
 * whether to enable the extended-download button.
 *
 * @param {number} datasetId
 * @returns {Promise<object>}
 */
function fetchDatasetSummary(datasetId) {
    const safeDatasetId = encodeURIComponent(String(datasetId));

    return $.ajax({
        url: `/api/datasets/${safeDatasetId}`,
        method: 'GET',
        dataType: 'json'
    });
}

globalThis.fetchDatasetSummary = fetchDatasetSummary;
