// @ts-nocheck
/**
 * @file Frontend for `public/datasets.html` — dataset listing.
 *
 * Loads the list of datasets accessible to the user, renders them with
 * progress and languages, and manages creation via XML upload (moderators
 * only).
 */
(function () {
  "use strict";

  /**
   * Extracts a human-readable error message from an AJAX error-like object.
   * @param {*} errorLike - jQuery xhr or error object.
   * @param {string} fallbackMessage - Message to use if none can be extracted.
   * @returns {string} The resolved error message.
   */
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

  /**
   * Normalizes a role to a consistent value ('admin' or 'annotator').
   * @param {string} role - Raw role.
   * @returns {string} Normalized role.
   */
  function normaliseRole(role) {
    return role === "admin" ? "admin" : "annotator";
  }

  /**
   * Builds the dataset export URL for the given id and format.
   * @param {*} datasetId - Dataset id.
   * @param {string} format - Export format ('json' or 'xml').
   * @returns {?string} Export URL, or null if the id is invalid.
   */
  function buildDatasetExportUrl(datasetId, format) {
    const normalisedId = Number(datasetId);
    const normalisedFormat = format === "xml" ? "xml" : "json";

    if (!Number.isInteger(normalisedId) || normalisedId <= 0) {
      return null;
    }

    return `/api/admin/datasets/${encodeURIComponent(normalisedId)}/export?format=${normalisedFormat}`;
  }

  /**
   * Builds the dataset delete URL for the given id.
   * @param {*} datasetId - Dataset id.
   * @returns {?string} Delete URL, or null if the id is invalid.
   */
  function buildDatasetDeleteUrl(datasetId) {
    const normalisedId = Number(datasetId);

    if (!Number.isInteger(normalisedId) || normalisedId <= 0) {
      return null;
    }

    return `/api/datasets/${encodeURIComponent(normalisedId)}`;
  }

  /**
   * Normalizes a criterion to a consistent shape.
   * @param {*} rawCriterion - Raw criterion object.
   * @returns {*} Normalized criterion.
   */
  function normaliseCriterion(rawCriterion) {
    const source = rawCriterion && typeof rawCriterion === "object" ? rawCriterion : {};
    return {
      id: Number(source.id || 0),
      key: source.key || "",
      label: source.label || "",
      sortOrder: Number(source.sortOrder || 0),
      active: source.active !== false,
      version: Number(source.version || 1)
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      extractApiErrorMessage,
      normaliseRole,
      buildDatasetExportUrl,
      buildDatasetDeleteUrl,
      normaliseCriterion
    };
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
  const $newDatasetModal = $("#newDatasetModal");
  const $newDatasetForm = $("#newDatasetForm");
  const $newDatasetFile = $("#newDatasetFile");
  const $newDatasetLlmMode = $("#newDatasetLlmMode");
  const $newDatasetReviewEnabled = $("#newDatasetReviewEnabled");
  const $newDatasetAdditionalReviews = $("#newDatasetAdditionalReviews");
  const $btnCreateDatasetSubmit = $("#btnCreateDatasetSubmit");
  const $datasetSuccessModal = $("#datasetSuccessModal");
  const $datasetSuccessMessage = $("#datasetSuccessMessage");
  const $continueDatasetModal = $("#continueDatasetModal");
  const $continueDatasetModalLabel = $("#continueDatasetModalLabel");
  const $continueDatasetMessage = $("#continueDatasetMessage");
  const state = {
    datasets: []
  };
  let newDatasetModalInstance = null;
  let datasetSuccessModalInstance = null;
  let continueDatasetModalInstance = null;

  /**
   * Escapes a value for safe insertion as HTML text.
   * @param {string} text - Text to escape.
   * @returns {string} HTML-escaped string.
   */
  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Normalizes the review state used to render the dataset button.
   * @param {*} rawReview - State received from the API.
   * @returns {*} Normalized state.
   */
  function normaliseDatasetReviewState(rawReview) {
    const review = rawReview && typeof rawReview === "object" ? rawReview : {};

    return {
      canReview: Boolean(review.canReview),
      showReviewButton: Boolean(review.showReviewButton),
      reviewAvailable: Boolean(review.reviewAvailable),
      reviewableCount: Number(review.reviewableCount || 0)
    };
  }

  /**
   * Normalizes the dataset options.
   * @param {*} rawOptions - Options received from the API.
   * @returns {*} Normalized options.
   */
  function normaliseDatasetOptions(rawOptions) {
    const source = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
    const llmMode = typeof source.llmMode === "string" && source.llmMode.trim()
      ? source.llmMode.trim().toLowerCase()
      : "correction";

    return {
      llmMode: ["generation", "correction", "none"].includes(llmMode) ? llmMode : "correction",
      isReviewEnabled: Boolean(source.isReviewEnabled),
      hasAdditionalReviews: Boolean(source.hasAdditionalReviews)
    };
  }

  /**
   * Normalizes a dataset to a consistent shape for rendering.
   * @param {*} rawDataset - Raw dataset object.
   * @param {number} index - Index in the list (used for a fallback name).
   * @returns {*} Normalized dataset.
   */
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
      id: Number(safeDataset.id || 0),
      name: safeDataset.name ?? `DATASET ${index + 1}`,
      triplesRDF: Number(
        safeDataset.totalEntries ?? metrics.rdfTriples ?? safeDataset.triplesRDF ?? 0
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
      canAdmin: Boolean(
        safeDataset.canAdmin
        || safeDataset.canAdminDataset
        || (safeDataset.permissions && (safeDataset.permissions.canAdmin || safeDataset.permissions.admin))
      ),
      review: normaliseDatasetReviewState(safeDataset.review),
      options: normaliseDatasetOptions(safeDataset.options),
      colorClass: ui.colorClass ?? safeDataset.colorClass ?? "dataset-purple"
    };
  }

  /**
   * Normalizes a list of datasets.
   * @param {*} datasets - Raw dataset list.
   * @returns {*} Normalized dataset list.
   */
  function normaliseDatasetList(datasets) {
    if (!Array.isArray(datasets)) {
      return [];
    }

    return datasets.map(normaliseDataset);
  }

  /**
   * Renders the loading state in the container.
   */
  function renderLoading() {
    $container.html('<div class="loading-state">Cargando datasets...</div>');
  }

  /**
   * Renders the error state in the container.
   * @param {string} message - Error message to display.
   */
  function renderError(message = "No se pudieron cargar los datasets.") {
    $container.html(
      `<div class="error-state">${escapeHtml(message)}</div>`
    );
  }

  /**
   * Renders the empty state in the container.
   */
  function renderEmpty() {
    $container.html(
      '<div class="empty-state">No hay datasets disponibles.</div>'
    );
  }

  /**
   * Builds the HTML for a dataset card.
   * @param {*} dataset - Normalized dataset.
   * @returns {string} Card HTML.
   */
  function buildDatasetCard(dataset) {
    return `
      <div class="dataset-card">
        <div class="dataset-top-row">
          <div class="dataset-main-button">
            <button
              type="button"
              class="dataset-button ${escapeHtml(dataset.colorClass)}"
              data-id="${dataset.id}"
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
              data-id="${dataset.id}"
            >
              Ver
            </button>

            <button
              type="button"
              class="btn btn-action btn-continue"
              data-action="continue"
              data-id="${dataset.id}"
            >
              Anotar
            </button>

            ${dataset.review && dataset.review.showReviewButton
              ? `
                <button
                  type="button"
                  class="btn btn-action btn-review"
                  data-action="review"
                  data-id="${dataset.id}"
                  title="${dataset.review.reviewAvailable ? "Abrir revisión" : "No hay secciones pendientes de revisión"}"
                  ${dataset.review.reviewAvailable ? "" : "disabled"}
                >
                  Revisión
                </button>`
              : ""}

            ${dataset.canAdmin
              ? `
                <button
                  type="button"
                  class="btn btn-action btn-admin"
                  data-action="admin"
                  data-id="${dataset.id}"
                >
                  Administrar
                </button>

                <button
                  type="button"
                  class="btn btn-action btn-delete"
                  data-action="delete"
                  data-id="${dataset.id}"
                  title="Borrar dataset"
                  aria-label="Borrar dataset ${escapeHtml(dataset.name)}"
                >
                  &#128465;
                </button>`
              : ""}
          </div>
        </div>

        <div class="dataset-progress-row">
          <div class="custom-progress" aria-label="Progreso del dataset">
            <div
              class="segment completed"
              style="width: ${dataset.completedPercent}%;"
              title="${dataset.completedPercent}% completed"
            ></div>
            ${dataset.options && dataset.options.isReviewEnabled ? `
            <div
              class="segment without-review"
              style="width: ${dataset.withoutReviewPercent}%;"
              title="${dataset.withoutReviewPercent}% need revision"
            ></div>` : ""}
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
            ${dataset.options && dataset.options.isReviewEnabled ? `
            <span class="legend-review">
              ${dataset.withoutReviewPercent}% need revision
            </span>` : ""}
            <span class="legend-remain">
              ${dataset.remainPercent}% remain
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the dataset cards in the container.
   * @param {*} datasets - Datasets to render.
   */
  function renderDatasets(datasets) {
    const normalised = normaliseDatasetList(datasets);

    if (!normalised.length) {
      renderEmpty();
      return;
    }

    const html = normalised.map(buildDatasetCard).join("");
    $container.html(html);
  }

  /**
   * Shows the dataset tooltip near the given button.
   * @param {*} dataset - Normalized dataset.
   * @param {*} buttonElement - The button the tooltip is anchored to.
   */
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

  /**
   * Hides the dataset tooltip.
   */
  function hideTooltip() {
    $tooltip.addClass("d-none");
  }

  /**
   * Shows the "dataset created" success modal (or an alert as fallback).
   * @param {*} response - Creation response from the API.
   * @param {string} uploadedFilename - Name of the uploaded file (fallback name).
   */
  function showCreateSuccessModal(response, uploadedFilename) {
    const dataset = response && typeof response === "object" ? response.dataset : null;
    const datasetId = response && typeof response === "object" ? response.id : null;
    const datasetName =
      dataset && typeof dataset.name === "string" && dataset.name.trim().length > 0
        ? dataset.name.trim()
        : (uploadedFilename || "NUEVO DATASET").replace(/\.xml$/i, "");
    const message = datasetId
      ? `Dataset "${datasetName}" creado correctamente (ID ${datasetId}).`
      : `Dataset "${datasetName}" creado correctamente.`;

    if (
      $datasetSuccessModal.length &&
      globalThis.bootstrap !== undefined &&
      globalThis.bootstrap &&
      typeof globalThis.bootstrap.Modal === "function"
    ) {
      $datasetSuccessMessage.text(message);
      datasetSuccessModalInstance =
        datasetSuccessModalInstance ||
        globalThis.bootstrap.Modal.getOrCreateInstance($datasetSuccessModal[0]);
      datasetSuccessModalInstance.show();
      return;
    }

    alert(message);
  }

  /**
   * Requests the list of accessible datasets.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxGetDatasets() {
    return $.ajax({
      url: DATASETS_ALL_URL,
      method: "GET",
      dataType: "json"
    });
  }

  /**
   * Requests a single dataset by id and updates the local cache.
   * @param {number} id - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxGetDatasetById(id) {
    const normalisedId = Number(id);

    return $.ajax({
      url: `${DATASETS_API_URL}/${normalisedId}`,
      method: "GET",
      dataType: "json"
    }).done(function (dataset) {
      const normalised = normaliseDataset(dataset, 0);
      const index = state.datasets.findIndex(function (item) {
        return Number(item.id) === Number(normalised.id);
      });

      if (index >= 0) {
        state.datasets[index] = normalised;
      } else {
        state.datasets.push(normalised);
      }
    });
  }

  /**
   * Navigates to the annotation screen for the given dataset.
   * @param {*} datasetId - Dataset id.
   * @param {*} options - Dataset options (used to pass `llmMode`).
   * @returns {void}
   */
  function openAnnotations(datasetId, options) {
    const normalisedDatasetId = Number(datasetId);
    const datasetOptions = options && typeof options === "object"
      ? normaliseDatasetOptions(options)
      : null;

    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo abrir el dataset seleccionado.");
      return;
    }

    const targetUrl =
      `/annotations?datasetId=${encodeURIComponent(normalisedDatasetId)}`
      + (datasetOptions ? `&llmMode=${encodeURIComponent(datasetOptions.llmMode)}` : "");
    globalThis.location.assign(targetUrl);
  }

  /**
   * Reads the new-dataset options from the form controls.
   * @returns {*} Normalized dataset options.
   */
  function readNewDatasetOptions() {
    return normaliseDatasetOptions({
      llmMode: $newDatasetLlmMode.val(),
      isReviewEnabled: $newDatasetReviewEnabled.val() === "true",
      hasAdditionalReviews: $newDatasetAdditionalReviews.val() === "true"
    });
  }

  /**
   * Uploads a new dataset XML file with its creation options.
   * @param {*} file - XML file to upload.
   * @param {*} options - Creation options.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxUploadDataset(file, options = {}) {
    const datasetOptions = normaliseDatasetOptions(options);
    const formData = new FormData();
    formData.append("xmlFile", file);
    formData.append("llmMode", datasetOptions.llmMode);
    formData.append("isReviewEnabled", String(datasetOptions.isReviewEnabled));
    formData.append("hasAdditionalReviews", String(datasetOptions.hasAdditionalReviews));

    return $.ajax({
      url: CREATE_DATASET_URL,
      method: "POST",
      data: formData,
      contentType: false,
      processData: false,
      dataType: "json"
    });
  }

  /**
   * Sends the request to delete a dataset.
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxDeleteDataset(datasetId) {
    const url = buildDatasetDeleteUrl(datasetId);
    if (!url) {
      return $.Deferred().reject(new Error("El id del dataset es inválido.")).promise();
    }

    return $.ajax({
      url,
      method: "DELETE",
      dataType: "json"
    });
  }

  /**
   * Asks the backend to continue the dataset.
   * @param {number} datasetId - Selected dataset.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxContinueDataset(datasetId) {
    const normalisedId = Number(datasetId);
    if (!Number.isInteger(normalisedId) || normalisedId <= 0) {
      return $.Deferred().reject(new Error("El id del dataset es inválido.")).promise();
    }

    return $.ajax({
      url: `/api/annotations/${encodeURIComponent(normalisedId)}/continue`,
      method: "POST",
      dataType: "json"
    });
  }

  /**
   * Loads the datasets and renders them, handling the loading/error states.
   * @returns {Promise<*>}
   */
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

  /**
   * Finds a dataset by id in the local state.
   * @param {*} datasetId - Dataset id.
   * @returns {*} The dataset, or null.
   */
  function findDatasetById(datasetId) {
    return state.datasets.find(function (dataset) {
      return Number(dataset.id) === Number(datasetId);
    }) || null;
  }

  /**
   * Handles the "view" action: navigates to the dataset detail view.
   * @param {*} datasetId - Dataset id.
   * @returns {void}
   */
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

    globalThis.location.assign(
      `${DATASET_VIEWS_URL}/${encodeURIComponent(normalisedDatasetId)}/view?datasetId=${encodeURIComponent(normalisedDatasetId)}&datasetName=${encodeURIComponent(datasetName)}&sectionIndex=1`
    );
  }

  /**
   * Handles the "continue" action: resolves the next case and acts on it.
   * @param {*} datasetId - Dataset id.
   * @returns {void}
   */
  function handleContinue(datasetId) {
    ajaxContinueDataset(datasetId)
      .done(function (payload) {
        const result = payload && typeof payload === "object" ? payload : {};
        const caseNumber = Number(result.caseNumber);

        if (caseNumber === 1) {
          showContinueNotice("Dataset completado", "Este dataset ya está 100% anotado y revisado.");
          return;
        }

        if (caseNumber === 2) {
          showContinueNotice("Dataset pendiente de revisión", "Este dataset ya está 100% anotado, pero todavía no está completamente revisado.");
          return;
        }

        if (caseNumber === 3) {
          showContinueNotice("Sin secciones disponibles", "Todas las secciones pendientes están asignadas a otros usuarios.");
          return;
        }

        if (caseNumber === 4 || caseNumber === 5) {
          const selectedDataset = findDatasetById(datasetId);
          openAnnotations(
            datasetId,
            selectedDataset ? selectedDataset.options : null
          );
          return;
        }

        showContinueNotice("No se pudo continuar", "El servidor no devolvió una sección válida para anotar.");
      })
      .fail(function (xhr) {
        showContinueNotice("No se pudo continuar", extractApiErrorMessage(xhr, "No se pudo continuar el dataset."));
      });
  }

  /**
   * Shows a continuation notice using a modal if available (alert otherwise).
   * @param {string} title - Notice title.
   * @param {string} message - Notice message.
   */
  function showContinueNotice(title, message) {
    if (
      $continueDatasetModal.length &&
      globalThis.bootstrap !== undefined &&
      globalThis.bootstrap &&
      typeof globalThis.bootstrap.Modal === "function"
    ) {
      $continueDatasetModalLabel.text(title);
      $continueDatasetMessage.text(message);
      continueDatasetModalInstance =
        continueDatasetModalInstance ||
        globalThis.bootstrap.Modal.getOrCreateInstance($continueDatasetModal[0]);
      continueDatasetModalInstance.show();
      return;
    }

    alert(message);
  }

  /**
   * Opens the dataset's permission administration.
   * @param {*} datasetId - Dataset id.
   */
  function handleAdmin(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo abrir la administración del dataset seleccionado.");
      return;
    }

    globalThis.location.assign(`/datasets/${encodeURIComponent(normalisedDatasetId)}/admin`);
  }

  /**
   * Deletes a dataset after explicit confirmation.
   * @param {*} datasetId - Dataset id.
   */
  function handleDeleteDataset(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    const selectedDataset = findDatasetById(normalisedDatasetId);
    const datasetName = selectedDataset && typeof selectedDataset.name === "string"
      ? selectedDataset.name
      : `DATASET ${normalisedDatasetId}`;

    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo borrar el dataset seleccionado.");
      return;
    }

    const confirmed = globalThis.confirm(
      `Vas a borrar completamente el dataset "${datasetName}" y todos sus permisos, entradas, anotaciones y revisiones. Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    ajaxDeleteDataset(normalisedDatasetId)
      .done(function () {
        state.datasets = state.datasets.filter(function (dataset) {
          return Number(dataset.id) !== normalisedDatasetId;
        });
        renderDatasets(state.datasets);
      })
      .fail(function (xhr) {
        alert(extractApiErrorMessage(xhr, "No se pudo borrar el dataset."));
      });
  }

  /**
   * Opens the review screen filtered by dataset.
   * @param {*} datasetId - Selected dataset.
   */
  function handleReview(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0) {
      alert("No se pudo abrir la revisión del dataset seleccionado.");
      return;
    }

    globalThis.location.assign(`/reviewer?datasetId=${encodeURIComponent(normalisedDatasetId)}`);
  }

  /**
   * Handles the "new dataset" action: opens the creation modal.
   * @returns {void}
   */
  function handleCreateDataset() {
    if (
      $newDatasetModal.length
      && globalThis.bootstrap !== undefined
      && globalThis.bootstrap
      && typeof globalThis.bootstrap.Modal === "function"
    ) {
      $newDatasetForm[0].reset();
      newDatasetModalInstance =
        newDatasetModalInstance ||
        globalThis.bootstrap.Modal.getOrCreateInstance($newDatasetModal[0]);
      newDatasetModalInstance.show();
      return;
    }

    alert("No se pudo abrir el formulario de nuevo dataset.");
  }

  /**
   * Submits the dataset creation form.
   */
  function submitNewDataset() {
    const file = $newDatasetFile[0] && $newDatasetFile[0].files
      ? $newDatasetFile[0].files[0]
      : null;

    if (!file) {
      $newDatasetFile.trigger("focus");
      return;
    }

    const options = readNewDatasetOptions();
    $btnCreateDatasetSubmit.prop("disabled", true);

    ajaxUploadDataset(file, options)
      .done(function (response) {
        if (newDatasetModalInstance)
          newDatasetModalInstance.hide();
        loadDatasets();
        showCreateSuccessModal(response, file.name);
      })
      .fail(function (xhr) {
        const msg = extractApiErrorMessage(xhr, "No se pudo crear el dataset.");
        alert(msg);
      })
      .always(function () {
        $btnCreateDatasetSubmit.prop("disabled", false);
      });
  }

  /**
   * Binds the page's event handlers (cards, action buttons, form).
   */
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

    $container.on("click", '[data-action="admin"]', function () {
      const datasetId = $(this).data("id");
      handleAdmin(datasetId);
    });

    $container.on("click", '[data-action="delete"]', function () {
      const datasetId = $(this).data("id");
      handleDeleteDataset(datasetId);
    });

    $container.on("click", '[data-action="review"]', function () {
      const datasetId = $(this).data("id");
      handleReview(datasetId);
    });

    $container.on("click", ".dataset-button", function () {
      const datasetId = $(this).data("id");
      handleContinue(datasetId);
    });

    $btnNuevoDataset.on("click", function () {
      handleCreateDataset();
    });

    $newDatasetForm.on("submit", function (event) {
      event.preventDefault();
      submitNewDataset();
    });

    $(globalThis).on("scroll resize", function () {
      hideTooltip();
    });
  }

  $(document).ready(function () {
    bindEvents();
    loadDatasets();
  });
})();
