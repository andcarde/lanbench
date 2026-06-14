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
  /** Supported provider identifiers accepted by the JSON importer. */
  const JSON_IMPORT_SUPPORTED_PROVIDERS = ["groq", "google-ai-studio", "openai-compatible", "anthropic"];
  /** Free-form JSON labels mapped to canonical provider ids (US-35). */
  const JSON_IMPORT_PROVIDER_ALIASES = {
    "google": "google-ai-studio",
    "google ai studio": "google-ai-studio",
    "ai-studio": "google-ai-studio",
    "gemini": "google-ai-studio"
  };
  /** Providers whose model catalog can be queried live (US-35). */
  const MODEL_CATALOG_PROVIDERS = ["groq", "google-ai-studio"];
  /** Sentinel value of the "write manually" option in the model select. */
  const MANUAL_MODEL_OPTION = "__manual__";
  /** Manual-input placeholder per provider. */
  const MODEL_PLACEHOLDERS = {
    "groq": "llama-3.3-70b-versatile",
    "google-ai-studio": "gemini-2.0-flash",
    "openai-compatible": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest"
  };
  const state = {
    datasetId: null,
    datasetName: "",
    users: [],
    isReviewEnabled: false,
    llmMode: "none",
    credentials: [],
    /** Catalog cache per `provider::keyFingerprint` (page lifetime only). */
    modelCatalogCache: {}
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
      normaliseDatasetName,
      normalisePermissionUser,
      buildPermissionsUpdatePayload,
      maskCredentialKey,
      normaliseCredential,
      shouldShowCredentialsPanel,
      buildCredentialPayload,
      buildCheckResultText,
      computeTabVisibilityState,
      mapJsonProviderToKey,
      parseCredentialsJson,
      providerSupportsModelCatalog,
      normaliseCatalogModels,
      resolveModelFieldValue,
      buildModelsRequestPayload,
      buildModelOptionsHtml,
      catalogCacheKey
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
  const $datasetNameForm = $("#datasetNameForm");
  const $datasetNameInput = $("#datasetNameInput");
  const $btnRenameDataset = $("#btnRenameDataset");
  const $datasetNameMessage = $("#datasetNameMessage");
  const $optLlmMode = $("#optLlmMode");
  const $optReviewEnabled = $("#optReviewEnabled");
  const $optAdditionalReviews = $("#optAdditionalReviews");
  const $annotationStatsTable = $("#annotationStatsTable");
  const $reviewStatsTable = $("#reviewStatsTable");
  const $reviewRoundsBlock = $("#reviewRoundsBlock");
  const $reviewRoundsAverage = $("#reviewRoundsAverage");
  const $reviewRoundsHistogram = $("#reviewRoundsHistogram");
  const $reviewStatsTabItem = $("#reviewStatsTab").closest(".nav-item");
  const $reviewStatsPane = $("#reviewStatsPane");
  const $llmCredentialsPanel = $("#llmCredentialsPanel");
  const $addCredentialForm = $("#addCredentialForm");
  const $credProvider = $("#credProvider");
  const $credModel = $("#credModel");
  const $credModelSelect = $("#credModelSelect");
  const $credModelPickerGroup = $("#credModelPickerGroup");
  const $credModelStatus = $("#credModelStatus");
  const $btnReloadModels = $("#btnReloadModels");
  const $credApiBase = $("#credApiBase");
  const $credApiKey = $("#credApiKey");
  const $btnAddCredential = $("#btnAddCredential");
  const $credentialMessage = $("#credentialMessage");
  const $credentialsTableBody = $("#credentialsTableBody");
  const $btnLoadCredentialsJson = $("#btnLoadCredentialsJson");
  const $credentialsJsonInput = $("#credentialsJsonInput");

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
   * Shows a message banner in the dataset-name panel.
   * @param {string} text - Message text.
   * @param {string} type - Bootstrap contextual type.
   */
  function showDatasetNameMessage(text, type) {
    $datasetNameMessage
      .removeClass("d-none alert-success alert-danger alert-info")
      .addClass(`alert-${type || "info"}`)
      .text(text);
  }

  /**
   * Renames the current dataset (PATCH /api/datasets/:id). Surfaces the reason
   * inline on failure (e.g. a duplicate name owned by the same user).
   */
  function renameDataset() {
    const name = normaliseDatasetName($datasetNameInput.val());

    if (!name) {
      showDatasetNameMessage("Introduce un nombre para el dataset.", "danger");
      $datasetNameInput.trigger("focus");
      return;
    }

    if (name === state.datasetName) {
      showDatasetNameMessage("El nombre no ha cambiado.", "info");
      return;
    }

    $btnRenameDataset.prop("disabled", true);

    $.ajax({
      url: `/api/datasets/${encodeURIComponent(state.datasetId)}`,
      method: "PATCH",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({ name })
    })
      .done(function (payload) {
        const newName = payload && payload.dataset && payload.dataset.name
          ? payload.dataset.name
          : name;
        state.datasetName = newName;
        $datasetNameInput.val(newName);
        $subtitle.text(`Dataset · ${newName}`);
        showDatasetNameMessage("Nombre actualizado.", "success");
      })
      .fail(function (xhr) {
        showDatasetNameMessage(extractErrorMessage(xhr, "No se pudo actualizar el nombre."), "danger");
      })
      .always(function () {
        $btnRenameDataset.prop("disabled", false);
      });
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
   * Normalizes a requested dataset name: trims a string, otherwise returns `""`.
   * Pure (no DOM), so the rule stays unit-testable.
   * @param {*} rawName - Raw name from the input.
   * @returns {string} Trimmed name, or empty string.
   */
  function normaliseDatasetName(rawName) {
    return typeof rawName === "string" ? rawName.trim() : "";
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
   * Builds the masked representation of a key from its last 4 characters.
   * @param {string} last4 - Last 4 characters of the key.
   * @returns {string} Masked key (e.g. "••••ab12").
   */
  function maskCredentialKey(last4) {
    return `••••${String(last4 || "")}`;
  }

  /**
   * Normalizes a credential row received from the backend (already masked).
   * @param {*} raw - Raw credential object.
   * @returns {*} Normalized credential.
   */
  function normaliseCredential(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      provider: String(source.provider || ""),
      apiBase: source.apiBase ? String(source.apiBase) : null,
      model: String(source.model || ""),
      keyLast4: String(source.keyLast4 || ""),
      isActive: Boolean(source.isActive)
    };
  }

  /**
   * Decides whether the AI credentials panel applies for a given llm_mode.
   * Hidden defensively whenever the dataset does not use LLMs.
   * @param {*} llmMode - Dataset llm_mode value.
   * @returns {boolean} True when the panel should be shown.
   */
  function shouldShowCredentialsPanel(llmMode) {
    return Boolean(llmMode) && String(llmMode) !== "none";
  }

  /**
   * Builds the create-credential payload from the form values.
   * @param {*} input - Raw form values.
   * @returns {*} Payload with trimmed provider/model/apiBase/apiKey.
   */
  function buildCredentialPayload(input) {
    const source = input && typeof input === "object" ? input : {};
    const apiBase = String(source.apiBase || "").trim();
    return {
      provider: String(source.provider || "").trim().toLowerCase(),
      model: String(source.model || "").trim(),
      apiBase: apiBase || null,
      apiKey: String(source.apiKey || "").trim()
    };
  }

  /**
   * Maps a free-form provider label (as it appears in the JSON file) to the
   * canonical backend identifier. Case-insensitive; returns `null` when the
   * label does not match any supported provider.
   * @param {*} rawProvider - Raw `proveedor` value from the JSON.
   * @returns {?string} Canonical provider id, or null.
   */
  function mapJsonProviderToKey(rawProvider) {
    if (typeof rawProvider !== "string") return null;
    const normalised = rawProvider.trim().toLowerCase();
    const canonical = JSON_IMPORT_PROVIDER_ALIASES[normalised] || normalised;
    return JSON_IMPORT_SUPPORTED_PROVIDERS.includes(canonical) ? canonical : null;
  }

  /**
   * Decides whether a provider's model catalog can be queried live (US-35).
   * @param {*} provider - Canonical provider id.
   * @returns {boolean} True when the model picker applies.
   */
  function providerSupportsModelCatalog(provider) {
    return MODEL_CATALOG_PROVIDERS.includes(String(provider || "").trim().toLowerCase());
  }

  /**
   * Normalizes the models array of a catalog response. Pure (no DOM); invalid
   * entries are dropped so the dropdown never renders empty values.
   * @param {*} payload - Backend `{ ok, models }` payload.
   * @returns {Array<{id:string, label:string}>} Normalized models.
   */
  function normaliseCatalogModels(payload) {
    const models = payload && Array.isArray(payload.models) ? payload.models : [];
    return models
      .filter(model => model && typeof model.id === "string" && model.id.trim())
      .map(model => ({
        id: model.id.trim(),
        label: typeof model.label === "string" && model.label.trim() ? model.label.trim() : model.id.trim()
      }));
  }

  /**
   * Resolves the effective model value of the form: the manual input when the
   * provider has no catalog or the manual option is selected, the dropdown
   * value otherwise. Pure (no DOM), so the precedence is unit-testable.
   * @param {{catalogSupported:boolean, selectValue:*, manualValue:*}} input
   * @returns {string} Trimmed model id (possibly empty).
   */
  function resolveModelFieldValue(input) {
    const source = input && typeof input === "object" ? input : {};
    const selectValue = String(source.selectValue || "").trim();
    const manualValue = String(source.manualValue || "").trim();

    if (!source.catalogSupported || !selectValue || selectValue === MANUAL_MODEL_OPTION)
      return manualValue;
    return selectValue;
  }

  /**
   * Builds the body for `POST /llm-credentials/models`, omitting empty fields
   * so the backend can fall back to the stored credential key. Pure (no DOM).
   * @param {{provider:*, apiKey:*, apiBase:*}} input - Raw form values.
   * @returns {{provider:string, apiKey?:string, apiBase?:string}} Payload.
   */
  function buildModelsRequestPayload(input) {
    const source = input && typeof input === "object" ? input : {};
    const payload = { provider: String(source.provider || "").trim().toLowerCase() };
    const apiKey = String(source.apiKey || "").trim();
    const apiBase = String(source.apiBase || "").trim();
    if (apiKey) payload.apiKey = apiKey;
    if (apiBase) payload.apiBase = apiBase;
    return payload;
  }

  /**
   * Builds the `<option>` markup for the model dropdown: the catalog entries
   * plus the always-present manual-entry escape hatch. Pure string building,
   * so the option set is unit-testable.
   * @param {Array<{id:string, label:string}>} models - Normalized models.
   * @param {string} [selectedId] - Model id to preselect when present.
   * @returns {string} HTML options markup.
   */
  function buildModelOptionsHtml(models, selectedId) {
    const safeModels = Array.isArray(models) ? models : [];
    const options = safeModels.map(model => {
      const selected = model.id === selectedId ? " selected" : "";
      return `<option value="${escapeHtml(model.id)}"${selected}>${escapeHtml(model.label)}</option>`;
    });
    options.push(`<option value="${MANUAL_MODEL_OPTION}">Otro (escribir manualmente)</option>`);
    return options.join("");
  }

  /**
   * Cache key of a catalog response: provider plus a fingerprint of the typed
   * key (length + last 4), so the clear key itself is never used as an object
   * key. An empty fingerprint means "stored credential key". Pure (no DOM).
   * @param {*} provider - Canonical provider id.
   * @param {*} apiKey - Typed API key (possibly empty).
   * @returns {string} Cache key.
   */
  function catalogCacheKey(provider, apiKey) {
    const key = String(apiKey || "");
    const fingerprint = key ? `${key.length}:${key.slice(-4)}` : "stored";
    return `${String(provider || "").trim().toLowerCase()}::${fingerprint}`;
  }

  /**
   * Parses and validates the JSON payload produced by `api-keys.json`. Pure (no
   * DOM, no I/O), so the format rules are unit-testable. Returns the list of
   * valid entries plus a list of human-readable error messages for invalid
   * items; the caller decides what to do with each (the current UI aborts the
   * whole import when there is any error).
   * @param {string} rawText - Raw text content of the uploaded file.
   * @returns {{ entries: Array<{provider:string, model:string, apiBase:?string, apiKey:string}>, errors: string[] }}
   */
  function parseCredentialsJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(String(rawText));
    } catch (_error) {
      return { entries: [], errors: ["El archivo no contiene JSON válido."] };
    }

    if (!Array.isArray(parsed))
      return { entries: [], errors: ["El JSON debe ser un array de credenciales."] };

    const entries = [];
    const errors = [];

    parsed.forEach(function (item, index) {
      const position = index + 1;
      const source = item && typeof item === "object" ? item : {};
      const provider = mapJsonProviderToKey(source.proveedor);
      const model = typeof source.modelo === "string" ? source.modelo.trim() : "";
      const apiBase = typeof source.url_base === "string" ? source.url_base.trim() : "";
      const apiKey = typeof source.api_key === "string" ? source.api_key.trim() : "";

      if (!provider) {
        const shown = typeof source.proveedor === "string" && source.proveedor.trim()
          ? `"${source.proveedor.trim()}"`
          : "(vacío)";
        errors.push(`Elemento ${position}: proveedor inválido ${shown}.`);
        return;
      }
      if (!model) {
        errors.push(`Elemento ${position}: el campo "modelo" es obligatorio.`);
        return;
      }
      if (!apiKey) {
        errors.push(`Elemento ${position}: el campo "api_key" es obligatorio.`);
        return;
      }

      entries.push({ provider, model, apiBase: apiBase || null, apiKey });
    });

    return { entries, errors };
  }

  /**
   * Base permissions URL for the current dataset.
   * @returns {string} URL.
   */
  function permissionsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/permissions`;
  }

  /**
   * Base AI-credentials URL for the current dataset.
   * @returns {string} URL.
   */
  function credentialsUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/llm-credentials`;
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
    state.llmMode = source.llmMode || "none";
    $optLlmMode.val(state.llmMode);
    $optReviewEnabled.val(String(Boolean(source.isReviewEnabled)));
    $optAdditionalReviews.val(String(Boolean(source.hasAdditionalReviews)));
    applyReviewTabVisibility(Boolean(source.isReviewEnabled));
    applyCredentialsPanelVisibility(state.llmMode);
  }

  /**
   * Shows or hides the AI credentials panel based on llm_mode and loads the
   * credentials when the panel applies.
   * @param {*} llmMode - Dataset llm_mode value.
   */
  function applyCredentialsPanelVisibility(llmMode) {
    const visible = shouldShowCredentialsPanel(llmMode);
    $llmCredentialsPanel.toggleClass("d-none", !visible);
    if (visible) {
      loadCredentials();
    } else {
      state.credentials = [];
      $credentialsTableBody.empty();
    }
  }

  /**
   * Shows a message banner in the credentials panel.
   * @param {string} text - Message text.
   * @param {string} type - Bootstrap contextual type.
   */
  function showCredentialMessage(text, type) {
    $credentialMessage
      .removeClass("d-none alert-success alert-danger alert-info")
      .addClass(`alert-${type || "info"}`)
      .text(text);
  }

  /**
   * Renders the list of masked credentials.
   */
  function renderCredentials() {
    if (!state.credentials.length) {
      $credentialsTableBody.html('<tr><td colspan="5" class="text-muted">No hay credenciales registradas.</td></tr>');
      return;
    }

    $credentialsTableBody.html(state.credentials.map(credential => `
      <tr data-provider="${escapeHtml(credential.provider)}">
        <td>${escapeHtml(credential.provider)}</td>
        <td>${escapeHtml(credential.model)}</td>
        <td><code>${escapeHtml(maskCredentialKey(credential.keyLast4))}</code></td>
        <td class="text-center">${credential.isActive ? "✓" : ""}</td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-outline-secondary cred-check" data-provider="${escapeHtml(credential.provider)}">Comprobar</button>
          <button type="button" class="btn btn-sm btn-outline-primary cred-activate" data-provider="${escapeHtml(credential.provider)}" ${credential.isActive ? "disabled" : ""}>Activar</button>
          <button type="button" class="btn btn-sm btn-outline-danger cred-delete" data-provider="${escapeHtml(credential.provider)}">Eliminar</button>
        </td>
      </tr>
    `).join(""));
  }

  /**
   * Loads the dataset's masked credentials.
   */
  function loadCredentials() {
    $credentialsTableBody.html('<tr><td colspan="5" class="text-muted">Cargando credenciales...</td></tr>');

    $.ajax({
      url: credentialsUrl(),
      method: "GET",
      dataType: "json"
    })
      .done(function (payload) {
        state.credentials = Array.isArray(payload)
          ? payload.map(normaliseCredential)
          : [];
        renderCredentials();
        applyModelFieldMode();
      })
      .fail(function () {
        $credentialsTableBody.html('<tr><td colspan="5" class="text-danger">No se pudieron cargar las credenciales.</td></tr>');
      });
  }

  /**
   * Canonical provider currently selected in the credentials form.
   * @returns {string} Provider id.
   */
  function selectedProvider() {
    return String($credProvider.val() || "").trim().toLowerCase();
  }

  /**
   * Indicates whether a credential is already stored for a provider, in which
   * case the backend can resolve its key for the catalog without a typed key.
   * @param {string} provider - Canonical provider id.
   * @returns {boolean}
   */
  function hasStoredCredential(provider) {
    return state.credentials.some(credential => credential.provider === provider);
  }

  /**
   * Shows (or clears, with empty text) the status line under the model picker.
   * @param {string} text - Status text.
   * @param {string} [kind] - "danger" for errors, muted otherwise.
   */
  function setModelStatus(text, kind) {
    if (!text) {
      $credModelStatus.addClass("d-none").removeClass("text-danger").text("");
      return;
    }
    $credModelStatus
      .removeClass("d-none")
      .toggleClass("text-danger", kind === "danger")
      .text(text);
  }

  /**
   * Reveals or hides the manual model input under the picker.
   * @param {boolean} visible - True to show the text input.
   */
  function setManualModelVisible(visible) {
    $credModel.toggleClass("d-none", !visible);
  }

  /**
   * Renders the model dropdown with the given catalog (the manual-entry option
   * is always appended). Preselects the stored credential's model when it is
   * in the list; with an empty catalog the manual input is revealed so saving
   * is never blocked (US-35).
   * @param {Array<{id:string, label:string}>} models - Normalized models.
   */
  function renderModelSelect(models) {
    const list = Array.isArray(models) ? models : [];
    const stored = state.credentials.find(credential => credential.provider === selectedProvider());
    const preferred = stored && list.some(model => model.id === stored.model)
      ? stored.model
      : (list[0] ? list[0].id : MANUAL_MODEL_OPTION);

    $credModelSelect.html(buildModelOptionsHtml(list, preferred));
    $credModelSelect.val(preferred);
    setManualModelVisible(preferred === MANUAL_MODEL_OPTION);
  }

  /**
   * Applies the model-field mode for the selected provider: dropdown + reload
   * button for catalog providers (Groq, Google AI Studio), plain text input
   * for the rest. Triggers the catalog load when the picker applies.
   */
  function applyModelFieldMode() {
    const provider = selectedProvider();
    const supported = providerSupportsModelCatalog(provider);

    $credModel.attr("placeholder", MODEL_PLACEHOLDERS[provider] || "");
    $credModelPickerGroup.toggleClass("d-none", !supported);

    if (!supported) {
      setManualModelVisible(true);
      setModelStatus("");
      return;
    }
    loadModelCatalog({});
  }

  /**
   * Loads the provider's model catalog through the backend proxy
   * (`POST /llm-credentials/models`). Serves the page cache unless `force`;
   * when no key is available yet (neither typed nor stored) it only shows a
   * hint. Catalog failures (invalid key, rate limit, provider down) surface
   * inline and fall back to manual entry.
   * @param {{force?:boolean}} options
   */
  function loadModelCatalog(options) {
    const force = Boolean(options && options.force);
    const provider = selectedProvider();
    if (!providerSupportsModelCatalog(provider))
      return;

    const typedKey = String($credApiKey.val() || "").trim();
    if (!typedKey && !hasStoredCredential(provider)) {
      renderModelSelect([]);
      setModelStatus("Introduce la API key del proveedor para cargar sus modelos.", "muted");
      return;
    }

    const cacheKey = catalogCacheKey(provider, typedKey);
    if (!force && state.modelCatalogCache[cacheKey]) {
      renderModelSelect(state.modelCatalogCache[cacheKey]);
      setModelStatus("");
      return;
    }

    $credModelSelect.prop("disabled", true).html('<option value="">Cargando modelos...</option>');
    $btnReloadModels.prop("disabled", true);
    setModelStatus("Consultando los modelos disponibles del proveedor...", "muted");

    $.ajax({
      url: `${credentialsUrl()}/models`,
      method: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify(buildModelsRequestPayload({
        provider,
        apiKey: typedKey,
        apiBase: $credApiBase.val()
      }))
    })
      .done(function (payload) {
        if (selectedProvider() !== provider)
          return; // Stale response: the user already switched provider.
        if (payload && payload.ok) {
          const models = normaliseCatalogModels(payload);
          state.modelCatalogCache[cacheKey] = models;
          renderModelSelect(models);
          setModelStatus(models.length ? "" : "El proveedor no devolvió modelos compatibles; escribe el modelo manualmente.", "muted");
          return;
        }
        renderModelSelect([]);
        setModelStatus((payload && payload.error) || "No se pudieron cargar los modelos del proveedor.", "danger");
      })
      .fail(function (xhr) {
        if (selectedProvider() !== provider)
          return;
        renderModelSelect([]);
        setModelStatus(extractErrorMessage(xhr, "No se pudieron cargar los modelos del proveedor."), "danger");
      })
      .always(function () {
        $credModelSelect.prop("disabled", false);
        $btnReloadModels.prop("disabled", false);
      });
  }

  /** Debounce timer for catalog reloads while the user types the key. */
  let modelCatalogKeyTimer = null;

  /**
   * Schedules a catalog reload shortly after the user stops typing the key.
   */
  function scheduleModelCatalogReload() {
    if (!providerSupportsModelCatalog(selectedProvider()))
      return;
    if (modelCatalogKeyTimer)
      clearTimeout(modelCatalogKeyTimer);
    modelCatalogKeyTimer = setTimeout(function () { loadModelCatalog({}); }, 700);
  }

  /**
   * Creates or updates a credential from the form.
   */
  function addCredential() {
    const payload = buildCredentialPayload({
      provider: $credProvider.val(),
      model: resolveModelFieldValue({
        catalogSupported: providerSupportsModelCatalog(selectedProvider()),
        selectValue: $credModelSelect.val(),
        manualValue: $credModel.val()
      }),
      apiBase: $credApiBase.val(),
      apiKey: $credApiKey.val()
    });

    if (!payload.provider || !payload.model || !payload.apiKey) {
      showCredentialMessage("Proveedor, modelo y API key son obligatorios.", "danger");
      return;
    }

    $btnAddCredential.prop("disabled", true);

    $.ajax({
      url: credentialsUrl(),
      method: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify(payload)
    })
      .done(function () {
        $credApiKey.val("");
        showCredentialMessage("Credencial guardada.", "success");
        loadCredentials();
      })
      .fail(function (xhr) {
        showCredentialMessage(extractErrorMessage(xhr, "No se pudo guardar la credencial."), "danger");
      })
      .always(function () {
        $btnAddCredential.prop("disabled", false);
      });
  }

  /**
   * Activates a credential by provider.
   * @param {string} provider - Provider identifier.
   */
  function activateCredential(provider) {
    $.ajax({
      url: `${credentialsUrl()}/${encodeURIComponent(provider)}/activate`,
      method: "PATCH",
      dataType: "json"
    })
      .done(function () {
        showCredentialMessage("Credencial activada.", "success");
        loadCredentials();
      })
      .fail(function (xhr) {
        showCredentialMessage(extractErrorMessage(xhr, "No se pudo activar la credencial."), "danger");
      });
  }

  /**
   * Deletes a credential by provider.
   * @param {string} provider - Provider identifier.
   */
  function deleteCredential(provider) {
    $.ajax({
      url: `${credentialsUrl()}/${encodeURIComponent(provider)}`,
      method: "DELETE",
      dataType: "json"
    })
      .done(function () {
        showCredentialMessage("Credencial eliminada.", "success");
        loadCredentials();
      })
      .fail(function (xhr) {
        showCredentialMessage(extractErrorMessage(xhr, "No se pudo eliminar la credencial."), "danger");
      });
  }

  /**
   * Runs the "check" action for a credential and shows the model reply in a modal.
   * @param {string} provider - Provider identifier.
   */
  function checkCredential(provider) {
    showCheckModal("Comprobando...");

    $.ajax({
      url: `${credentialsUrl()}/${encodeURIComponent(provider)}/check`,
      method: "POST",
      dataType: "json"
    })
      .done(function (payload) {
        showCheckModal(buildCheckResultText(payload));
      })
      .fail(function (xhr) {
        showCheckModal(`Error: ${extractErrorMessage(xhr, "no se pudo comprobar la credencial.")}`);
      });
  }

  /**
   * Builds the text shown in the check modal from the server payload. Pure (no
   * DOM), so the OK/error wording is unit-testable without a browser.
   * @param {{ ok?:boolean, message?:string, error?:string }|null|undefined} payload
   * @returns {string} Human-readable result text.
   */
  function buildCheckResultText(payload) {
    if (payload && payload.ok)
      return payload.message || "El modelo respondió correctamente.";
    return `Error: ${(payload && payload.error) || "el modelo no respondió."}`;
  }

  /**
   * Shows the credential-check modal with the given text. Defensive: it must
   * never throw and must always surface *something* — if Bootstrap or the modal
   * element is missing (the observed "no modal" symptom), it falls back to a
   * native alert so the user is never left without feedback.
   * @param {string} text - Text to display.
   */
  function showCheckModal(text) {
    const body = document.getElementById("modalCredentialCheckBody");
    if (body)
      body.textContent = String(text);

    const modalElement = document.getElementById("modalCredentialCheck");
    try {
      if (modalElement && typeof bootstrap !== "undefined" && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
        return;
      }
    } catch (_error) {
      // Fall through to the alert fallback below.
    }

    if (typeof window !== "undefined" && typeof window.alert === "function")
      window.alert(String(text));
  }

  /**
   * Shows the credentials-import modal with the given HTML body. Falls back to
   * a native alert when Bootstrap is unavailable, mirroring `showCheckModal`.
   * @param {string} bodyHtml - HTML to render inside the modal body.
   */
  function showImportModal(bodyHtml) {
    const body = document.getElementById("modalCredentialsImportBody");
    if (body)
      body.innerHTML = String(bodyHtml);

    const modalElement = document.getElementById("modalCredentialsImport");
    try {
      if (modalElement && typeof bootstrap !== "undefined" && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
        return;
      }
    } catch (_error) {
      // Fall through to the alert fallback below.
    }

    if (typeof window !== "undefined" && typeof window.alert === "function") {
      const fallback = String(bodyHtml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      window.alert(fallback);
    }
  }

  /**
   * Renders the import-error modal listing every invalid item found in the file.
   * @param {string[]} errors - Error messages.
   */
  function showImportErrorsModal(errors) {
    const items = errors.map(message => `<li>${escapeHtml(message)}</li>`).join("");
    showImportModal(
      `<p class="mb-2">No se ha cargado ninguna credencial porque el archivo contiene errores:</p>
       <ul class="mb-0">${items}</ul>`
    );
  }

  /**
   * Persists one credential via POST. Returns a jQuery promise that always
   * resolves with `{ ok, provider, message? }` so the caller can aggregate.
   * @param {{provider:string, model:string, apiBase:?string, apiKey:string}} entry
   * @returns {Promise<{ok:boolean, provider:string, message?:string}>}
   */
  function postImportedCredential(entry) {
    return new Promise(function (resolve) {
      $.ajax({
        url: credentialsUrl(),
        method: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify({
          provider: entry.provider,
          model: entry.model,
          apiBase: entry.apiBase,
          apiKey: entry.apiKey
        })
      })
        .done(function () { resolve({ ok: true, provider: entry.provider }); })
        .fail(function (xhr) {
          resolve({
            ok: false,
            provider: entry.provider,
            message: extractErrorMessage(xhr, "no se pudo guardar la credencial.")
          });
        });
    });
  }

  /**
   * Sequentially uploads the parsed entries. Sequential to avoid race
   * conditions on the upsert-by-provider key when the file repeats a provider,
   * and to keep the modal summary deterministic.
   * @param {Array} entries - Validated entries from `parseCredentialsJson`.
   */
  async function importCredentialEntries(entries) {
    $btnLoadCredentialsJson.prop("disabled", true);
    const successes = [];
    const failures = [];

    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const result = await postImportedCredential(entry);
      if (result.ok) successes.push(result.provider);
      else failures.push(result);
    }

    $btnLoadCredentialsJson.prop("disabled", false);
    loadCredentials();

    if (!failures.length) {
      showCredentialMessage(`Se cargaron ${successes.length} credencial(es) desde el JSON.`, "success");
      return;
    }

    const failureItems = failures
      .map(item => `<li>${escapeHtml(item.provider)}: ${escapeHtml(item.message || "error desconocido")}</li>`)
      .join("");
    showImportModal(
      `<p class="mb-2">Se cargaron ${successes.length} credencial(es). Fallaron ${failures.length}:</p>
       <ul class="mb-0">${failureItems}</ul>`
    );
  }

  /**
   * Handles the file picked by the user: reads it, validates it and either
   * shows the error modal or starts the sequential upload.
   * @param {File} file - File chosen via the hidden input.
   */
  function handleCredentialsJsonFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      const text = typeof reader.result === "string" ? reader.result : "";
      const { entries, errors } = parseCredentialsJson(text);

      if (errors.length) {
        showImportErrorsModal(errors);
        return;
      }
      if (!entries.length) {
        showImportModal("<p class=\"mb-0\">El archivo no contiene credenciales.</p>");
        return;
      }
      importCredentialEntries(entries);
    };
    reader.onerror = function () {
      showImportModal("<p class=\"mb-0\">No se pudo leer el archivo.</p>");
    };
    reader.readAsText(file);
  }

  /** Maps each statistics tab button id to the pane it controls. */
  const STATS_TAB_PANES = {
    annotationStatsTab: "annotationStatsPane",
    reviewStatsTab: "reviewStatsPane"
  };

  /**
   * Computes the desired tab state for the statistics section. Pure (no DOM),
   * so the visibility rules are unit-testable without a browser.
   *
   * The Revisión tab is only offered when the dataset has review enabled. On
   * (re)configuration we always reset to the Anotación tab so the content area
   * is never blank and Bootstrap never sees zero active panes — the condition
   * that left the Revisión tab inert in the reported defect.
   *
   * @param {boolean} isReviewEnabled
   * @returns {{ reviewTabHidden:boolean, activeTab:string }}
   */
  function computeTabVisibilityState(isReviewEnabled) {
    return {
      reviewTabHidden: !isReviewEnabled,
      activeTab: "annotationStatsTab"
    };
  }

  /**
   * Activates one statistics tab/pane pair and deactivates the rest. Used both
   * for the initial reset and as a manual fallback when Bootstrap's tab JS is
   * unavailable (e.g. the CDN bundle failed to load), so clicking always works.
   * @param {string} tabId - Id of the nav-link button to activate.
   */
  function setActiveStatisticsTab(tabId) {
    Object.keys(STATS_TAB_PANES).forEach(function (tab) {
      const isActive = tab === tabId;
      $("#" + tab).toggleClass("active", isActive).attr("aria-selected", String(isActive));
      $("#" + STATS_TAB_PANES[tab]).toggleClass("show active", isActive);
    });
  }

  /**
   * Shows or hides the Review tab according to the isReviewEnabled option and
   * keeps exactly one pane active.
   * @param {boolean} isReviewEnabled - True if the dataset has review enabled.
   */
  function applyReviewTabVisibility(isReviewEnabled) {
    state.isReviewEnabled = Boolean(isReviewEnabled);
    const tabState = computeTabVisibilityState(state.isReviewEnabled);

    $reviewStatsTabItem.toggleClass("d-none", tabState.reviewTabHidden);
    setActiveStatisticsTab(tabState.activeTab);
    if (tabState.reviewTabHidden) {
      $reviewStatsTable.empty();
      $reviewRoundsBlock.addClass("d-none");
      $reviewRoundsHistogram.empty();
      $reviewRoundsAverage.text("");
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
   * @param {string} [generalAverage] - Dataset-wide weighted average time.
   */
  function renderStatisticsTable($target, rows, generalAverage) {
    const safeRows = Array.isArray(rows) ? rows : [];

    if (!safeRows.length) {
      $target.html('<div class="stats-empty">Sin datos todavía.</div>');
      return;
    }

    const footer = generalAverage
      ? `<tfoot>
            <tr class="stats-general-row">
              <td>Media general (ponderada)</td>
              <td class="text-end">—</td>
              <td class="text-end">—</td>
              <td class="text-end">${escapeHtml(generalAverage)}</td>
              <td class="text-end">—</td>
            </tr>
          </tfoot>`
      : "";

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
          ${footer}
        </table>
      </div>
    `);
  }

  /**
   * Renders the multi-round review distribution: histogram and average
   * rounds per entry. Hides the block when the dataset is single-round or
   * has no terminal reviews yet (the server returns `reviewRounds: null`).
   * @param {*} reviewRounds - Server-provided summary or null.
   */
  function renderReviewRoundsDistribution(reviewRounds) {
    if (!reviewRounds || !Array.isArray(reviewRounds.histogram) || reviewRounds.histogram.length === 0) {
      $reviewRoundsBlock.addClass("d-none");
      $reviewRoundsHistogram.empty();
      $reviewRoundsAverage.text("");
      return;
    }

    $reviewRoundsAverage.text(`Media de rondas por entrada: ${reviewRounds.averageRoundsPerEntry}`);
    $reviewRoundsHistogram.html(buildHistogramSvg(reviewRounds.histogram));
    $reviewRoundsBlock.removeClass("d-none");
  }

  /**
   * Builds an inline SVG bar chart for the rounds histogram. Linear scaling;
   * empty bins render as a thin baseline so the distribution shape stays
   * readable.
   * @param {Array<{rounds:number, entryCount:number}>} histogram - Bins.
   * @returns {string} SVG markup.
   */
  function buildHistogramSvg(histogram) {
    const padding = { top: 18, right: 16, bottom: 32, left: 32 };
    const barGap = 6;
    const barWidth = 42;
    const chartHeight = 160;
    const width = padding.left + padding.right + histogram.length * barWidth + (histogram.length - 1) * barGap;
    const maxCount = Math.max(1, ...histogram.map(bin => Number(bin.entryCount) || 0));

    const bars = histogram.map((bin, index) => {
      const count = Number(bin.entryCount) || 0;
      const x = padding.left + index * (barWidth + barGap);
      const height = count > 0 ? Math.max(1, Math.round((count / maxCount) * chartHeight)) : 1;
      const y = padding.top + chartHeight - height;
      const cssClass = count > 0 ? "bar" : "bar bar-empty";
      const labelY = y - 4;
      const axisY = padding.top + chartHeight + 14;
      return `
        <rect class="${cssClass}" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="2"></rect>
        <text class="bar-label" x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle">${count}</text>
        <text class="axis-label" x="${x + barWidth / 2}" y="${axisY}" text-anchor="middle">${bin.rounds}</text>
      `;
    }).join("");

    const totalHeight = padding.top + chartHeight + padding.bottom;
    const axisLabel = `<text class="axis-label" x="${width / 2}" y="${totalHeight - 4}" text-anchor="middle">Rondas hasta el cierre</text>`;

    return `
      <svg viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="Distribución del número de rondas de revisión por entrada">
        ${bars}
        ${axisLabel}
      </svg>
    `;
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
        renderStatisticsTable($annotationStatsTable, payload && payload.annotation, payload && payload.annotationAverage);
        if (state.isReviewEnabled) {
          renderStatisticsTable($reviewStatsTable, payload && payload.review, payload && payload.reviewAverage);
          renderReviewRoundsDistribution(payload && payload.reviewRounds);
        } else {
          renderReviewRoundsDistribution(null);
        }
      })
      .fail(function () {
        const error = '<div class="stats-empty text-danger">No se pudieron cargar las estadísticas.</div>';
        $annotationStatsTable.html(error);
        if (state.isReviewEnabled)
          $reviewStatsTable.html(error);
        renderReviewRoundsDistribution(null);
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
        state.datasetName = datasetName;
        $subtitle.text(`Dataset · ${datasetName}`);
        $datasetNameInput.val(datasetName);
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

    $datasetNameForm.on("submit", function (event) {
      event.preventDefault();
      renameDataset();
    });

    $tableBody.on("change", ".permission-role-check", function () {
      handlePermissionChange(this);
    });

    $addCredentialForm.on("submit", function (event) {
      event.preventDefault();
      addCredential();
    });

    $credProvider.on("change", function () {
      applyModelFieldMode();
    });

    $credApiKey.on("input", scheduleModelCatalogReload);

    $btnReloadModels.on("click", function () {
      loadModelCatalog({ force: true });
    });

    $credModelSelect.on("change", function () {
      const manual = $credModelSelect.val() === MANUAL_MODEL_OPTION;
      setManualModelVisible(manual);
      if (manual)
        $credModel.trigger("focus");
    });

    $credentialsTableBody.on("click", ".cred-activate", function () {
      activateCredential($(this).data("provider"));
    });

    $credentialsTableBody.on("click", ".cred-delete", function () {
      deleteCredential($(this).data("provider"));
    });

    $credentialsTableBody.on("click", ".cred-check", function () {
      checkCredential($(this).data("provider"));
    });

    $btnLoadCredentialsJson.on("click", function () {
      $credentialsJsonInput.val("").trigger("click");
    });

    $credentialsJsonInput.on("change", function (event) {
      const file = event.target && event.target.files ? event.target.files[0] : null;
      handleCredentialsJsonFile(file);
    });

    // Defensive tab switching: if the Bootstrap bundle failed to load (CDN or
    // offline), the `data-bs-toggle="tab"` delegation is absent and clicking a
    // tab does nothing — the observed "Revisión never activates" symptom. Bind a
    // manual fallback only in that case, so we never double-toggle when
    // Bootstrap is present and handling the switch itself.
    if (typeof bootstrap === "undefined" || !bootstrap.Tab) {
      $("#statisticsTabs").on("click", '[data-bs-toggle="tab"]', function (event) {
        event.preventDefault();
        setActiveStatisticsTab(this.id);
      });
    }

    loadPermissions();
  });
})();
