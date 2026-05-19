// @ts-nocheck
/**
 * @file Toolbar superior compartida por las paginas autenticadas.
 *
 * Inicializa el usuario actual via `GET /api/session/me`, gestiona el
 * boton de logout (`DELETE /api/session`) y resalta el item activo.
 */
(function () {
    "use strict";

    const LOGOUT_URL = "/api/session";
    const SESSION_ME_URL = "/api/session/me";
    const DEFAULT_REDIRECT = "/login";
    const MODERATOR_BADGE_LABEL = "moderator";

    /**
     * Construye los enlaces del toolbar a partir del rol de servidor del usuario.
     * @param {*} sessionUser - Objeto devuelto por /api/session/me.
     * @returns {*} Estructura { isModerator, links, badgeLabel }.
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
     * Renderiza la insignia de moderador en la interfaz.
     * @param {string} label - Texto de la insignia.
     */
    function renderModeratorBadge(label) {
        const badge = document.createElement("span");
        badge.className = "app-toolbar-role-badge";
        badge.setAttribute("data-role", "moderator");
        badge.textContent = label;
        return badge;
    }

    /**
     * Renderiza los enlaces y la insignia que dependen del rol de servidor.
     * @param {*} sessionUser - Objeto devuelto por /api/session/me.
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
     * Obtiene el usuario de sesion desde la API.
     * @returns {Promise<*>} Objeto del usuario o null.
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
     * Crea toolbar con la configuracion recibida.
     * @returns {*} Resultado producido por la funcion.
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
     * Ejecuta la logica de inject toolbar.
     * @returns {*} Resultado producido por la funcion.
     */
    function injectToolbar() {
        if (document.querySelector(".app-toolbar"))
            return;

        document.body.classList.add("has-app-toolbar");
        document.body.prepend(createToolbar());
    }

    /**
     * Ejecuta la logica de redirect to login.
     * @param {string} targetUrl - Valor de targetUrl usado por la funcion.
     * @returns {*} Resultado producido por la funcion.
     */
    function redirectToLogin(targetUrl) {
        window.location.assign(targetUrl || DEFAULT_REDIRECT);
    }

    /**
     * Ejecuta bind logout y coordina sus efectos asociados.
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
