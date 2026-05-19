// @ts-nocheck
/**
 * @file Frontend de `public/dataset-view.html` — vista detalle de un dataset.
 *
 * Muestra el resumen del dataset (entries, progreso, idiomas, permisos del
 * usuario actual) y enlaces a flujos de anotacion/revision/admin segun los
 * permisos devueltos por el backend.
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

  /**
   * Obtiene search params desde la fuente correspondiente.
   * @returns {*} Resultado producido por la funcion.
   */
  function getSearchParams() {
    return new URLSearchParams(globalThis.location.search);
  }

  /**
   * Obtiene dataset context desde la fuente correspondiente.
   * @returns {*} Resultado producido por la funcion.
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
   * Obtiene dataset id from path desde la fuente correspondiente.
   * @param {string} pathname - Valor de pathname usado por la funcion.
   * @returns {*} Resultado producido por la funcion.
   */
  function getDatasetIdFromPath(pathname) {
    const match = String(pathname || "").match(/\/datasets\/(\d+)\/view(?:\/)?$/);
    if (!match)
      return null;

    const parsed = Number(match[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Obtiene fallback name desde la fuente correspondiente.
   * @param {*} datasetId - Valor de datasetId usado por la funcion.
   * @returns {*} Resultado producido por la funcion.
   */
  function getFallbackName(datasetId) {
    return datasetId ? `DATASET ${datasetId}` : "Dataset sin identificar";
  }

  /**
   * Actualiza viewer state con los datos indicados.
   * @param {string} text - Valor de text usado por la funcion.
   * @param {Array} stateClass - Valor de stateClass usado por la funcion.
   */
  function setViewerState(text, stateClass) {
    $datasetXmlViewer
      .removeClass("is-loading is-error")
      .addClass(stateClass || "")
      .val(text);
  }

  /**
   * Actualiza header con los datos indicados.
   * @param {*} context - Valor de context usado por la funcion.
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
   * Actualiza mode badge con los datos indicados.
   */
  function setModeBadge() {
    $datasetModePill.addClass("is-live");
    $datasetModeLabel.text("Modo servidor preparado");
  }

  /**
   * Actualiza navigation links con los datos indicados.
   * @param {*} context - Valor de context usado por la funcion.
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
   * Construye missing id message a partir de los datos recibidos.
   * @returns {*} Resultado producido por la funcion.
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
   * Obtiene dataset text desde la fuente correspondiente.
   * @param {*} datasetId - Valor de datasetId usado por la funcion.
   * @returns {Promise<*>} Resultado producido por la funcion.
   */
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

  $(document).ready(function () {
    const context = getDatasetContext();
    setHeader(context);
    setModeBadge();
    setNavigationLinks(context);
    loadDatasetText(context.datasetId);
  });
})();
