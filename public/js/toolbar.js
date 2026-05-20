// @ts-nocheck
/**
 * @file Top toolbar shared by the authenticated pages.
 *
 * Initializes the current user via `GET /api/session/me`, manages the logout
 * button (`DELETE /api/session`) and highlights the active item.
 */
(function () {
    "use strict";

    const LOGOUT_URL = "/api/session";
    const SESSION_ME_URL = "/api/session/me";
    const DEFAULT_REDIRECT = "/login";
    const MODERATOR_BADGE_LABEL = "moderator";

    /**
     * Builds the toolbar links from the user's server role.
     * @param {*} sessionUser - Object returned by /api/session/me.
     * @returns {*} Structure { isModerator, links, badgeLabel }.
     */
    function buildToolbarLinksForUser(sessionUser) {
        const isModerator = Boolean(sessionUser && sessionUser.isModerator === true);
        const links = [];

        if (isModerator) {
            links.push({ href: "/reviewer", label: "Revisión" });
            links.push({ href: "/tasks", label: "Administración" });
        }

        return {
            isModerator,
            links,
            badgeLabel: isModerator ? MODERATOR_BADGE_LABEL : null
        };
    }

    /**
     * Renders the moderator badge in the UI.
     * @param {string} label - Badge text.
     */
    function renderModeratorBadge(label) {
        const badge = document.createElement("span");
        badge.className = "app-toolbar-role-badge";
        badge.setAttribute("data-role", "moderator");
        badge.textContent = label;
        return badge;
    }

    /**
     * Renders the links and badge that depend on the server role.
     * @param {*} sessionUser - Object returned by /api/session/me.
     */
    function renderToolbarLinks(sessionUser) {
        const { links, badgeLabel } = buildToolbarLinksForUser(sessionUser);
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
        if (badgeLabel)
            actions.insertBefore(renderModeratorBadge(badgeLabel), nav);
    }

    /**
     * Gets the session user from the API.
     * @returns {Promise<*>} User object, or null.
     */
    function fetchSessionUser() {
        return fetch(SESSION_ME_URL, { credentials: "same-origin" })
            .then(function (response) {
                if (!response.ok)
                    return null;
                return response.json();
            })
            .catch(function () {
                return null;
            });
    }

    /**
     * Creates the toolbar header element with its markup.
     * @returns {HTMLElement} The toolbar element.
     */
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

    /**
     * Injects the toolbar into the page if not already present.
     * @returns {void}
     */
    function injectToolbar() {
        if (document.querySelector(".app-toolbar"))
            return;

        document.body.classList.add("has-app-toolbar");
        document.body.prepend(createToolbar());
    }

    /**
     * Redirects the browser to the login page (or the given target URL).
     * @param {string} targetUrl - Target URL to redirect to.
     * @returns {void}
     */
    function redirectToLogin(targetUrl) {
        window.location.assign(targetUrl || DEFAULT_REDIRECT);
    }

    /**
     * Binds the logout button click handler and coordinates its effects.
     */
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
                    method: "DELETE",
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
            buildToolbarLinksForUser
        };
    }

    if (typeof window === "undefined" || typeof document === "undefined")
        return;

    document.addEventListener("DOMContentLoaded", function () {
        injectToolbar();
        bindLogout();
        fetchSessionUser().then(function (sessionUser) {
            if (sessionUser)
                renderToolbarLinks(sessionUser);
        });
    });
})();
