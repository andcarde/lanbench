// @ts-nocheck
/**
 * @file Frontend for `public/dataset-view.html` — dataset detail view.
 *
 * Shows the dataset summary (entries, progress, languages, current user's
 * permissions) and links to annotation/review/admin flows according to the
 * permissions returned by the backend.
 */
(function () {
  "use strict";

  const $datasetIdentifier = $("#datasetIdentifier");
  const $datasetTitle = $("#datasetTitle");
  const $datasetSubtitle = $("#datasetSubtitle");
  const $datasetXmlViewer = $("#datasetXmlViewer");
  const $downloadOriginalBtn = $("#downloadOriginalBtn");
  const $downloadAnnotatedBtn = $("#downloadAnnotatedBtn");

  /**
   * Gets the URL search params.
   * @returns {URLSearchParams} The current query parameters.
   */
  function getSearchParams() {
    return new URLSearchParams(globalThis.location.search);
  }

  /**
   * Resolves the dataset context (id, section, name) from the URL.
   * @returns {*} Dataset context object.
   */
  function getDatasetContext() {
    const params = getSearchParams();
    const datasetId =
      Number(params.get("datasetId")) || getDatasetIdFromPath(globalThis.location.pathname);
    const datasetName = params.get("datasetName");
    const sectionIndex = Number(params.get("sectionIndex") || params.get("section")) || 1;

    return {
      datasetId: Number.isInteger(datasetId) && datasetId > 0 ? datasetId : null,
      sectionIndex: Number.isInteger(sectionIndex) && sectionIndex > 0 ? sectionIndex : 1,
      datasetName:
        typeof datasetName === "string" && datasetName.trim().length > 0
          ? datasetName.trim()
          : null
    };
  }

  /**
   * Extracts the dataset id from a `/datasets/:id/view` pathname.
   * @param {string} pathname - URL pathname.
   * @returns {?number} Dataset id, or null.
   */
  function getDatasetIdFromPath(pathname) {
    const match = String(pathname || "").match(/\/datasets\/(\d+)\/view(?:\/)?$/);
    if (!match)
      return null;

    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Builds a fallback display name from the dataset id.
   * @param {*} datasetId - Dataset id.
   * @returns {string} Fallback name.
   */
  function getFallbackName(datasetId) {
    return datasetId ? `DATASET ${datasetId}` : "Dataset sin identificar";
  }

  /**
   * Updates the XML viewer's text and state class.
   * @param {string} text - Text to show in the viewer.
   * @param {string} stateClass - CSS state class (e.g. 'is-loading', 'is-error').
   */
  function setViewerState(text, stateClass) {
    $datasetXmlViewer
      .removeClass("is-loading is-error")
      .addClass(stateClass || "")
      .val(text);
  }

  /**
   * Updates the page header (title, identifier) from the context. The subtitle
   * is populated later from the dataset summary (`applyDatasetDescription`)
   * because the description is owned by the server, not the URL context.
   * @param {*} context - Dataset context.
   */
  function setHeader(context) {
    const datasetName = context.datasetName || getFallbackName(context.datasetId);
    const identifier = context.datasetId
      ? `Dataset ${context.datasetId}`
      : "Dataset";

    document.title = `${datasetName} | Visualizador`;
    $datasetIdentifier.text(identifier);
    $datasetTitle.text(datasetName);
  }

  /**
   * Renders the dataset description as the header subtitle. Hides the node
   * when the description is absent or empty.
   * @param {*} dataset - Dataset summary returned by the API.
   */
  function applyDatasetDescription(dataset) {
    const description =
      dataset && typeof dataset.description === "string"
        ? dataset.description.trim()
        : "";

    if (description.length === 0) {
      $datasetSubtitle.addClass("d-none").text("");
      return;
    }

    $datasetSubtitle.removeClass("d-none").text(description);
  }

  /**
   * Builds the message shown when no valid dataset id is present in the URL.
   * @returns {string} The message text.
   */
  function buildMissingIdMessage() {
    return [
      "No se ha indicado un dataset válido en la URL.",
      "",
      "Esperado: ?datasetId=123",
      "Opcional: ?datasetName=Nombre%20del%20dataset"
    ].join("\n");
  }

  /**
   * Loads the dataset text into the viewer, handling missing-id and errors.
   * @param {*} datasetId - Dataset id to load.
   * @returns {Promise<*>}
   */
  function loadDatasetText(datasetId) {
    if (!datasetId) {
      setViewerState(buildMissingIdMessage(), "is-error");
      return;
    }

    window.fetchDatasetText(datasetId)
      .done(function (datasetText) {
        const safeText =
          typeof datasetText === "string" && datasetText.length > 0
            ? datasetText
            : "El servidor no ha devuelto contenido para este dataset.";
        setViewerState(safeText, "");
      })
      .fail(function (xhr) {
        const errorMessage =
          xhr?.responseText
            ? xhr.responseText
            : [
                "No se pudo cargar el texto del dataset desde el servidor.",
                "",
                `Endpoint previsto: /api/datasets/${encodeURIComponent(String(datasetId))}/text`,
                "El endpoint todavía no está implementado."
              ].join("\n");

        setViewerState(errorMessage, "is-error");
      });
  }

  /**
   * Binds the download buttons to the loaded dataset context.
   * @param {*} context - Context with the resolved datasetId.
   */
  function bindDownloadButtons(context) {
    if (!context.datasetId) {
      $downloadOriginalBtn.prop("disabled", true).addClass("is-disabled");
      $downloadAnnotatedBtn.prop("disabled", true).addClass("is-disabled");
      return;
    }

    $downloadOriginalBtn.on("click", function () {
      globalThis.downloadDatasetXml(context.datasetId);
    });

    $downloadAnnotatedBtn.on("click", function () {
      if ($downloadAnnotatedBtn.prop("disabled"))
        return;
      globalThis.downloadAnnotatedDatasetXml(context.datasetId);
    });

    refreshAnnotatedButtonState(context.datasetId);
  }

  /**
   * Fetches the dataset summary once and uses it to:
   *   - render the dataset description as the header subtitle (US-34); and
   *   - enable the extended-download button when the dataset is at 100%.
   * If the query fails the subtitle stays hidden and the button stays in its
   * default disabled state.
   *
   * @param {number} datasetId
   */
  function refreshAnnotatedButtonState(datasetId) {
    globalThis.fetchDatasetSummary(datasetId)
      .done(function (dataset) {
        applyDatasetDescription(dataset);

        const completedPercent = Number(dataset && dataset.completedPercent);
        const isCompleted = Number.isFinite(completedPercent) && completedPercent >= 100;
        if (!isCompleted)
          return;

        $downloadAnnotatedBtn
          .prop("disabled", false)
          .removeAttr("aria-disabled")
          .removeClass("is-disabled")
          .attr("title", "Descargar el XML extendido con las anotaciones en español");
      });
  }

  $(document).ready(function () {
    const context = getDatasetContext();
    setHeader(context);
    bindDownloadButtons(context);
    loadDatasetText(context.datasetId);
  });
})();
