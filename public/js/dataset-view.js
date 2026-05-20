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
  const $datasetModePill = $("#datasetModePill");
  const $datasetModeLabel = $("#datasetModeLabel");
  const $datasetXmlViewer = $("#datasetXmlViewer");
  const $openAnnotationsLink = $("#openAnnotationsLink");
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
   * Updates the page header (title, identifier, subtitle) from the context.
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
    $datasetSubtitle.text("Vista conectada al endpoint AJAX del texto del dataset.");
  }

  /**
   * Sets the "server mode" badge as live.
   */
  function setModeBadge() {
    $datasetModePill.addClass("is-live");
    $datasetModeLabel.text("Modo servidor preparado");
  }

  /**
   * Sets the navigation links (e.g. the "open annotations" link) from the context.
   * @param {*} context - Dataset context.
   */
  function setNavigationLinks(context) {
    const searchParams = new URLSearchParams();

    if (context.datasetId)
      searchParams.set("datasetId", String(context.datasetId));
    if (context.sectionIndex)
      searchParams.set("sectionIndex", String(context.sectionIndex));

    $openAnnotationsLink.attr(
      "href",
      `/annotations?${searchParams.toString()}`
    );
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
   * Adjusts the controls that depend on the dataset's completion state:
   *   - Enables the extended-download button if the dataset is at 100%.
   *   - Disables the entry to annotation ("Open annotation") when there are no
   *     entries left to annotate.
   * If the query fails, the buttons stay in their default state.
   *
   * @param {number} datasetId
   */
  function refreshAnnotatedButtonState(datasetId) {
    globalThis.fetchDatasetSummary(datasetId)
      .done(function (dataset) {
        const completedPercent = Number(dataset && dataset.completedPercent);
        const isCompleted = Number.isFinite(completedPercent) && completedPercent >= 100;
        if (!isCompleted)
          return;

        $downloadAnnotatedBtn
          .prop("disabled", false)
          .removeAttr("aria-disabled")
          .removeClass("is-disabled")
          .attr("title", "Descargar el XML extendido con las anotaciones en español");

        $openAnnotationsLink
          .addClass("disabled")
          .attr("aria-disabled", "true")
          .attr("tabindex", "-1")
          .attr(
            "title",
            "El dataset está completado al 100%; no quedan entries por anotar."
          )
          .removeAttr("href");
      });
  }

  $(document).ready(function () {
    const context = getDatasetContext();
    setHeader(context);
    setModeBadge();
    setNavigationLinks(context);
    bindDownloadButtons(context);
    loadDatasetText(context.datasetId);
  });
})();
