(function () {
  "use strict";

  const $datasetIdentifier = $("#datasetIdentifier");
  const $datasetTitle = $("#datasetTitle");
  const $datasetSubtitle = $("#datasetSubtitle");
  const $datasetModePill = $("#datasetModePill");
  const $datasetModeLabel = $("#datasetModeLabel");
  const $datasetXmlViewer = $("#datasetXmlViewer");
  const $openAnnotationsLink = $("#openAnnotationsLink");

  function getSearchParams() {
    return new URLSearchParams(window.location.search);
  }

  function getDatasetContext() {
    const params = getSearchParams();
    const datasetId =
      Number(params.get("datasetId")) || getDatasetIdFromPath(window.location.pathname);
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

  function getDatasetIdFromPath(pathname) {
    const match = String(pathname || "").match(/\/datasets\/(\d+)\/view(?:\/)?$/);
    if (!match)
      return null;

    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function getFallbackName(datasetId) {
    return datasetId ? `DATASET ${datasetId}` : "Dataset sin identificar";
  }

  function setViewerState(text, stateClass) {
    $datasetXmlViewer
      .removeClass("is-loading is-error")
      .addClass(stateClass || "")
      .val(text);
  }

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

  function setModeBadge() {
    $datasetModePill.addClass("is-live");
    $datasetModeLabel.text("Modo servidor preparado");
  }

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

  function buildMissingIdMessage() {
    return [
      "No se ha indicado un dataset válido en la URL.",
      "",
      "Esperado: ?datasetId=123",
      "Opcional: ?datasetName=Nombre%20del%20dataset"
    ].join("\n");
  }

  function loadDatasetText(datasetId) {
    if (!datasetId) {
      setViewerState(buildMissingIdMessage(), "is-error");
      return;
    }

    fetchDatasetText(datasetId)
      .done(function (datasetText) {
        const safeText =
          typeof datasetText === "string" && datasetText.length > 0
            ? datasetText
            : "El servidor no ha devuelto contenido para este dataset.";
        setViewerState(safeText, "");
      })
      .fail(function (xhr) {
        const errorMessage =
          xhr && xhr.responseText
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

  $(document).ready(function () {
    const context = getDatasetContext();
    setHeader(context);
    setModeBadge();
    setNavigationLinks(context);
    loadDatasetText(context.datasetId);
  });
})();
