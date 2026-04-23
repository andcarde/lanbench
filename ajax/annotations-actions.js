function checkAnnotations(sentences, entryContext) {
    return $.ajax({
        url: '/api/annotations/check',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({ sentences, entryContext })
    });
}

function postAnnotations(datasetId, rdfId, sentences, rejectionReasons) {
    return $.ajax({
        url: '/api/annotations/send',
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
            datasetId,
            rdfId,
            sentences,
            rejectionReason: rejectionReasons.map(reason => reason || '')
        })
    });
}

function fetchDatasetSection(datasetId, sectionNumber) {
    return $.ajax({
        url: `/api/datasets/${datasetId}/sections/${sectionNumber}`,
        type: 'GET',
        dataType: 'json'
    });
}

function getDebugParams() {
    return null;
}
