function fetchDatasetText(datasetId) {
    return $.ajax({
        url: `/api/datasets/${encodeURIComponent(String(datasetId))}/text`,
        method: 'GET',
        dataType: 'text'
    });
}
