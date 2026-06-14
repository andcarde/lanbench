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
   * Decides whether the current user may create datasets. Mirrors the
   * server-level rule enforced by `requireApiModerator()` on `POST /api/datasets`
   * and by the toolbar's `buildToolbarLinksForUser`: only moderators qualify.
   * Pure (no DOM), so it stays unit-testable.
   * @param {*} sessionUser - Object returned by `GET /api/session/me`, or null.
   * @returns {boolean} True when the user is a moderator.
   */
  function canCreateDataset(sessionUser) {
    return Boolean(sessionUser && sessionUser.isModerator === true);
  }

  /**
   * Derives the default dataset name from an uploaded file name: strips a
   * trailing `.xml` extension (case-insensitive) and trims. Pure (no DOM), so
   * the defaulting rule stays unit-testable.
   * @param {*} fileName - Uploaded file name.
   * @returns {string} Default dataset name.
   */
  function deriveDatasetNameFromFile(fileName) {
    return String(fileName || "").trim().replace(/\.xml$/i, "").trim();
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
      canCreateDataset,
      normaliseCriterion,
      deriveDatasetNameFromFile,
      normaliseDatasetOptions,
      normaliseSectionSize,
      applyNewDatasetFormRules,
      normaliseDatasetReviewState,
      reviewButtonTitle,
      isContinueDisabledForCorrection,
      continueDisabledTitle
    };
  }

  if (typeof window === "undefined" || typeof $ !== "function") {
    return;
  }

  const DATASETS_API_URL = "/api/datasets";
  const DATASETS_ALL_URL = "/api/datasets";
  const CREATE_DATASET_URL = "/api/datasets";
  const DATASET_VIEWS_URL = "/datasets";
  const SESSION_ME_URL = "/api/session/me";
  const $container = $("#datasetsContainer");
  const $tooltip = $("#datasetTooltip");
  const $tooltipTriples = $("#tooltipTriples");
  const $tooltipLanguages = $("#tooltipLanguages");
  const $btnNuevoDataset = $("#btnNuevoDataset");
  const $newDatasetModal = $("#newDatasetModal");
  const $newDatasetForm = $("#newDatasetForm");
  const $newDatasetFile = $("#newDatasetFile");
  const $newDatasetName = $("#newDatasetName");
  const $newDatasetDescription = $("#newDatasetDescription");
  const $newDatasetMessage = $("#newDatasetMessage");
  const DATASET_DESCRIPTION_MAX_LENGTH = 512;
  const $newDatasetLlmMode = $("#newDatasetLlmMode");
  const $newDatasetReviewEnabled = $("#newDatasetReviewEnabled");
  const $newDatasetAdditionalReviews = $("#newDatasetAdditionalReviews");
  const $newDatasetAdditionalReviewsField = $("#newDatasetAdditionalReviewsField");
  const $newDatasetSectionSize = $("#newDatasetSectionSize");
  const $btnCreateDatasetSubmit = $("#btnCreateDatasetSubmit");
  const $datasetSuccessModal = $("#datasetSuccessModal");
  const $datasetSuccessMessage = $("#datasetSuccessMessage");
  const $continueDatasetModal = $("#continueDatasetModal");
  const $continueDatasetModalLabel = $("#continueDatasetModalLabel");
  const $continueDatasetMessage = $("#continueDatasetMessage");
  const $autoAnnotationModal = $("#autoAnnotationModal");
  const $autoAnnotationForm = $("#autoAnnotationForm");
  const $autoAnnotationSectionsCount = $("#autoAnnotationSectionsCount");
  const $autoAnnotationFieldError = $("#autoAnnotationFieldError");
  const $autoAnnotationApiError = $("#autoAnnotationApiError");
  const $btnAutoAnnotationConfirm = $("#btnAutoAnnotationConfirm");
  const $autoAnnotationStatusModal = $("#autoAnnotationStatusModal");
  const $autoAnnotationStatusModalLabel = $("#autoAnnotationStatusModalLabel");
  const $autoAnnotationStatusEntries = $("#autoAnnotationStatusEntries");
  const $autoAnnotationStatusTotalEntries = $("#autoAnnotationStatusTotalEntries");
  const $autoAnnotationStatusSections = $("#autoAnnotationStatusSections");
  const $autoAnnotationStatusTotalSections = $("#autoAnnotationStatusTotalSections");
  const $autoAnnotationStatusError = $("#autoAnnotationStatusError");
  const $btnAutoAnnotationCancel = $("#btnAutoAnnotationCancel");
  const $btnAutoAnnotationRetry = $("#btnAutoAnnotationRetry");
  const state = {
    datasets: [],
    autoAnnotationJobs: {},
    autoAnnotationModalDatasetId: null,
    autoAnnotationStatusDatasetId: null,
    autoAnnotationPollHandle: null
  };
  let newDatasetModalInstance = null;
  let datasetSuccessModalInstance = null;
  let continueDatasetModalInstance = null;
  let autoAnnotationModalInstance = null;
  let autoAnnotationStatusModalInstance = null;

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
      reviewableCount: Number(review.reviewableCount || 0),
      blockedBySelfAnnotation: Boolean(review.blockedBySelfAnnotation)
    };
  }

  /**
   * Returns true when "Anotar" must be disabled because the dataset uses LLM
   * correction but Administración has not registered an active credential.
   * Mirrors the backend gate in `continueDatasetService.continueDataset` so the
   * UI and the API agree on the rule.
   * @param {*} input - `{ llmMode, hasActiveCredential }` (any shape, normalised here).
   * @returns {boolean} True when the button must be disabled for this reason.
   */
  function isContinueDisabledForCorrection(input) {
    const source = input && typeof input === "object" ? input : {};
    const llmMode = typeof source.llmMode === "string" ? source.llmMode.trim().toLowerCase() : "";
    if (llmMode !== "correction")
      return false;
    return source.hasActiveCredential !== true;
  }

  /**
   * Tooltip shown on a disabled "Anotar" button when it is blocked by the
   * missing-credential rule. Kept here so the wording stays unit-testable.
   * @returns {string} Tooltip text.
   */
  function continueDisabledTitle() {
    return "Falta una credencial de IA activa en Administración para este dataset.";
  }

  /**
   * Tooltip shown on the dataset review button. Pure, so the wording stays
   * unit-testable. When the button is disabled specifically because the reviewer
   * annotated every candidate entry, it explains the self-review rule instead of
   * the generic "nothing to review" (US-13).
   * @param {*} rawReview - Review state (already normalised or raw API shape).
   * @returns {string} Tooltip text.
   */
  function reviewButtonTitle(rawReview) {
    const review = normaliseDatasetReviewState(rawReview);
    if (review.reviewAvailable)
      return "Abrir revisión";
    if (review.blockedBySelfAnnotation)
      return "Todas las entradas pendientes han sido anotadas por ti. Otra persona debe ser el revisor.";
    return "No hay secciones pendientes de revisión";
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
      hasAdditionalReviews: Boolean(source.hasAdditionalReviews),
      sectionSize: normaliseSectionSize(source.sectionSize)
    };
  }

  /**
   * Parses a declarative section size: a positive integer, defaulting to 10
   * for missing / non-positive / non-numeric input (P4).
   * @param {*} rawValue - Raw value (string from the form, or a number).
   * @returns {number} Positive integer section size.
   */
  function normaliseSectionSize(rawValue) {
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
  }

  /**
   * Encodes the conditional "Nuevo dataset" creation rules (P6). Pure (no DOM),
   * so the rules are unit-testable and reused both by the form-state sync and
   * by the payload normalisation.
   *
   * R1: when review is disabled, "Revisiones adicionales" is meaningless — it
   *     is hidden and forced to `false`; when review is enabled it is shown.
   * R2: when the LLM mode is "correction", review is forced `true` and
   *     "Revisiones adicionales" is forced `true`; both are shown but locked
   *     (not alterable).
   *
   * @param {{ llmMode?:string, review?:boolean, additionalReviews?:boolean }} input
   * @returns {{ review:boolean, additionalReviews:boolean, reviewLocked:boolean, additionalShown:boolean, additionalLocked:boolean }}
   */
  function applyNewDatasetFormRules(input) {
    const source = input && typeof input === "object" ? input : {};
    const llmMode = String(source.llmMode || "none").trim().toLowerCase();

    if (llmMode === "correction") {
      return {
        review: true,
        additionalReviews: true,
        reviewLocked: true,
        additionalShown: true,
        additionalLocked: true
      };
    }

    const review = Boolean(source.review);
    return {
      review,
      additionalReviews: review ? Boolean(source.additionalReviews) : false,
      reviewLocked: false,
      additionalShown: review,
      additionalLocked: false
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
      hasActiveCredential: safeDataset.hasActiveCredential === true,
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

            ${(() => {
              const continueDisabled = isContinueDisabledForCorrection({
                llmMode: dataset.options && dataset.options.llmMode ? dataset.options.llmMode : "none",
                hasActiveCredential: dataset.hasActiveCredential
              });
              const titleAttr = continueDisabled ? ` title="${escapeHtml(continueDisabledTitle())}"` : "";
              const disabledAttr = continueDisabled ? " disabled" : "";
              return `<button
              type="button"
              class="btn btn-action btn-continue"
              data-action="continue"
              data-id="${dataset.id}"
              data-llm-mode="${escapeHtml(dataset.options && dataset.options.llmMode ? dataset.options.llmMode : "none")}"${titleAttr}${disabledAttr}
            >
              Anotar
            </button>`;
            })()}

            ${dataset.review && dataset.review.showReviewButton
              ? `
                <button
                  type="button"
                  class="btn btn-action btn-review"
                  data-action="review"
                  data-id="${dataset.id}"
                  title="${escapeHtml(reviewButtonTitle(dataset.review))}"
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
    const rules = applyNewDatasetFormRules({
      llmMode: $newDatasetLlmMode.val(),
      review: $newDatasetReviewEnabled.val() === "true",
      additionalReviews: $newDatasetAdditionalReviews.val() === "true"
    });
    return normaliseDatasetOptions({
      llmMode: $newDatasetLlmMode.val(),
      isReviewEnabled: rules.review,
      hasAdditionalReviews: rules.additionalReviews,
      sectionSize: $newDatasetSectionSize.val()
    });
  }

  /**
   * Reflects the conditional creation rules (P6) onto the form controls:
   * forces review/additional values, shows/hides the additional-reviews field,
   * and locks the controls that R2 fixes. Idempotent — safe to call on open
   * and on every change.
   */
  function syncNewDatasetFormRules() {
    const rules = applyNewDatasetFormRules({
      llmMode: $newDatasetLlmMode.val(),
      review: $newDatasetReviewEnabled.val() === "true",
      additionalReviews: $newDatasetAdditionalReviews.val() === "true"
    });

    $newDatasetReviewEnabled.val(String(rules.review));
    $newDatasetReviewEnabled.prop("disabled", rules.reviewLocked);

    $newDatasetAdditionalReviews.val(String(rules.additionalReviews));
    $newDatasetAdditionalReviews.prop("disabled", rules.additionalLocked || !rules.additionalShown);
    $newDatasetAdditionalReviewsField.toggleClass("d-none", !rules.additionalShown);
  }

  /**
   * Shows a message banner inside the new-dataset modal.
   * @param {string} text - Message text.
   * @param {string} type - Bootstrap contextual type.
   */
  function showNewDatasetMessage(text, type) {
    $newDatasetMessage
      .removeClass("d-none alert-success alert-danger alert-info")
      .addClass(`alert-${type || "info"}`)
      .text(text);
  }

  /**
   * Clears the new-dataset modal message banner.
   */
  function clearNewDatasetMessage() {
    $newDatasetMessage.addClass("d-none").text("");
  }

  /**
   * Uploads a new dataset XML file with its creation options.
   * @param {*} file - XML file to upload.
   * @param {*} options - Creation options.
   * @param {string} name - Dataset name chosen by the user.
   * @param {string} description - Optional dataset description.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxUploadDataset(file, options = {}, name = "", description = "") {
    const datasetOptions = normaliseDatasetOptions(options);
    const formData = new FormData();
    formData.append("xmlFile", file);
    formData.append("name", name);
    if (description && description.length > 0)
      formData.append("description", description);
    formData.append("llmMode", datasetOptions.llmMode);
    formData.append("isReviewEnabled", String(datasetOptions.isReviewEnabled));
    formData.append("hasAdditionalReviews", String(datasetOptions.hasAdditionalReviews));
    formData.append("sectionSize", String(datasetOptions.sectionSize));

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
        hydrateAutoAnnotationStates();
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
   * Handles the "continue" action.
   *
   * For `generation` datasets (US-33) the button is repurposed: while a job is
   * running it opens the status modal; otherwise it opens the automatic
   * annotation modal. Datasets in `correction`/`none` modes fall through to the
   * legacy manual flow (call `/continue`, navigate to `/annotations`).
   *
   * @param {*} datasetId - Dataset id.
   * @returns {void}
   */
  function handleContinue(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    const selectedDataset = findDatasetById(normalisedDatasetId);
    const llmMode = selectedDataset && selectedDataset.options
      ? selectedDataset.options.llmMode
      : "none";

    if (selectedDataset && isContinueDisabledForCorrection({
      llmMode,
      hasActiveCredential: selectedDataset.hasActiveCredential
    })) {
      showContinueNotice("Falta credencial de IA", continueDisabledTitle());
      return;
    }

    if (llmMode === "generation") {
      const cachedJob = state.autoAnnotationJobs[normalisedDatasetId];
      if (cachedJob && (cachedJob.status === "running" || cachedJob.status === "failed")) {
        openAutoAnnotationStatusModal(normalisedDatasetId);
        return;
      }
      openAutoAnnotationModal(normalisedDatasetId);
      return;
    }

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
   * Enables the "Nuevo dataset" button only for moderators. The button starts
   * disabled in the markup (safe default until the role is known); this fetches
   * the session and lifts the lock when `canCreateDataset` holds. Non-moderators
   * keep the disabled button and its explanatory title. The server still
   * enforces the rule via `requireApiModerator()` — this is UX only.
   * @returns {void}
   */
  function applyCreateDatasetPermission() {
    if (!$btnNuevoDataset.length)
      return;

    $.ajax({ url: SESSION_ME_URL, method: "GET" })
      .done(function (sessionUser) {
        if (!canCreateDataset(sessionUser))
          return;
        $btnNuevoDataset.prop("disabled", false).removeAttr("title");
      })
      .fail(function () {
        // On failure the button stays disabled (the safe default).
      });
  }

  /**
   * Handles the "new dataset" action: opens the creation modal.
   * @returns {void}
   */
  function handleCreateDataset() {
    if ($btnNuevoDataset.prop("disabled"))
      return;

    if (
      $newDatasetModal.length
      && globalThis.bootstrap !== undefined
      && globalThis.bootstrap
      && typeof globalThis.bootstrap.Modal === "function"
    ) {
      $newDatasetForm[0].reset();
      clearNewDatasetMessage();
      syncNewDatasetFormRules();
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

    const name = $newDatasetName.val().trim();
    if (!name) {
      showNewDatasetMessage("Indica un nombre para el dataset.", "danger");
      $newDatasetName.trigger("focus");
      return;
    }

    const description = String($newDatasetDescription.val() || "").trim();
    if (description.length > DATASET_DESCRIPTION_MAX_LENGTH) {
      showNewDatasetMessage(
        `La descripción del dataset no puede superar los ${DATASET_DESCRIPTION_MAX_LENGTH} caracteres.`,
        "danger"
      );
      $newDatasetDescription.trigger("focus");
      return;
    }

    const options = readNewDatasetOptions();
    clearNewDatasetMessage();
    $btnCreateDatasetSubmit.prop("disabled", true);

    ajaxUploadDataset(file, options, name, description)
      .done(function (response) {
        if (newDatasetModalInstance)
          newDatasetModalInstance.hide();
        loadDatasets();
        showCreateSuccessModal(response, file.name);
      })
      .fail(function (xhr) {
        // Keep the modal open and surface the reason inline (e.g. a duplicate
        // name) so the user can correct the name without re-opening the form.
        showNewDatasetMessage(
          extractApiErrorMessage(xhr, "No se pudo crear el dataset."),
          "danger"
        );
      })
      .always(function () {
        $btnCreateDatasetSubmit.prop("disabled", false);
      });
  }

  /**
   * Builds the URL to query/manage the auto-annotation job of a dataset.
   * @param {*} datasetId - Dataset id.
   * @param {string} suffix - Endpoint suffix ("", "/status", "/retry", "/cancel").
   * @returns {?string} URL, or null when the id is invalid.
   */
  function buildAutoAnnotationUrl(datasetId, suffix) {
    const normalisedId = Number(datasetId);
    if (!Number.isInteger(normalisedId) || normalisedId <= 0)
      return null;
    return `/api/annotations/auto/${encodeURIComponent(normalisedId)}${suffix || ""}`;
  }

  /**
   * Queries the active-credential status of a dataset (readable by any user
   * with a Permit on the dataset). Returns `{ hasActive, llmMode }`.
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxGetActiveCredentialStatus(datasetId) {
    return $.ajax({
      url: `/api/datasets/${encodeURIComponent(Number(datasetId))}/llm-credentials/active-status`,
      method: "GET",
      dataType: "json"
    });
  }

  /**
   * Queries the current auto-annotation job snapshot for a dataset.
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxGetAutoAnnotationStatus(datasetId) {
    return $.ajax({
      url: buildAutoAnnotationUrl(datasetId, "/status"),
      method: "GET",
      dataType: "json"
    });
  }

  /**
   * Starts an auto-annotation job for the given dataset.
   * @param {number} datasetId - Dataset id.
   * @param {number} sectionsCount - Number of sections to annotate.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxStartAutoAnnotation(datasetId, sectionsCount) {
    return $.ajax({
      url: buildAutoAnnotationUrl(datasetId, ""),
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ sectionsCount }),
      dataType: "json"
    });
  }

  /**
   * Asks the backend to resume a failed auto-annotation job.
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxRetryAutoAnnotation(datasetId) {
    return $.ajax({
      url: buildAutoAnnotationUrl(datasetId, "/retry"),
      method: "POST",
      dataType: "json"
    });
  }

  /**
   * Asks the backend to cancel an auto-annotation job and roll back the
   * partially annotated current section.
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function ajaxCancelAutoAnnotation(datasetId) {
    return $.ajax({
      url: buildAutoAnnotationUrl(datasetId, "/cancel"),
      method: "POST",
      dataType: "json"
    });
  }

  /**
   * Opens the "automatic annotation" modal: resets the field, checks whether
   * the dataset has an active AI credential and reflects the result onto the
   * confirmation button.
   *
   * @param {number} datasetId - Dataset id.
   */
  function openAutoAnnotationModal(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0)
      return;

    state.autoAnnotationModalDatasetId = normalisedDatasetId;

    $autoAnnotationSectionsCount.val("");
    $autoAnnotationFieldError.addClass("d-none").text("");
    $autoAnnotationApiError.addClass("d-none");
    $btnAutoAnnotationConfirm
      .prop("disabled", true)
      .removeClass("btn-primary")
      .addClass("btn-secondary");

    if (
      $autoAnnotationModal.length &&
      globalThis.bootstrap !== undefined &&
      globalThis.bootstrap &&
      typeof globalThis.bootstrap.Modal === "function"
    ) {
      autoAnnotationModalInstance =
        autoAnnotationModalInstance ||
        globalThis.bootstrap.Modal.getOrCreateInstance($autoAnnotationModal[0]);
      autoAnnotationModalInstance.show();
    }

    ajaxGetActiveCredentialStatus(normalisedDatasetId)
      .done(function (payload) {
        const hasActive = Boolean(payload && payload.hasActive);
        if (hasActive) {
          $autoAnnotationApiError.addClass("d-none");
          $btnAutoAnnotationConfirm
            .prop("disabled", false)
            .removeClass("btn-secondary")
            .addClass("btn-primary");
          return;
        }
        $autoAnnotationApiError.removeClass("d-none");
      })
      .fail(function () {
        $autoAnnotationApiError.removeClass("d-none");
      });
  }

  /**
   * Filters and normalises the value of the sections-count input on every
   * change: keeps digits only, enforces `maxLength = 3`, and strips a leading
   * `0` so the next digit replaces it (UX rule from US-33).
   *
   * @param {*} inputElement - Native input element.
   */
  function normaliseSectionsCountInput(inputElement) {
    const rawValue = String(inputElement.value || "");
    const digitsOnly = rawValue.replace(/\D+/g, "").slice(0, 3);

    let nextValue;
    if (digitsOnly.length > 1 && digitsOnly.startsWith("0")) {
      // The user is typing on top of a leading zero — replace it.
      nextValue = digitsOnly.replace(/^0+/, "") || "0";
    } else {
      nextValue = digitsOnly;
    }

    if (nextValue !== rawValue)
      inputElement.value = nextValue;

    // Clear the "minimum 1" message as soon as the user types a valid value.
    if (nextValue.length > 0 && Number(nextValue) >= 1)
      $autoAnnotationFieldError.addClass("d-none").text("");
  }

  /**
   * Handles a paste event into the sections-count field: replaces the
   * intended paste with its digit-only projection so non-numeric characters
   * never enter the field.
   *
   * @param {*} event - jQuery paste event.
   */
  function handleSectionsCountPaste(event) {
    const native = event.originalEvent || event;
    const clipboardData =
      (native && native.clipboardData) || globalThis.clipboardData;
    if (!clipboardData)
      return;

    const pasted = String(clipboardData.getData("text") || "");
    const digits = pasted.replace(/\D+/g, "");
    event.preventDefault();

    const inputElement = event.target;
    const previousValue = String(inputElement.value || "");
    const selectionStart = inputElement.selectionStart || previousValue.length;
    const selectionEnd = inputElement.selectionEnd || previousValue.length;
    const merged =
      previousValue.slice(0, selectionStart) + digits + previousValue.slice(selectionEnd);

    inputElement.value = merged.slice(0, 3);
    normaliseSectionsCountInput(inputElement);
  }

  /**
   * Submits the automatic-annotation form.
   */
  function submitAutoAnnotation() {
    const datasetId = state.autoAnnotationModalDatasetId;
    if (!Number.isInteger(datasetId) || datasetId <= 0)
      return;

    if ($btnAutoAnnotationConfirm.prop("disabled"))
      return;

    const rawValue = String($autoAnnotationSectionsCount.val() || "").trim();
    const numericValue = Number(rawValue);

    if (!rawValue || !Number.isInteger(numericValue) || numericValue < 1) {
      $autoAnnotationFieldError.removeClass("d-none").text("Mínimo 1");
      $autoAnnotationSectionsCount.trigger("focus");
      return;
    }

    $btnAutoAnnotationConfirm.prop("disabled", true);

    ajaxStartAutoAnnotation(datasetId, numericValue)
      .done(function (snapshot) {
        if (autoAnnotationModalInstance)
          autoAnnotationModalInstance.hide();
        rememberAutoAnnotationJob(datasetId, snapshot);
        applyAutoAnnotationButtonState(datasetId);
        scheduleAutoAnnotationPolling();
      })
      .fail(function (xhr) {
        $autoAnnotationFieldError
          .removeClass("d-none")
          .text(extractApiErrorMessage(xhr, "No se pudo iniciar la anotación automática."));
      })
      .always(function () {
        $btnAutoAnnotationConfirm.prop("disabled", false);
      });
  }

  /**
   * Refreshes the status modal contents from the latest server snapshot.
   *
   * @param {number} datasetId - Dataset id.
   */
  function openAutoAnnotationStatusModal(datasetId) {
    const normalisedDatasetId = Number(datasetId);
    if (!Number.isInteger(normalisedDatasetId) || normalisedDatasetId <= 0)
      return;

    state.autoAnnotationStatusDatasetId = normalisedDatasetId;
    renderAutoAnnotationStatus(state.autoAnnotationJobs[normalisedDatasetId] || null);

    if (
      $autoAnnotationStatusModal.length &&
      globalThis.bootstrap !== undefined &&
      globalThis.bootstrap &&
      typeof globalThis.bootstrap.Modal === "function"
    ) {
      autoAnnotationStatusModalInstance =
        autoAnnotationStatusModalInstance ||
        globalThis.bootstrap.Modal.getOrCreateInstance($autoAnnotationStatusModal[0]);
      autoAnnotationStatusModalInstance.show();
    }

    refreshAutoAnnotationStatus(normalisedDatasetId);
  }

  /**
   * Renders the status modal contents based on the current snapshot.
   *
   * @param {*} snapshot - Status snapshot or null.
   */
  function renderAutoAnnotationStatus(snapshot) {
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
    const status = safeSnapshot && safeSnapshot.status ? safeSnapshot.status : null;
    const entries = safeSnapshot ? Number(safeSnapshot.entriesAnnotated || 0) : 0;
    const totalEntries = safeSnapshot ? Number(safeSnapshot.totalEntries || 0) : 0;
    const sections = safeSnapshot ? Number(safeSnapshot.sectionsAnnotated || 0) : 0;
    const sectionsRequested = safeSnapshot ? Number(safeSnapshot.sectionsRequested || 0) : 0;

    $autoAnnotationStatusEntries.text(String(entries));
    $autoAnnotationStatusTotalEntries.text(String(totalEntries));
    $autoAnnotationStatusSections.text(String(sections));
    $autoAnnotationStatusTotalSections.text(String(sectionsRequested));

    if (status === "failed") {
      $autoAnnotationStatusModalLabel.text("Anotación con error");
      $autoAnnotationStatusError
        .removeClass("d-none")
        .text(safeSnapshot && safeSnapshot.lastError ? safeSnapshot.lastError : "Fallo durante la anotación.");
      $btnAutoAnnotationCancel.removeClass("d-none");
      $btnAutoAnnotationRetry.removeClass("d-none");
      return;
    }

    if (status === "completed") {
      $autoAnnotationStatusModalLabel.text("Anotación completada");
    } else {
      $autoAnnotationStatusModalLabel.text("Anotación en curso");
    }
    $autoAnnotationStatusError.addClass("d-none").text("");
    $btnAutoAnnotationCancel.addClass("d-none");
    $btnAutoAnnotationRetry.addClass("d-none");
  }

  /**
   * Pulls the latest status for the given dataset and updates the cached
   * snapshot + the status modal (when it is open for that dataset).
   *
   * @param {number} datasetId - Dataset id.
   * @returns {*} jQuery AJAX promise.
   */
  function refreshAutoAnnotationStatus(datasetId) {
    return ajaxGetAutoAnnotationStatus(datasetId)
      .done(function (snapshot) {
        rememberAutoAnnotationJob(datasetId, snapshot);
        if (state.autoAnnotationStatusDatasetId === Number(datasetId))
          renderAutoAnnotationStatus(state.autoAnnotationJobs[datasetId]);
        applyAutoAnnotationButtonState(datasetId);
      })
      .fail(function () {
        // Network blip — keep the cached snapshot; the next poll will retry.
      });
  }

  /**
   * Updates the local cache of the auto-annotation job for a dataset. When
   * `snapshot.hasJob === false`, the entry is removed (the button goes back
   * to "Anotar").
   *
   * @param {number} datasetId - Dataset id.
   * @param {*} snapshot - Snapshot returned by the backend.
   */
  function rememberAutoAnnotationJob(datasetId, snapshot) {
    const normalisedDatasetId = Number(datasetId);
    const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
    if (!safeSnapshot || safeSnapshot.hasJob === false) {
      delete state.autoAnnotationJobs[normalisedDatasetId];
      return;
    }
    state.autoAnnotationJobs[normalisedDatasetId] = safeSnapshot;
  }

  /**
   * Reflects the latest job state on the dataset row's "Anotar" button (the
   * label and the title attribute). When there is an active or failed job,
   * the button reads "En curso"; otherwise it reads "Anotar".
   *
   * @param {number} datasetId - Dataset id.
   */
  function applyAutoAnnotationButtonState(datasetId) {
    const job = state.autoAnnotationJobs[Number(datasetId)] || null;
    const $button = $container.find(
      `[data-action="continue"][data-id="${Number(datasetId)}"]`
    );
    if ($button.length === 0)
      return;

    if (job && (job.status === "running" || job.status === "failed")) {
      $button.text("En curso");
      $button.attr("title", job.status === "failed"
        ? "Anotación con error — clic para reintentar"
        : "Anotación automática en curso");
      return;
    }
    $button.text("Anotar");
    $button.removeAttr("title");
  }

  /**
   * Starts a periodic poll that refreshes every dataset with an in-flight
   * auto-annotation job. Idempotent: a single timer is kept regardless of how
   * many times it is requested. Stops itself when no job is in flight.
   */
  function scheduleAutoAnnotationPolling() {
    if (state.autoAnnotationPollHandle !== null)
      return;
    state.autoAnnotationPollHandle = globalThis.setInterval(function () {
      const activeDatasetIds = Object.keys(state.autoAnnotationJobs).filter(function (key) {
        const job = state.autoAnnotationJobs[key];
        return job && job.status === "running";
      });

      if (activeDatasetIds.length === 0) {
        globalThis.clearInterval(state.autoAnnotationPollHandle);
        state.autoAnnotationPollHandle = null;
        return;
      }

      activeDatasetIds.forEach(function (key) {
        refreshAutoAnnotationStatus(Number(key));
      });
    }, 3000);
  }

  /**
   * Resolves the initial auto-annotation state for every visible `generation`
   * dataset: one status call per dataset, so the "Anotar" / "En curso" label
   * matches reality even after a page reload.
   */
  function hydrateAutoAnnotationStates() {
    const targets = state.datasets.filter(function (dataset) {
      return dataset && dataset.options && dataset.options.llmMode === "generation";
    });

    targets.forEach(function (dataset) {
      refreshAutoAnnotationStatus(dataset.id);
    });

    if (targets.length > 0)
      scheduleAutoAnnotationPolling();
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

    // Default the dataset name to the chosen file name (without `.xml`).
    $newDatasetFile.on("change", function () {
      const file = this.files && this.files[0] ? this.files[0] : null;
      if (file)
        $newDatasetName.val(deriveDatasetNameFromFile(file.name));
    });

    // Description: 3-layer cap at DATASET_DESCRIPTION_MAX_LENGTH (512). `maxlength`
    // handles typing; `input` hard-truncates any overflow that slipped through
    // (IME, autofill, programmatic value); `paste` intercepts the paste and clips
    // the merged value so a paste-over-selection can never exceed the limit.
    $newDatasetDescription.on("input", function () {
      if (this.value.length > DATASET_DESCRIPTION_MAX_LENGTH)
        this.value = this.value.slice(0, DATASET_DESCRIPTION_MAX_LENGTH);
    });

    $newDatasetDescription.on("paste", function (event) {
      const native = event.originalEvent || event;
      const clipboardData =
        (native && native.clipboardData) || globalThis.clipboardData;
      if (!clipboardData)
        return;

      const pasted = String(clipboardData.getData("text") || "");
      event.preventDefault();

      const inputElement = event.target;
      const previousValue = String(inputElement.value || "");
      const selectionStart =
        typeof inputElement.selectionStart === "number"
          ? inputElement.selectionStart
          : previousValue.length;
      const selectionEnd =
        typeof inputElement.selectionEnd === "number"
          ? inputElement.selectionEnd
          : previousValue.length;
      const merged =
        previousValue.slice(0, selectionStart)
        + pasted
        + previousValue.slice(selectionEnd);

      inputElement.value = merged.slice(0, DATASET_DESCRIPTION_MAX_LENGTH);
    });

    // Keep the conditional creation rules (P6) in sync as the user changes the
    // LLM mode or the review toggle.
    $newDatasetLlmMode.on("change", syncNewDatasetFormRules);
    $newDatasetReviewEnabled.on("change", syncNewDatasetFormRules);

    $(globalThis).on("scroll resize", function () {
      hideTooltip();
    });

    $autoAnnotationForm.on("submit", function (event) {
      event.preventDefault();
      submitAutoAnnotation();
    });

    $autoAnnotationSectionsCount.on("input", function () {
      normaliseSectionsCountInput(this);
    });

    $autoAnnotationSectionsCount.on("paste", function (event) {
      handleSectionsCountPaste(event);
    });

    $autoAnnotationSectionsCount.on("keydown", function (event) {
      // Allow only digits and the standard editing/navigation keys; everything
      // else is blocked so the field never receives non-numeric input.
      const allowedKeys = [
        "Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight",
        "ArrowUp", "ArrowDown", "Home", "End"
      ];
      if (allowedKeys.includes(event.key))
        return;
      if (event.ctrlKey || event.metaKey)
        return;
      if (event.key.length === 1 && /[0-9]/.test(event.key))
        return;
      event.preventDefault();
    });

    $btnAutoAnnotationRetry.on("click", function () {
      const datasetId = state.autoAnnotationStatusDatasetId;
      if (!Number.isInteger(datasetId) || datasetId <= 0)
        return;
      $btnAutoAnnotationRetry.prop("disabled", true);
      ajaxRetryAutoAnnotation(datasetId)
        .done(function (snapshot) {
          rememberAutoAnnotationJob(datasetId, snapshot);
          renderAutoAnnotationStatus(snapshot);
          applyAutoAnnotationButtonState(datasetId);
          scheduleAutoAnnotationPolling();
        })
        .fail(function (xhr) {
          $autoAnnotationStatusError
            .removeClass("d-none")
            .text(extractApiErrorMessage(xhr, "No se pudo reintentar la anotación automática."));
        })
        .always(function () {
          $btnAutoAnnotationRetry.prop("disabled", false);
        });
    });

    $btnAutoAnnotationCancel.on("click", function () {
      const datasetId = state.autoAnnotationStatusDatasetId;
      if (!Number.isInteger(datasetId) || datasetId <= 0)
        return;
      $btnAutoAnnotationCancel.prop("disabled", true);
      ajaxCancelAutoAnnotation(datasetId)
        .done(function () {
          rememberAutoAnnotationJob(datasetId, { hasJob: false });
          applyAutoAnnotationButtonState(datasetId);
          if (autoAnnotationStatusModalInstance)
            autoAnnotationStatusModalInstance.hide();
          loadDatasets();
        })
        .fail(function (xhr) {
          $autoAnnotationStatusError
            .removeClass("d-none")
            .text(extractApiErrorMessage(xhr, "No se pudo cancelar la anotación automática."));
        })
        .always(function () {
          $btnAutoAnnotationCancel.prop("disabled", false);
        });
    });
  }

  $(document).ready(function () {
    bindEvents();
    applyCreateDatasetPermission();
    loadDatasets();
  });
})();
