$(document).ready(() => {
    const state = {
        datasets: [],
        selectedId: null,
        query: '',
        status: 'all'
    };

    const toast = new bootstrap.Toast(document.getElementById('actionToast'));

    function showToast(message) {
        $('#toastMessage').text(message);
        toast.show();
    }

    function normalizeStatus(dataset) {
        if (dataset.status === 'ready' || dataset.status === 'in_progress' || dataset.status === 'blocked')
            return dataset.status;

        if (typeof dataset.completedPercent === 'number') {
            if (dataset.completedPercent >= 100)
                return 'ready';
            if (dataset.completedPercent > 0)
                return 'in_progress';
        }

        return 'ready';
    }

    function normalizeDataset(dataset, index) {
        const idDataset = Number.isInteger(dataset.idDataset) ? dataset.idDataset : index + 1;
        const records = Number.isInteger(dataset.records)
            ? dataset.records
            : (Number.isInteger(dataset.triplesRDF) ? dataset.triplesRDF : 0);

        return {
            id: dataset.id || `dataset-${idDataset}`,
            idDataset,
            name: dataset.name || `Dataset ${idDataset}`,
            description: dataset.description || 'Dataset para anotación RDF a español.',
            source: dataset.source || 'Lanbench',
            languagePair: dataset.languagePair || 'RDF -> ES',
            records,
            status: normalizeStatus(dataset),
            updatedAt: dataset.updatedAt || new Date().toISOString().slice(0, 10)
        };
    }

    function getStatusBadge(status) {
        if (status === 'ready')
            return '<span class="badge text-bg-success">Disponible</span>';
        if (status === 'in_progress')
            return '<span class="badge text-bg-warning">En progreso</span>';
        return '<span class="badge text-bg-secondary">Bloqueado</span>';
    }

    function formatDate(isoDate) {
        if (typeof isoDate !== 'string')
            return '-';

        const [year, month, day] = isoDate.split('-');
        if (!year || !month || !day)
            return isoDate;
        return `${day}/${month}/${year}`;
    }

    function matchesFilters(dataset) {
        const normalizedQuery = state.query.trim().toLowerCase();
        const searchableText = `${dataset.name} ${dataset.description} ${dataset.source}`.toLowerCase();
        const queryMatch = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
        const statusMatch = state.status === 'all' || dataset.status === state.status;
        return queryMatch && statusMatch;
    }

    function getVisibleDatasets() {
        return state.datasets.filter(matchesFilters);
    }

    function updateCounters(visibleDatasets) {
        const total = visibleDatasets.length;
        const readyCount = visibleDatasets.filter(dataset => dataset.status === 'ready').length;

        $('#totalBadge').text(`${total} dataset${total === 1 ? '' : 's'}`);
        $('#readyBadge').text(`${readyCount} disponible${readyCount === 1 ? '' : 's'}`);
    }

    function updateSelectedLabel() {
        const selectedDataset = state.datasets.find(dataset => dataset.id === state.selectedId);
        if (!selectedDataset) {
            $('#selectedDatasetLabel').text('Ninguno');
            return;
        }

        $('#selectedDatasetLabel').text(selectedDataset.name);
    }

    function renderList() {
        const visibleDatasets = getVisibleDatasets();
        updateCounters(visibleDatasets);

        if (visibleDatasets.length === 0) {
            $('#datasetsList').empty();
            $('#emptyState').removeClass('d-none');
            return;
        }

        $('#emptyState').addClass('d-none');
        const html = visibleDatasets
            .map(dataset => {
                const isSelected = dataset.id === state.selectedId;
                return `
                <article class="dataset-item ${isSelected ? 'selected' : ''}" data-id="${dataset.id}">
                    <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                        <div>
                            <div class="d-flex gap-2 flex-wrap align-items-center mb-1">
                                <h2 class="h5 mb-0">${dataset.name}</h2>
                                ${getStatusBadge(dataset.status)}
                            </div>
                            <div class="dataset-meta">
                                <span>${dataset.languagePair}</span>
                                <span class="mx-2">|</span>
                                <span>${dataset.records.toLocaleString('es-ES')} registros</span>
                                <span class="mx-2">|</span>
                                <span>Actualizado: ${formatDate(dataset.updatedAt)}</span>
                            </div>
                            <p class="dataset-desc">${dataset.description}</p>
                            <small class="text-muted">Fuente: ${dataset.source}</small>
                        </div>
                        <div class="d-flex align-items-start align-items-lg-center">
                            <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-outline-primary'} btn-select-dataset">
                                ${isSelected ? 'Seleccionado' : 'Seleccionar'}
                            </button>
                        </div>
                    </div>
                </article>`;
            })
            .join('');

        $('#datasetsList').html(html);
    }

    function selectDataset(datasetId) {
        state.selectedId = datasetId;
        updateSelectedLabel();
        renderList();

        const selectedDataset = state.datasets.find(dataset => dataset.id === datasetId);
        if (selectedDataset)
            showToast(`Dataset activo: ${selectedDataset.name}`);
    }

    function loadDatasets() {
        $.ajax({
            url: '/api/datasets',
            type: 'GET',
            dataType: 'json'
        })
            .done(function (response) {
                const rawDatasets = Array.isArray(response) ? response : [];
                state.datasets = rawDatasets.map((dataset, index) => normalizeDataset(dataset, index));
                renderList();
                updateSelectedLabel();
            })
            .fail(function (xhr) {
                state.datasets = [];
                renderList();
                const message =
                    (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.text))
                    || 'No se pudieron cargar los datasets.';
                showToast(message);
            });
    }

    $('#searchInput').on('input', function () {
        state.query = $(this).val();
        renderList();
    });

    $('#statusFilter').on('change', function () {
        state.status = $(this).val();
        renderList();
    });

    $('#datasetsList').on('click', '.btn-select-dataset', function () {
        const datasetId = $(this).closest('.dataset-item').data('id');
        selectDataset(datasetId);
    });

    updateSelectedLabel();
    renderList();
    loadDatasets();
});