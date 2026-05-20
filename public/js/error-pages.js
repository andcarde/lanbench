// @ts-nocheck
/**
 * @file Frontend for the error pages (`bad-request.html`, `forbidden.html`,
 * `not-found.html`, `problema.html`).
 *
 * Shows the user a dynamic detail (the server message when present, the reason
 * from the querystring otherwise) and implements the "back" button.
 */
(function () {
  "use strict";

  /**
   * Injects the shared app toolbar into the error page if not already present.
   * @returns {void}
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
   * Resolves the requested path (pathname + querystring) for display.
   * @returns {string} The requested path.
   */
  function resolveRequestedPath() {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    return pathname + search;
  }

  /**
   * Populates the error metadata nodes (path, status and timestamp).
   * @returns {void}
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
