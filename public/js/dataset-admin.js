// @ts-nocheck
/**
 * @file Frontend de `public/dataset-admin.html`.
 *
 * Consulta los permisos por dataset (`GET /api/datasets/:id/permissions`)
 * y permite al owner/admin modificarlos con `POST`/`PATCH` sobre la misma
 * coleccion. Trabaja sobre tres roles por dataset:
 * `annotator`/`reviewer`/`admin`.
 */
(function () {
  "use strict";

  const ROLE_KEYS = ["annotator", "reviewer", "admin"];
  const state = {
    datasetId: null,
    users: [],
    isReviewEnabled: false
  };

  /**
   * Devuelve los roles visibles segun la configuracion del dataset.
   * @returns {string[]} Roles visibles.
   */
  function visibleRoleKeys() {
    return ROLE_KEYS.filter(role => role !== "reviewer" || state.isReviewEnabled);
  }

  /**
   * Calcula el colspan para mensajes de la tabla (1 columna de usuario + roles visibles).
   * @returns {number} Colspan.
   */
  function rolesColspan() {
    return 1 + visibleRoleKeys().length;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      extractDatasetIdFromPath,
      normalisePermissionUser,
      buildPermissionsUpdatePayload
    };
  }

  if (typeof globalThis === "undefined" || typeof $ !== "function")
    return;

  const $subtitle = $("#datasetAdminSubtitle");
  const $message = $("#permissionMessage");
  const $tableBody = $("#permissionsTableBody");
  const $form = $("#addPermissionForm");
  const $emailInput = $("#userEmailInput");
  const $btnAddUser = $("#btnAddUser");
  const $optLlmMode = $("#optLlmMode");
  const $optReviewEnabled = $("#optReviewEnabled");
  const $optAdditionalReviews = $("#optAdditionalReviews");
  const $annotationStatsTable = $("#annotationStatsTable");
  const $reviewStatsTable = $("#reviewStatsTable");
  const $reviewStatsTabItem = $("#reviewStatsTab").closest(".nav-item");
  const $reviewStatsPane = $("#reviewStatsPane");

  /**
   * Escapa html.
   * @param {*} value - Texto.
   * @returns {string} Texto escapado.
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /**
   * Muestra mensaje.
   * @param {string} text - Mensaje.
   * @param {string} type - Tipo Bootstrap.
   */
  function showMessage(text, type) {
    $message
      .removeClass("d-none alert-success alert-danger alert-info")
      .addClass(`alert-${type || "info"}`)
      .text(text);
  }

  /**
   * Limpia mensaje.
   */
  function clearMessage() {
    $message.addClass("d-none").text("");
  }

  /**
   * Extrae id de dataset desde la ruta.
   * @param {string} pathName - Path.
   * @returns {?number} Id.
   */
  function extractDatasetIdFromPath(pathName) {
    const match = String(pathName || "").match(/\/datasets\/(\d+)\/admin(?:\/)?$/);
    const parsed = match ? Number(match[1]) : null;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Normaliza usuario de permisos.
   * @param {*} rawUser - Usuario crudo.
   * @returns {*} Usuario normalizado.
   */
  function normalisePermissionUser(rawUser) {
    const source = rawUser && typeof rawUser === "object" ? rawUser : {};
    const permissions = source.permissions && typeof source.permissions === "object"
      ? source.permissions
      : {};

    return {
      userId: Number(source.userId || 0),
      email: source.email || "",
      permissions: {
        annotator: Boolean(permissions.annotator),
        reviewer: Boolean(permissions.reviewer),
        admin: Boolean(permissions.admin)
      }
    };
  }

  /**
   * Construye payload de permisos para enviar al backend.
   * @param {*} permissions - Permisos.
   * @returns {*} Payload.
   */
  function buildPermissionsUpdatePayload(permissions) {
    const source = permissions && typeof permissions === "object" ? permissions : {};
    return {
      permissions: {
        annotator: Boolean(source.annotator),
        reviewer: Boolean(source.reviewer),
        admin: Boolean(source.admin)
      }
    };
  }

  /**
   * URL base de permisos.
   * @returns {string} URL.
   */
  function permissionsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/permissions`;
  }

  /**
   * URL de estadisticas.
   * @returns {string} URL.
   */
  function statisticsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/statistics`;
  }

  /**
   * Extrae mensaje de error.
   * @param {*} xhr - Error ajax.
   * @param {string} fallback - Fallback.
   * @returns {string} Mensaje.
   */
  function extractErrorMessage(xhr, fallback) {
    if (xhr && xhr.responseJSON && typeof xhr.responseJSON.message === "string")
      return xhr.responseJSON.message;
    if (xhr && typeof xhr.responseText === "string" && xhr.responseText.trim())
      return xhr.responseText;
    return fallback;
  }

  /**
   * Aplica las opciones del dataset a los controles de la sección Opciones.
   * @param {*} options - Opciones del dataset.
   */
  function renderOptions(options) {
    const source = options && typeof options === "object" ? options : {};
    $optLlmMode.val(source.llmMode || "none");
    $optReviewEnabled.val(String(Boolean(source.isReviewEnabled)));
    $optAdditionalReviews.val(String(Boolean(source.hasAdditionalReviews)));
    applyReviewTabVisibility(Boolean(source.isReviewEnabled));
  }

  /**
   * Muestra u oculta la pestana de Revision segun la opcion isReviewEnabled.
   * @param {boolean} isReviewEnabled - True si el dataset tiene revision activa.
   */
  function applyReviewTabVisibility(isReviewEnabled) {
    state.isReviewEnabled = Boolean(isReviewEnabled);
    if (state.isReviewEnabled) {
      $reviewStatsTabItem.removeClass("d-none");
    } else {
      $reviewStatsTabItem.addClass("d-none");
      $reviewStatsPane.removeClass("show active");
      $reviewStatsTable.empty();
    }
    $('[data-role-header="reviewer"]').toggleClass("d-none", !state.isReviewEnabled);
  }

  /**
   * Renderiza filas.
   */
  function renderUsers() {
    const roles = visibleRoleKeys();
    if (!state.users.length) {
      $tableBody.html(`<tr><td colspan="${rolesColspan()}" class="text-muted">No hay usuarios con permisos en este dataset.</td></tr>`);
      return;
    }

    $tableBody.html(state.users.map(user => `
      <tr data-user-id="${user.userId}">
        <td>
          <div class="permission-user">${escapeHtml(user.email)}</div>
        </td>
        ${roles.map(role => `
          <td class="text-center">
            <input
              class="form-check-input permission-role-check"
              type="checkbox"
              data-role="${role}"
              ${user.permissions[role] ? "checked" : ""}
              aria-label="${role} para ${escapeHtml(user.email)}"
            />
          </td>
        `).join("")}
      </tr>
    `).join(""));
  }

  /**
   * Renderiza tabla de estadisticas.
   * @param {*} $target - Contenedor destino.
   * @param {Array} rows - Filas.
   */
  function renderStatisticsTable($target, rows) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (!safeRows.length) {
      $target.html('<div class="stats-empty">Sin datos todavía.</div>');
      return;
    }

    $target.html(`
      <div class="table-responsive">
        <table class="table table-sm align-middle stats-table mb-0">
          <thead>
            <tr>
              <th>Usuario</th>
              <th class="text-end">Número total</th>
              <th class="text-end">Porcentaje del dataset</th>
              <th class="text-end">Tiempo medio</th>
              <th class="text-end">Precisión</th>
            </tr>
          </thead>
          <tbody>
            ${safeRows.map(row => `
              <tr>
                <td>${escapeHtml(row.email || "")}</td>
                <td class="text-end">${Number(row.totalEntries || 0)}</td>
                <td class="text-end">${escapeHtml(row.datasetPercent || "0.00%")}</td>
                <td class="text-end">${escapeHtml(row.averageTime || "-")}</td>
                <td class="text-end">${escapeHtml(row.precision || "0.00%")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `);
  }

  /**
   * Carga estadisticas del dataset.
   */
  function loadStatistics() {
    const loading = '<div class="stats-empty">Cargando estadísticas...</div>';
    $annotationStatsTable.html(loading);
    if (state.isReviewEnabled)
      $reviewStatsTable.html(loading);

    $.ajax({
      url: statisticsUrl(),
      method: "GET",
      dataType: "json"
    })
      .done(function (payload) {
        renderStatisticsTable($annotationStatsTable, payload && payload.annotation);
        if (state.isReviewEnabled)
          renderStatisticsTable($reviewStatsTable, payload && payload.review);
      })
      .fail(function () {
        const error = '<div class="stats-empty text-danger">No se pudieron cargar las estadísticas.</div>';
        $annotationStatsTable.html(error);
        if (state.isReviewEnabled)
          $reviewStatsTable.html(error);
      });
  }

  /**
   * Carga permisos iniciales.
   */
  function loadPermissions() {
    clearMessage();
    $tableBody.html('<tr><td colspan="4" class="text-muted">Cargando usuarios...</td></tr>');

    $.ajax({
      url: permissionsUrl(),
      method: "GET",
      dataType: "json"
    })
      .done(function (payload) {
        const datasetName = payload && payload.dataset && payload.dataset.name
          ? payload.dataset.name
          : `Dataset ${state.datasetId}`;
        $subtitle.text(datasetName);
        renderOptions(payload?.options);
        state.users = Array.isArray(payload?.users)
          ? payload.users.map(normalisePermissionUser).filter(user => user.userId > 0)
          : [];
        renderUsers();
        loadStatistics();
      })
      .fail(function (xhr) {
        $subtitle.text("No se pudieron cargar los permisos.");
        $tableBody.html('<tr><td colspan="4" class="text-danger">Error al cargar permisos.</td></tr>');
        showMessage(extractErrorMessage(xhr, "No tienes acceso a la administración de este dataset."), "danger");
      });
  }

  /**
   * Anade usuario por email exacto.
   */
  function addUserByEmail() {
    const email = $emailInput.val().trim().toLowerCase();
    if (!email) {
      $emailInput.trigger("focus");
      return;
    }

    $btnAddUser.prop("disabled", true);
    clearMessage();

    $.ajax({
      url: permissionsUrl(),
      method: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({ email })
    })
      .done(function (payload) {
        const user = normalisePermissionUser(payload);
        const existingIndex = state.users.findIndex(item => item.userId === user.userId);
        if (existingIndex >= 0) {
          state.users[existingIndex] = user;
        } else {
          state.users.push(user);
          state.users.sort((a, b) => a.email.localeCompare(b.email));
        }
        $emailInput.val("");
        renderUsers();
        showMessage("Usuario añadido al dataset.", "success");
      })
      .fail(function (xhr) {
        showMessage(extractErrorMessage(xhr, "No existe ningún usuario con ese email."), "danger");
      })
      .always(function () {
        $btnAddUser.prop("disabled", false);
      });
  }

  /**
   * Lee permisos de una fila.
   * @param {*} $row - Fila jQuery.
   * @returns {*} Permisos.
   */
  function readRowPermissions($row) {
    const permissions = {};
    ROLE_KEYS.forEach(function (role) {
      permissions[role] = $row.find(`[data-role="${role}"]`).prop("checked");
    });
    return permissions;
  }

  /**
   * Actualiza usuario local.
   * @param {number} userId - Usuario.
   * @param {*} permissions - Permisos.
   */
  function updateLocalUser(userId, permissions) {
    const hasAny = ROLE_KEYS.some(role => permissions[role]);
    if (!hasAny) {
      state.users = state.users.filter(user => user.userId !== userId);
      return;
    }

    const user = state.users.find(item => item.userId === userId);
    if (user)
      user.permissions = { ...permissions };
  }

  /**
   * Maneja cambio de checkbox.
   * @param {*} checkbox - Checkbox.
   */
  function handlePermissionChange(checkbox) {
    const $row = $(checkbox).closest("tr");
    const userId = Number($row.data("user-id"));
    const permissions = readRowPermissions($row);

    if (!Number.isInteger(userId) || userId <= 0)
      return;

    $row.addClass("permission-row-saving");
    $row.find("input").prop("disabled", true);
    clearMessage();

    $.ajax({
      url: `${permissionsUrl()}/${encodeURIComponent(userId)}`,
      method: "PATCH",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify(buildPermissionsUpdatePayload(permissions))
    })
      .done(function (payload) {
        if (payload && payload.removed) {
          updateLocalUser(userId, { annotator: false, reviewer: false, admin: false });
          renderUsers();
          showMessage("Usuario eliminado de la lista de permisos.", "success");
          return;
        }

        updateLocalUser(userId, permissions);
        showMessage("Permisos actualizados.", "success");
      })
      .fail(function (xhr) {
        showMessage(extractErrorMessage(xhr, "No se pudieron actualizar los permisos."), "danger");
        loadPermissions();
      })
      .always(function () {
        $row.removeClass("permission-row-saving");
        $row.find("input").prop("disabled", false);
      });
  }

  $(document).ready(function () {
    state.datasetId = extractDatasetIdFromPath(window.location.pathname);
    if (!state.datasetId) {
      $subtitle.text("Dataset no válido.");
      showMessage("La ruta no contiene un id de dataset válido.", "danger");
      return;
    }

    $form.on("submit", function (event) {
      event.preventDefault();
      addUserByEmail();
    });

    $tableBody.on("change", ".permission-role-check", function () {
      handlePermissionChange(this);
    });

    loadPermissions();
  });
})();
