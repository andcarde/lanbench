// @ts-nocheck
/**
 * @file Frontend de las paginas de error (`bad-request.html`,
 * `forbidden.html`, `not-found.html`, `problema.html`).
 *
 * Muestra al usuario un detalle dinamico (mensaje del servidor cuando lo
 * hay, motivo desde la querystring si no) e implementa el boton "volver".
 */
(function () {
  "use strict";

  /**
   * Ejecuta la logica de inject toolbar.
   * @returns {*} Resultado producido por la funcion.
   */
  function injectToolbar() {
    if (document.querySelector(".app-toolbar"))
      return;

    const toolbar = document.createElement("header");
    toolbar.className = "app-toolbar";
    toolbar.innerHTML = `
      <div class="app-toolbar-inner">
        <a class="app-toolbar-brand" href="/">Lanbench</a>
        <div class="app-toolbar-actions">
          <a class="error-toolbar-link" href="/">Inicio</a>
        </div>
      </div>
    `;

    document.body.classList.add("has-app-toolbar");
    document.body.prepend(toolbar);
  }

  /**
   * Ejecuta la logica de resolve requested path.
   * @returns {*} Resultado producido por la funcion.
   */
  function resolveRequestedPath() {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    return pathname + search;
  }

  /**
   * Actualiza metadata con los datos indicados.
   */
  function populateMetadata() {
    const pathNode = document.getElementById("errorPathValue");
    if (pathNode)
      pathNode.textContent = resolveRequestedPath();

    const statusNode = document.getElementById("errorStatusValue");
    if (statusNode) {
      const { errorCode, errorLabel } = document.body.dataset;
      statusNode.textContent = `${errorCode || ""} ${errorLabel || ""}`.trim();
    }

    const timestampNode = document.getElementById("errorTimestampValue");
    if (timestampNode) {
      timestampNode.textContent = new Intl.DateTimeFormat("es-ES", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date());
    }
  }

  if (typeof window === "undefined" || typeof document === "undefined")
    return;

  document.addEventListener("DOMContentLoaded", function () {
    injectToolbar();
    populateMetadata();
  });
})();
