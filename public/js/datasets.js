(function () {
  "use strict";

  function extractApiErrorMessage(errorLike, fallbackMessage) {
    const payload = errorLike && typeof errorLike === "object"
      && errorLike.responseJSON && typeof errorLike.responseJSON === "object"
      ? errorLike.responseJSON
      : null;

    if (payload && typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }

    if (errorLike && typeof errorLike.message === "string" && errorLike.message.trim().length > 0) {
      return errorLike.message;
    }

    if (errorLike && typeof errorLike.responseText === "string" && errorLike.responseText.trim().length > 0) {
      return errorLike.responseText;
    }

    return fallbackMessage;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { extractApiErrorMessage };
  }

  if (typeof window === "undefined" || typeof $ !== "function") {
    return;
  }

  const DATASETS_API_URL = "/api/datasets";
  const DATASETS_ALL_URL = "/api/datasets";
  const CREATE_DATASET_URL = "/api/datasets";
  const DATASET_VIEWS_URL = "/datasets";
  const $container = $("#datasetsContainer");
  const $tooltip = $("#datasetTooltip");
  const $tooltipTriples = $("#tooltipTriples");
  const $tooltipLanguages = $("#tooltipLanguages");
  const $btnNuevoDataset = $("#btnNuevoDataset");
  const $datasetSuccessModal = $("#datasetSuccessModal");
  const $datasetSuccessMessage = $("#datasetSuccessMessage");
  const state = {
    datasets: []
  };
  let datasetSuccessModalInstance = null;

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normaliseDataset(rawDataset, index) {
    const safeDataset =
      rawDataset && typeof rawDataset === "object" ? rawDataset : {};
    const metrics =
      typeof safeDataset.metrics === "object" && safeDataset.metrics !== null
        ? safeDataset.metrics
        : {};
    const progress =
      typeof safeDataset.progress === "object" && safeDataset.progress !== null
        ? safeDataset.progress
        : {};
    const ui = typeof safeDataset.ui === "object" && safeDataset.ui !== null
      ? safeDataset.ui
      : {};

    return {
      idDataset: Number(safeDataset.id ?? safeDataset.idDataset ?? 0),
      name: safeDataset.name ?? `DATASET ${index + 1}`,
      triplesRDF: Number(
        safeDataset.totalEntries ?? metrics.rdfTriples ?? safeDataset.triplesRDF ?? safeDataset.entries ?? 0
      ),
      languages: Array.isArray(metrics.languages)
        ? metrics.languages
        : Array.isArray(safeDataset.languages)
          ? safeDataset.languages
          : [],
      completedPercent: Number(
        progress.completed ?? safeDataset.completedPercent ?? 0
      ),
      withoutReviewPercent: Number(
        progress.withoutReview ?? safeDataset.withoutReviewPercent ?? 0
      ),
      remainPercent: Number(progress.remaining ?? safeDataset.remainPercent ?? 0),
      colorClass: ui.colorClass ?? safeDataset.colorClass ?? "dataset-purple"
    };
  }

  function normaliseDatasetList(datasets) {
    if (!Array.isArray(datasets)) {
      return [];
    }

    return datasets.map(normaliseDataset);
  }

  function renderLoading() {
    $container.html('<div class="loading-state">Cargando datasets...</div>');
  }

  function renderError(message = "No se pudieron cargar los datasets.") {
    $container.html(
      `<div class="error-state">${escapeHtml(message)}</div>`
    );
  }

  function renderEmpty() {
    $container.html(
      '<div class="empty-state">No hay datasets disponibles.</div>'
    );
  }

  function buildDatasetCard(dataset) {
    return `
      <div class="dataset-card">
        <div class="dataset-top-row">
          <div class="dataset-main-button">
            <button
              type="button"
              class="dataset-button ${escapeHtml(dataset.colorClass)}"
              data-id="${dataset.idDataset}"
              data-name="${escapeHtml(dataset.name)}"
            >
              ${escapeHtml(dataset.name)}
            </button>
          </div>

          <div class="action-buttons">
            <button
              type="button"
              class="btn btn-action btn-view"
              data-action="view"
              data-id="${dataset.idDataset}"
            >
              Ver
            </button>

            <button
              type="button"
              class="btn btn-action btn-continue"
              data-action="continue"
              data-id="${dataset.idDataset}"
            >
              Continuar
            </button>
          </div>
        </div>

        <div class="dataset-progress-row">
          <div class="custom-progress" aria-label="Progreso del dataset">
            <div
              class="segment completed"
              style="width: ${dataset.completedPercent}%;"
              title="${dataset.completedPercent}% completed"
            ></div>
            <div
              class="segment without-review"
              style="width: ${dataset.withoutReviewPercent}%;"
              title="${dataset.withoutReviewPercent}% need revision"
            ></div>
            <div
              class="segment remain"
              style="width: ${dataset.remainPercent}%;"
              title="${dataset.remainPercent}% remain"
            ></div>
          </div>

          <div class="progress-legend">
            <span class="legend-completed">
              ${dataset.completedPercent}% completed
            </span>
            <span class="legend-review">
              ${dataset.withoutReviewPercent}% need revision
            </span>
            <span class="legend-remain">
              ${dataset.remainPercent}% remain
            </span>
          </div>
        </div>
      </div>
    `;
  }

  function renderDatasets(datasets) {
    const normalised = normaliseDatasetList(datasets);

    if (!normalised.length) {
      renderEmpty();
      return;
    }

    const html = normalised.map(buildDatasetCard).join("");
    $container.html(html);
  }

  function showTooltip(dataset, buttonElement) {
    const languagesText =
      Array.isArray(dataset.languages) && dataset.languages.length
        ? dataset.languages.join(", ")
        : "N/D";

    $tooltipTriples.text(`${dataset.triplesRDF} triples RDF`);
    $tooltipLanguages.html(
      `<strong>Languages:</strong> ${escapeHtml(languagesText)}`
    );

    $tooltip.removeClass("d-none");

    const rect = buttonElement.getBoundingClientRect();
    const tooltipWidth = $tooltip.outerWidth() || 220;
    const tooltipHeight = $tooltip.outerHeight() || 70;

    let top =
      rect.top + window.scrollY + rect.height / 2 - tooltipHeight / 2;
    let left = rect.right + 18;

    const maxLeft = window.scrollX + window.innerWidth - tooltipWidth - 12;
    const minTop = window.scrollY + 8;
    const maxTop = window.scrollY + window.innerHeight - tooltipHeight - 8;

    if (left > maxLeft) {
      left = rect.left + window.scrollX - tooltipWidth - 18;
    }

    if (top < minTop) {
      top = minTop;
    }

    if (top > maxTop) {
      top = maxTop;
    }

    $tooltip.css({
      top: `${top}px`,
      left: `${left}px`
    });
  }

  function hideTooltip() {
    $tooltip.addClass("d-none");
  }

  function showCreateSuccessModal(response, uploadedFilename) {
    const dataset = response && typeof response === "object" ? response.dataset : null;
    const idDataset = response && typeof response === "object" ? response.idDataset : null;
    const datasetName =
      dataset && typeof dataset.name === "string" && dataset.name.trim().length > 0
        ? dataset.name.trim()
        : (uploadedFilename || "NUEVO DATASET").replace(/\.xml$/i, "");
    const message = idDataset
      ? `Dataset "${datasetName}" creado correctamente (ID ${idDataset}).`
      : `Dataset "${datasetName}" creado correctamente.`;

    if (
      $datasetSuccessModal.length &&
      typeof window.bootstrap !== "undefined" &&
      window.bootstrap &&
      typeof window.bootstrap.Modal === "function"
    ) {
      $datasetSuccessMessage.text(message);
      datasetSuccessModalInstance =
        datasetSuccessModalInstance ||
        window.bootstrap.Modal.getOrCreateInstance($datasetSuccessModal[0]);
      datasetSuccessModalInstance.show();
      return;
    }

    alert(message);
  }

  function ajaxGetDatasets() {
    return $.ajax({
      url: DATASETS_ALL_URL,
      method: "GET",
      dataType: "json"
    });
  }

  function ajaxGetDatasetById(id) {
    const normalisedId = Number(id);

    return $.ajax({
      url: `${DATASETS_API_URL}/${normalisedId}`,
      method: "GET",
      dataType: "json"
    }).done(function (dataset) {
      const normalised = normaliseDataset(dataset, 0);
      const index = state.datasets.findIndex(function (item) {
        return Number(item.idDataset) === Number(normalised.idDataset);
      });

      if (index >= 0) {
        state.datasets[index] = normalised;
      } else {
        state.datasets.push(normalised);
      }
    });
  }

  function openAnnotations(datasetId, sectionIndex) {
    const normalisedDatasetId = Number(datasetId);
    const normalisedSectionIndex = Number(sectionIndex) || 1;

    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo abrir el dataset seleccionado.");
      return;
    }

    const targetUrl =
      `/annotations?datasetId=${encodeURIComponent(normalisedDatasetId)}&sectionIndex=${encodeURIComponent(normalisedSectionIndex)}`;
    window.location.assign(targetUrl);
  }

  function ajaxUploadDataset(file) {
    const formData = new FormData();
    formData.append("xmlFile", file);

    return $.ajax({
      url: CREATE_DATASET_URL,
      method: "POST",
      data: formData,
      contentType: false,
      processData: false,
      dataType: "json"
    });
  }

  function loadDatasets() {
    renderLoading();

    ajaxGetDatasets()
      .done(function (datasets) {
        state.datasets = normaliseDatasetList(datasets);
        renderDatasets(state.datasets);
      })
      .fail(function (xhr) {
        state.datasets = [];
        renderError(extractApiErrorMessage(xhr, "No se pudieron cargar los datasets."));
      });
  }

  function findDatasetById(datasetId) {
    return state.datasets.find(function (dataset) {
      return Number(dataset.idDataset) === Number(datasetId);
    }) || null;
  }

  function handleView(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    const selectedDataset = findDatasetById(normalisedDatasetId);
    const datasetName =
      selectedDataset && typeof selectedDataset.name === "string"
        ? selectedDataset.name
        : `DATASET ${normalisedDatasetId}`;

    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo abrir el dataset seleccionado.");
      return;
    }

    window.location.assign(
      `${DATASET_VIEWS_URL}/${encodeURIComponent(normalisedDatasetId)}/view?datasetId=${encodeURIComponent(normalisedDatasetId)}&datasetName=${encodeURIComponent(datasetName)}&sectionIndex=1`
    );
  }

  function handleContinue(datasetId) {
    openAnnotations(datasetId, 1);
  }

  function handleCreateDataset() {
    const $input = $('<input type="file" accept=".xml">').css("display", "none");
    $("body").append($input);

    $input.on("change", function () {
      const file = this.files[0];
      $input.remove();

      if (!file) return;

      ajaxUploadDataset(file)
        .done(function (response) {
          loadDatasets();
          showCreateSuccessModal(response, file.name);
        })
        .fail(function (xhr) {
          const msg = extractApiErrorMessage(xhr, "No se pudo crear el dataset.");
          alert(msg);
        });
    });

    $input.trigger("click");
  }

  function bindEvents() {
    $container.on("mouseenter", ".dataset-button", function () {
      const datasetId = $(this).data("id");
      const buttonElement = this;

      ajaxGetDatasetById(datasetId)
        .done(function (dataset) {
          showTooltip(normaliseDataset(dataset, 0), buttonElement);
        })
        .fail(function () {
          hideTooltip();
        });
    });

    $container.on("mouseleave", ".dataset-button", function () {
      hideTooltip();
    });

    $container.on("click", '[data-action="view"]', function () {
      const datasetId = $(this).data("id");
      handleView(datasetId);
    });

    $container.on("click", '[data-action="continue"]', function () {
      const datasetId = $(this).data("id");
      handleContinue(datasetId);
    });

    $container.on("click", ".dataset-button", function () {
      const datasetId = $(this).data("id");
      openAnnotations(datasetId, 1);
    });

    $btnNuevoDataset.on("click", function () {
      handleCreateDataset();
    });

    $(window).on("scroll resize", function () {
      hideTooltip();
    });
  }

  $(document).ready(function () {
    bindEvents();
    loadDatasets();
  });
})();
