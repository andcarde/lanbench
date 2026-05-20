// @ts-nocheck
/**
 * @file Frontend for `public/dataset-admin.html`.
 *
 * Queries the per-dataset permissions (`GET /api/datasets/:id/permissions`)
 * and lets the owner/admin modify them with `POST`/`PATCH` on the same
 * collection. It works with three per-dataset roles:
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
   * Returns the visible roles according to the dataset configuration.
   * @returns {string[]} Visible roles.
   */
  function visibleRoleKeys() {
    return ROLE_KEYS.filter(role => role !== "reviewer" || state.isReviewEnabled);
  }

  /**
   * Computes the colspan for table messages (1 user column + visible roles).
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
   * Escapes a value for safe insertion as HTML text.
   * @param {*} value - Text to escape.
   * @returns {string} HTML-escaped string.
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
   * Shows a message banner.
   * @param {string} text - Message text.
   * @param {string} type - Bootstrap contextual type.
   */
  function showMessage(text, type) {
    $message
      .removeClass("d-none alert-success alert-danger alert-info")
      .addClass(`alert-${type || "info"}`)
      .text(text);
  }

  /**
   * Clears the message banner.
   */
  function clearMessage() {
    $message.addClass("d-none").text("");
  }

  /**
   * Extracts the dataset id from the path.
   * @param {string} pathName - Path.
   * @returns {?number} Dataset id, or null.
   */
  function extractDatasetIdFromPath(pathName) {
    const match = String(pathName || "").match(/\/datasets\/(\d+)\/admin(?:\/)?$/);
    const parsed = match ? Number(match[1]) : null;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Normalizes a permission user row.
   * @param {*} rawUser - Raw user object.
   * @returns {*} Normalized user.
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
   * Builds the permissions payload to send to the backend.
   * @param {*} permissions - Permissions.
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
   * Base permissions URL for the current dataset.
   * @returns {string} URL.
   */
  function permissionsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/permissions`;
  }

  /**
   * Statistics URL for the current dataset.
   * @returns {string} URL.
   */
  function statisticsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/statistics`;
  }

  /**
   * Extracts an error message from an AJAX error.
   * @param {*} xhr - AJAX error.
   * @param {string} fallback - Fallback message.
   * @returns {string} Message.
   */
  function extractErrorMessage(xhr, fallback) {
    if (xhr && xhr.responseJSON && typeof xhr.responseJSON.message === "string")
      return xhr.responseJSON.message;
    if (xhr && typeof xhr.responseText === "string" && xhr.responseText.trim())
      return xhr.responseText;
    return fallback;
  }

  /**
   * Applies the dataset options to the controls in the Options section.
   * @param {*} options - Dataset options.
   */
  function renderOptions(options) {
    const source = options && typeof options === "object" ? options : {};
    $optLlmMode.val(source.llmMode || "none");
    $optReviewEnabled.val(String(Boolean(source.isReviewEnabled)));
    $optAdditionalReviews.val(String(Boolean(source.hasAdditionalReviews)));
    applyReviewTabVisibility(Boolean(source.isReviewEnabled));
  }

  /**
   * Shows or hides the Review tab according to the isReviewEnabled option.
   * @param {boolean} isReviewEnabled - True if the dataset has review enabled.
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
   * Renders the permission rows.
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
   * Renders a statistics table.
   * @param {*} $target - Destination container.
   * @param {Array} rows - Rows.
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
   * Loads the dataset statistics.
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
   * Loads the initial permissions.
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
        $subtitle.text(`Dataset · ${datasetName}`);
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
   * Adds a user by exact email.
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
   * Reads the permissions from a table row.
   * @param {*} $row - jQuery row.
   * @returns {*} Permissions.
   */
  function readRowPermissions($row) {
    const permissions = {};
    ROLE_KEYS.forEach(function (role) {
      permissions[role] = $row.find(`[data-role="${role}"]`).prop("checked");
    });
    return permissions;
  }

  /**
   * Updates the local user state (or removes it if no roles remain).
   * @param {number} userId - User id.
   * @param {*} permissions - Permissions.
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
   * Handles a permission checkbox change (persists it via PATCH).
   * @param {*} checkbox - The changed checkbox element.
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
