(function () {
  "use strict";

  const LOGOUT_URL = "/api/administrator/logout";
  const SESSION_ME_URL = "/api/session/me";
  const DEFAULT_REDIRECT = "/login";
  const ROLE_ANNOTATOR = "annotator";
  const ROLE_REVIEWER = "reviewer";
  const ROLE_ADMIN = "admin";
  const VALID_ROLES = [ROLE_ANNOTATOR, ROLE_REVIEWER, ROLE_ADMIN];

  function normaliseRole(role) {
    if (typeof role === "string" && VALID_ROLES.indexOf(role) !== -1)
      return role;
    return ROLE_ANNOTATOR;
  }

  function buildToolbarLinksForRole(role) {
    const normalised = normaliseRole(role);
    const links = [];

    if (normalised === ROLE_REVIEWER || normalised === ROLE_ADMIN)
      links.push({ href: "/reviewer", label: "Revisión" });

    if (normalised === ROLE_ADMIN)
      links.push({ href: "/tasks", label: "Administración" });

    return {
      role: normalised,
      links,
      badgeLabel: normalised
    };
  }

  function renderRoleBadge(role) {
    const badge = document.createElement("span");
    badge.className = "app-toolbar-role-badge";
    badge.setAttribute("data-role", role);
    badge.textContent = role;
    return badge;
  }

  function renderToolbarLinks(role) {
    const { links, badgeLabel } = buildToolbarLinksForRole(role);
    const actions = document.querySelector(".app-toolbar-actions");
    if (!actions)
      return;

    const nav = document.createElement("nav");
    nav.className = "app-toolbar-links";

    for (const linkDef of links) {
      const anchor = document.createElement("a");
      anchor.className = "app-toolbar-link";
      anchor.setAttribute("data-role-link", linkDef.href);
      anchor.href = linkDef.href;
      anchor.textContent = linkDef.label;
      nav.appendChild(anchor);
    }

    actions.insertBefore(nav, actions.firstChild);
    actions.insertBefore(renderRoleBadge(badgeLabel), nav);
  }

  function fetchSessionRole() {
    return fetch(SESSION_ME_URL, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok)
          return null;
        return response.json();
      })
      .then(function (payload) {
        if (payload && typeof payload.role === "string")
          return payload.role;
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function createToolbar() {
    const toolbar = document.createElement("header");
    toolbar.className = "app-toolbar";
    toolbar.innerHTML = `
      <div class="app-toolbar-inner">
        <a class="app-toolbar-brand" href="/tasks">Lanbench</a>
        <div class="app-toolbar-actions">
          <button type="button" class="btn btn-danger app-toolbar-logout" id="appToolbarLogoutButton">
            Cerrar sesión
          </button>
        </div>
      </div>
    `;

    return toolbar;
  }

  function injectToolbar() {
    if (document.querySelector(".app-toolbar"))
      return;

    document.body.classList.add("has-app-toolbar");
    document.body.prepend(createToolbar());
  }

  function redirectToLogin(targetUrl) {
    window.location.assign(targetUrl || DEFAULT_REDIRECT);
  }

  function bindLogout() {
    const logoutButton = document.getElementById("appToolbarLogoutButton");
    if (!logoutButton)
      return;

    logoutButton.addEventListener("click", async function () {
      logoutButton.disabled = true;
      const originalText = logoutButton.textContent;
      logoutButton.textContent = "Cerrando...";

      try {
        const response = await fetch(LOGOUT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        });

        const payload = await response.json().catch(function () {
          return {};
        });

        if (!response.ok)
          throw new Error(payload.message || "No se pudo cerrar la sesión.");

        redirectToLogin(payload.redirectTo);
      } catch (error) {
        logoutButton.disabled = false;
        logoutButton.textContent = originalText;
        window.alert(error.message || "No se pudo cerrar la sesión.");
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buildToolbarLinksForRole,
      normaliseRole
    };
  }

  if (typeof window === "undefined" || typeof document === "undefined")
    return;

  document.addEventListener("DOMContentLoaded", function () {
    injectToolbar();
    bindLogout();
    fetchSessionRole().then(function (role) {
      if (role)
        renderToolbarLinks(role);
    });
  });
})();
