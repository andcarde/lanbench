// @ts-nocheck
/**
 * @file Acciones (AJAX) consumidas por la pagina de detalle del dataset.
 *
 * Expone `fetchDatasetText` como global (necesario porque el HTML carga
 * scripts sin un sistema de modulos).
 */

/**
 * Obtiene el texto XML del dataset desde el backend.
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

window.fetchDatasetText = fetchDatasetText;
