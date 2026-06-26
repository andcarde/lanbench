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
  /**
   * Built-in providers, mirror of `constants/llm-providers.js`. Kept in sync
   * manually because the frontend has no module bundler.
   */
  const BUILTIN_PROVIDERS = [
    { name: "groq", label: "Groq" },
    { name: "google-ai-studio", label: "Google AI Studio" },
    { name: "openai-compatible", label: "OpenAI-compatible" },
    { name: "anthropic", label: "Anthropic" }
  ];
  const BUILTIN_PROVIDER_NAMES = BUILTIN_PROVIDERS.map(provider => provider.name);
  /** Supported provider identifiers accepted by the JSON importer. */
  const JSON_IMPORT_SUPPORTED_PROVIDERS = BUILTIN_PROVIDER_NAMES.slice();
  /** Free-form JSON labels mapped to canonical provider ids (US-35). */
  const JSON_IMPORT_PROVIDER_ALIASES = {
    "google": "google-ai-studio",
    "google ai studio": "google-ai-studio",
    "ai-studio": "google-ai-studio",
    "gemini": "google-ai-studio",
    "openai": "openai-compatible",
    "openia": "openai-compatible"
  };
  /** Provider-name pattern accepted by the backend (mirror of `PROVIDER_NAME_PATTERN`). */
  const PROVIDER_NAME_PATTERN = /^[a-z0-9._-]{1,40}$/;
  /** Maximum wait for credential checks before surfacing a timeout modal. */
  const CREDENTIAL_CHECK_TIMEOUT_MS = 5000;
  const state = {
    datasetId: null,
    datasetName: "",
    users: [],
    isReviewEnabled: false,
    llmMode: "none",
    credentials: [],
    customProviders: [],
    /** Name of the provider pending deletion confirmation. */
    pendingDeleteCustomProvider: null,
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
      catalogCacheKey,
      normaliseCustomProvider,
      validateCustomProviderInput,
      buildCheckFailureText,
      buildProviderMenuHtml,
      composeProviderList
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
  const $credProviderToggle = $("#credProviderToggle");
  const $credProviderMenu = $("#credProviderMenu");
  const $credModelSelect = $("#credModelSelect");
  const $credModelPickerGroup = $("#credModelPickerGroup");
  const $credModelStatus = $("#credModelStatus");
  const $btnReloadModels = $("#btnReloadModels");
  const $credApiKey = $("#credApiKey");
  const $btnAddCredential = $("#btnAddCredential");
  const $credentialMessage = $("#credentialMessage");
  const $credentialsTableBody = $("#credentialsTableBody");
  const $btnLoadCredentialsJson = $("#btnLoadCredentialsJson");
  const $credentialsJsonInput = $("#credentialsJsonInput");
  const $btnOpenAddCustomProvider = $("#btnOpenAddCustomProvider");
  const $addCustomProviderForm = $("#addCustomProviderForm");
  const $customProviderName = $("#customProviderName");
  const $customProviderUrl = $("#customProviderUrl");
  const $customProviderNameError = $("#customProviderNameError");
  const $customProviderUrlError = $("#customProviderUrlError");
  const $customProviderMessage = $("#customProviderMessage");
  const $btnConfirmAddCustomProvider = $("#btnConfirmAddCustomProvider");
  const $modalDeleteCustomProviderBody = $("#modalDeleteCustomProviderBody");
  const $btnConfirmDeleteCustomProvider = $("#btnConfirmDeleteCustomProvider");

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
   * Builds the create-credential payload from the form values. The base URL is
   * no longer part of the payload (US-36): it is tied to the provider, not the
   * credential.
   * @param {*} input - Raw form values.
   * @returns {*} Payload with trimmed provider/model/apiKey.
   */
  function buildCredentialPayload(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      provider: String(source.provider || "").trim().toLowerCase(),
      model: String(source.model || "").trim(),
      apiKey: String(source.apiKey || "").trim()
    };
  }

  /**
   * Normalizes a custom-provider row received from the backend.
   * @param {*} raw - Raw object.
   * @returns {{ name:string, urlBase:string, createdAt:string }}
   */
  function normaliseCustomProvider(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      name: String(source.name || "").trim().toLowerCase(),
      urlBase: String(source.urlBase || "").trim(),
      createdAt: typeof source.createdAt === "string" ? source.createdAt : ""
    };
  }

  /**
   * Pure validator for the "Add provider" modal inputs. Returns the first error
   * detected on each field, or null. Duplicate-name detection compares against
   * both the built-in catalog and the list of already-added custom providers.
   *
   * @param {{ name:*, urlBase:*, builtinNames:string[], customNames:string[] }} input
   * @returns {{ name:string|null, urlBase:string|null, hasError:boolean }}
   */
  function validateCustomProviderInput(input) {
    const source = input && typeof input === "object" ? input : {};
    const name = String(source.name || "").trim().toLowerCase();
    const urlBase = String(source.urlBase || "").trim();
    const builtin = Array.isArray(source.builtinNames) ? source.builtinNames : [];
    const customs = Array.isArray(source.customNames) ? source.customNames : [];

    let nameError = null;
    if (!name) {
      nameError = "El nombre del proveedor es obligatorio.";
    } else if (!PROVIDER_NAME_PATTERN.test(name)) {
      nameError = "El nombre sólo admite letras minúsculas, dígitos, '.', '_' o '-' (máx. 40).";
    } else if (builtin.includes(name) || customs.includes(name)) {
      nameError = "Proveedor ya añadido";
    }

    let urlError = null;
    if (!urlBase) {
      urlError = "La URL del proveedor es obligatoria.";
    } else if (urlBase.length > 255 || !(urlBase.startsWith("http://") || urlBase.startsWith("https://"))) {
      urlError = "La URL debe empezar por http:// o https:// (máx. 255).";
    }

    return { name: nameError, urlBase: urlError, hasError: Boolean(nameError || urlError) };
  }

  /**
   * Composes the unified provider list shown in the credentials selector:
   * built-in entries first (in declaration order), then custom ones (in
   * insertion order). Each entry carries `isCustom`. Pure.
   *
   * @param {Array<{ name:string, urlBase?:string }>} customProviders
   * @returns {Array<{ name:string, label:string, isCustom:boolean }>}
   */
  function composeProviderList(customProviders) {
    const result = BUILTIN_PROVIDERS.map(provider => ({
      name: provider.name,
      label: provider.label,
      isCustom: false
    }));
    const customs = Array.isArray(customProviders) ? customProviders : [];
    customs.forEach(provider => {
      const name = String((provider && provider.name) || "").trim().toLowerCase();
      if (!name)
        return;
      result.push({ name, label: name, isCustom: true });
    });
    return result;
  }

  /**
   * Builds the dropdown-menu markup for the provider selector. Follows the
   * canonical Bootstrap 5 pattern (`.dropdown-item` lives on the inner
   * `<button>`, not on the `<li>`). Custom rows include a trailing cross
   * button. Pure (no DOM access).
   *
   * @param {Array<{ name:string, label:string, isCustom:boolean }>} providers
   * @returns {string} HTML markup for the `<ul class="dropdown-menu">` body.
   */
  function buildProviderMenuHtml(providers) {
    const safe = Array.isArray(providers) ? providers : [];
    if (!safe.length)
      return '<li><span class="dropdown-item-text text-muted">Sin proveedores</span></li>';

    return safe.map(provider => {
      const name = escapeHtml(provider.name);
      const label = escapeHtml(provider.label || provider.name);
      if (!provider.isCustom) {
        return `<li><button type="button" class="dropdown-item provider-name" data-name="${name}">${label}</button></li>`;
      }
      return `<li class="provider-item d-flex align-items-center" data-custom="true" data-name="${name}">
        <button type="button" class="dropdown-item provider-name flex-grow-1" data-name="${name}">${label}</button>
        <button type="button" class="provider-delete btn btn-link text-secondary px-2 py-0" data-name="${name}" aria-label="Eliminar proveedor ${label}" title="Eliminar proveedor">&times;</button>
      </li>`;
    }).join("");
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
   * Decides whether a provider's model catalog can be queried live (US-35,
   * US-36). Built-in providers all support it; user-defined providers also
   * surface the picker (best-effort OpenAI-compatible catalog) so the user
   * can try the dropdown before falling back to manual entry.
   *
   * @param {*} provider - Canonical provider id.
   * @returns {boolean} True when the model picker applies.
   */
  function providerSupportsModelCatalog(provider) {
    const canonical = String(provider || "").trim().toLowerCase();
    if (!canonical)
      return false;
    return PROVIDER_NAME_PATTERN.test(canonical);
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
   * Resolves the effective model value of the form. The form-based flow only
   * supports picking from the live catalog (the manual input was removed); the
   * "Cargar desde JSON" importer bypasses this helper and posts the model
   * straight from the file. Pure (no DOM), so the precedence stays testable.
   * @param {{selectValue:*}} input
   * @returns {string} Trimmed model id (possibly empty).
   */
  function resolveModelFieldValue(input) {
    const source = input && typeof input === "object" ? input : {};
    return String(source.selectValue || "").trim();
  }

  /**
   * Builds the body for `POST /llm-credentials/models`, omitting empty fields
   * so the backend can fall back to the stored credential key. The base URL is
   * not part of the payload anymore (US-36): the server derives it from the
   * provider. Pure (no DOM).
   * @param {{provider:*, apiKey:*}} input - Raw form values.
   * @returns {{provider:string, apiKey?:string}} Payload.
   */
  function buildModelsRequestPayload(input) {
    const source = input && typeof input === "object" ? input : {};
    const payload = { provider: String(source.provider || "").trim().toLowerCase() };
    const apiKey = String(source.apiKey || "").trim();
    if (apiKey) payload.apiKey = apiKey;
    return payload;
  }

  /**
   * Builds the `<option>` markup for the model dropdown using the catalog
   * entries returned by the provider. The "manual entry" escape hatch was
   * removed; callers should hide the picker entirely when the catalog is empty
   * (the form-based flow then asks the user to type the API key first, or to
   * use "Cargar desde JSON" for providers without a queryable catalog).
   * @param {Array<{id:string, label:string}>} models - Normalized models.
   * @param {string} [selectedId] - Model id to preselect when present.
   * @returns {string} HTML options markup.
   */
  function buildModelOptionsHtml(models, selectedId) {
    const safeModels = Array.isArray(models) ? models : [];
    return safeModels.map(model => {
      const selected = model.id === selectedId ? " selected" : "";
      return `<option value="${escapeHtml(model.id)}"${selected}>${escapeHtml(model.label)}</option>`;
    }).join("");
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
   * Custom-providers URL for the current dataset (US-36).
   * @returns {string} URL.
   */
  function customProvidersUrl() {
    return `/api/datasets/${encodeURIComponent(state.datasetId)}/custom-providers`;
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
   * credentials and the custom providers when the panel applies.
   * @param {*} llmMode - Dataset llm_mode value.
   */
  function applyCredentialsPanelVisibility(llmMode) {
    const visible = shouldShowCredentialsPanel(llmMode);
    $llmCredentialsPanel.toggleClass("d-none", !visible);
    if (visible) {
      loadCustomProviders().always(loadCredentials);
    } else {
      state.credentials = [];
      state.customProviders = [];
      $credentialsTableBody.empty();
      renderProviderMenu();
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
   * @returns {*} jQuery deferred.
   */
  function loadCredentials() {
    $credentialsTableBody.html('<tr><td colspan="5" class="text-muted">Cargando credenciales...</td></tr>');

    return $.ajax({
      url: credentialsUrl(),
      method: "GET",
      dataType: "json"
    })
      .done(function (payload) {
        state.credentials = Array.isArray(payload)
          ? payload.map(normaliseCredential)
          : [];
        renderCredentials();
        renderProviderMenu();
        applyModelFieldMode();
      })
      .fail(function () {
        $credentialsTableBody.html('<tr><td colspan="5" class="text-danger">No se pudieron cargar las credenciales.</td></tr>');
      });
  }

  /**
   * Loads the dataset's user-defined providers (US-36).
   * @returns {*} jQuery deferred.
   */
  function loadCustomProviders() {
    return $.ajax({
      url: customProvidersUrl(),
      method: "GET",
      dataType: "json"
    })
      .done(function (payload) {
        state.customProviders = Array.isArray(payload)
          ? payload.map(normaliseCustomProvider)
          : [];
        renderProviderMenu();
      })
      .fail(function () {
        state.customProviders = [];
        renderProviderMenu();
      });
  }

  /**
   * Renders the provider dropdown (built-in + custom). Preserves the current
   * selection when possible; falls back to the first entry otherwise.
   */
  function renderProviderMenu() {
    const providers = composeProviderList(state.customProviders);
    $credProviderMenu.html(buildProviderMenuHtml(providers));

    const currentName = selectedProvider();
    const stillPresent = providers.some(provider => provider.name === currentName);
    const targetName = stillPresent ? currentName : (providers[0] ? providers[0].name : "");

    if (targetName)
      selectProvider(targetName, /* applyMode */ false);
    else
      $credProviderToggle.text("Selecciona un proveedor").attr("data-provider", "");
  }

  /**
   * Canonical provider currently selected in the credentials form.
   * @returns {string} Provider id.
   */
  function selectedProvider() {
    return String($credProviderToggle.attr("data-provider") || "").trim().toLowerCase();
  }

  /**
   * Updates the dropdown toggle label and `data-provider` to reflect a new
   * selection. When `applyMode` is true (the default), re-applies the model
   * field mode so the picker reloads its catalog.
   * @param {string} providerName - Canonical provider id.
   * @param {boolean} [applyMode] - When false, callers will re-apply manually.
   */
  function selectProvider(providerName, applyMode) {
    const name = String(providerName || "").trim().toLowerCase();
    const providers = composeProviderList(state.customProviders);
    const entry = providers.find(provider => provider.name === name);
    const label = entry ? entry.label : (name || "Selecciona un proveedor");
    $credProviderToggle.attr("data-provider", name).text(label);
    if (applyMode !== false)
      applyModelFieldMode();
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
   * Renders the model dropdown with the given catalog. Preselects the stored
   * credential's model when it is in the list, otherwise the first entry.
   * @param {Array<{id:string, label:string}>} models - Normalized models.
   */
  function renderModelSelect(models) {
    const list = Array.isArray(models) ? models : [];
    const stored = state.credentials.find(credential => credential.provider === selectedProvider());
    const preferred = stored && list.some(model => model.id === stored.model)
      ? stored.model
      : (list[0] ? list[0].id : "");

    $credModelSelect.html(buildModelOptionsHtml(list, preferred));
    if (preferred)
      $credModelSelect.val(preferred);
  }

  /**
   * Hides or shows the whole model picker group (label + select + reload button).
   * @param {boolean} visible - True to reveal the picker.
   */
  function setModelPickerVisible(visible) {
    $credModelPickerGroup.toggleClass("d-none", !visible);
  }

  /**
   * Applies the model-field mode for the selected provider. The picker stays
   * hidden until the user has entered an API key (or a stored credential for
   * this provider already exists, in which case the server can fetch the
   * catalog with the saved key).
   */
  function applyModelFieldMode() {
    const provider = selectedProvider();
    if (!provider || !providerSupportsModelCatalog(provider)) {
      setModelPickerVisible(false);
      setModelStatus("");
      return;
    }

    const hasKeySource = Boolean(String($credApiKey.val() || "").trim()) || hasStoredCredential(provider);
    if (!hasKeySource) {
      setModelPickerVisible(false);
      setModelStatus("Introduce la API key del proveedor para cargar sus modelos.", "muted");
      return;
    }

    setModelPickerVisible(true);
    loadModelCatalog({});
  }

  /**
   * Loads the provider's model catalog through the backend proxy
   * (`POST /llm-credentials/models`). Serves the page cache unless `force`.
   * Assumes the caller has already gated visibility on the presence of a key;
   * catalog failures (invalid key, rate limit, provider down) hide the picker
   * and surface the reason inline so the user can fix the key.
   * @param {{force?:boolean}} options
   */
  function loadModelCatalog(options) {
    const force = Boolean(options && options.force);
    const provider = selectedProvider();
    if (!providerSupportsModelCatalog(provider))
      return;

    const typedKey = String($credApiKey.val() || "").trim();
    if (!typedKey && !hasStoredCredential(provider)) {
      setModelPickerVisible(false);
      renderModelSelect([]);
      setModelStatus("Introduce la API key del proveedor para cargar sus modelos.", "muted");
      return;
    }

    const cacheKey = catalogCacheKey(provider, typedKey);
    if (!force && state.modelCatalogCache[cacheKey]) {
      renderModelSelect(state.modelCatalogCache[cacheKey]);
      setModelPickerVisible(state.modelCatalogCache[cacheKey].length > 0);
      setModelStatus(state.modelCatalogCache[cacheKey].length
        ? ""
        : "El proveedor no devolvió modelos compatibles. Usa \"Cargar desde JSON\" para registrar la credencial.", "muted");
      return;
    }

    setModelPickerVisible(true);
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
        apiKey: typedKey
      }))
    })
      .done(function (payload) {
        if (selectedProvider() !== provider)
          return; // Stale response: the user already switched provider.
        if (payload && payload.ok) {
          const models = normaliseCatalogModels(payload);
          state.modelCatalogCache[cacheKey] = models;
          renderModelSelect(models);
          setModelPickerVisible(models.length > 0);
          setModelStatus(models.length
            ? ""
            : "El proveedor no devolvió modelos compatibles. Usa \"Cargar desde JSON\" para registrar la credencial.", "muted");
          return;
        }
        renderModelSelect([]);
        setModelPickerVisible(false);
        setModelStatus((payload && payload.error) || "No se pudieron cargar los modelos del proveedor.", "danger");
      })
      .fail(function (xhr) {
        if (selectedProvider() !== provider)
          return;
        renderModelSelect([]);
        setModelPickerVisible(false);
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
      provider: selectedProvider(),
      model: resolveModelFieldValue({ selectValue: $credModelSelect.val() }),
      apiKey: $credApiKey.val()
    });

    if (!payload.provider || !payload.model || !payload.apiKey) {
      showCredentialMessage("Proveedor, modelo y API key son obligatorios. Para proveedores sin catálogo accesible usa \"Cargar desde JSON\".", "danger");
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
   * Resets the "Add provider" modal to a clean state (empty fields, no errors).
   */
  function resetCustomProviderModal() {
    $customProviderName.val("");
    $customProviderUrl.val("");
    $customProviderName.removeClass("is-invalid");
    $customProviderUrl.removeClass("is-invalid");
    $customProviderNameError.addClass("d-none").text("");
    $customProviderUrlError.addClass("d-none").text("");
    $customProviderMessage.addClass("d-none alert-danger alert-success alert-info").text("");
    $btnConfirmAddCustomProvider.prop("disabled", true);
  }

  /**
   * Validates the current modal inputs and paints the per-field error hints,
   * enabling the Accept button only when both fields are valid.
   */
  function validateAndPaintCustomProviderInputs() {
    const validation = validateCustomProviderInput({
      name: $customProviderName.val(),
      urlBase: $customProviderUrl.val(),
      builtinNames: BUILTIN_PROVIDER_NAMES,
      customNames: state.customProviders.map(provider => provider.name)
    });

    if (validation.name) {
      $customProviderName.addClass("is-invalid");
      $customProviderNameError.removeClass("d-none").text(validation.name);
    } else {
      $customProviderName.removeClass("is-invalid");
      $customProviderNameError.addClass("d-none").text("");
    }

    if (validation.urlBase) {
      $customProviderUrl.addClass("is-invalid");
      $customProviderUrlError.removeClass("d-none").text(validation.urlBase);
    } else {
      $customProviderUrl.removeClass("is-invalid");
      $customProviderUrlError.addClass("d-none").text("");
    }

    $btnConfirmAddCustomProvider.prop("disabled", validation.hasError);
  }

  /**
   * Posts the "Add provider" modal payload. On success refreshes the dropdown
   * without reloading the page and selects the new provider.
   */
  function submitCustomProviderForm() {
    const name = String($customProviderName.val() || "").trim().toLowerCase();
    const urlBase = String($customProviderUrl.val() || "").trim();
    const validation = validateCustomProviderInput({
      name,
      urlBase,
      builtinNames: BUILTIN_PROVIDER_NAMES,
      customNames: state.customProviders.map(provider => provider.name)
    });

    if (validation.hasError) {
      validateAndPaintCustomProviderInputs();
      return;
    }

    $btnConfirmAddCustomProvider.prop("disabled", true);

    $.ajax({
      url: customProvidersUrl(),
      method: "POST",
      contentType: "application/json",
      dataType: "json",
      data: JSON.stringify({ name, urlBase })
    })
      .done(function (payload) {
        const added = normaliseCustomProvider(payload);
        state.customProviders.push(added);
        renderProviderMenu();
        selectProvider(added.name);
        closeBootstrapModal("modalAddCustomProvider");
        showCredentialMessage(`Proveedor "${added.name}" añadido.`, "success");
      })
      .fail(function (xhr) {
        const message = extractErrorMessage(xhr, "No se pudo añadir el proveedor.");
        $customProviderMessage
          .removeClass("d-none alert-success alert-info")
          .addClass("alert-danger")
          .text(message);
      })
      .always(function () {
        $btnConfirmAddCustomProvider.prop("disabled", false);
      });
  }

  /**
   * Opens the delete-confirmation modal for the given custom provider name.
   * @param {string} name - Provider name to delete.
   */
  function openDeleteCustomProviderModal(name) {
    state.pendingDeleteCustomProvider = name;
    $modalDeleteCustomProviderBody.html(
      `¿Está seguro de eliminar el proveedor <strong>${escapeHtml(name)}</strong>?
       <div class="form-text text-muted mt-2">Se eliminará también las credenciales asociadas.</div>`
    );
    openBootstrapModal("modalDeleteCustomProvider");
  }

  /**
   * Deletes a custom provider via DELETE; closes the modal and refreshes the
   * dropdown and the credentials table (the credential row, if any, was
   * cascade-removed by the server).
   * @param {string} name - Provider name.
   */
  function deleteCustomProvider(name) {
    $btnConfirmDeleteCustomProvider.prop("disabled", true);

    $.ajax({
      url: `${customProvidersUrl()}/${encodeURIComponent(name)}`,
      method: "DELETE",
      dataType: "json"
    })
      .done(function () {
        state.customProviders = state.customProviders.filter(provider => provider.name !== name);
        state.pendingDeleteCustomProvider = null;
        closeBootstrapModal("modalDeleteCustomProvider");
        renderProviderMenu();
        loadCredentials();
        showCredentialMessage(`Proveedor "${name}" eliminado.`, "success");
      })
      .fail(function (xhr) {
        showCredentialMessage(extractErrorMessage(xhr, "No se pudo eliminar el proveedor."), "danger");
      })
      .always(function () {
        $btnConfirmDeleteCustomProvider.prop("disabled", false);
      });
  }

  /**
   * Opens a Bootstrap modal. Prefers `bootstrap.Modal` when available; falls
   * back to a pure-DOM implementation (toggling the `show` class, a manually
   * managed `.modal-backdrop` and `body.modal-open`) so the modal opens even
   * when the Bootstrap bundle failed to load. Both paths honour
   * `[data-bs-dismiss="modal"]` buttons and backdrop / Escape clicks.
   * @param {string} elementId - Modal element id.
   */
  function openBootstrapModal(elementId) {
    const element = document.getElementById(elementId);
    if (!element)
      return;

    try {
      if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(element).show();
        return;
      }
    } catch (_error) {
      // Fall through to manual DOM path.
    }

    showModalManually(element);
  }

  /**
   * Closes a Bootstrap modal. Mirrors `openBootstrapModal` with the same
   * bootstrap-or-fallback strategy.
   * @param {string} elementId - Modal element id.
   */
  function closeBootstrapModal(elementId) {
    const element = document.getElementById(elementId);
    if (!element)
      return;

    try {
      if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
        const instance = bootstrap.Modal.getInstance(element);
        if (instance) {
          instance.hide();
          return;
        }
      }
    } catch (_error) {
      // Fall through to manual DOM path.
    }

    hideModalManually(element);
  }

  /**
   * Pure-DOM modal show: applies Bootstrap's runtime classes/inline styles
   * (which Bootstrap CSS already styles) and wires the dismiss interactions.
   * @param {HTMLElement} element - Modal root element.
   */
  function showModalManually(element) {
    element.style.display = "block";
    element.classList.add("show");
    element.removeAttribute("aria-hidden");
    element.setAttribute("aria-modal", "true");
    element.setAttribute("role", "dialog");
    document.body.classList.add("modal-open");

    if (!document.querySelector(".modal-backdrop[data-fallback='1']")) {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop fade show";
      backdrop.dataset.fallback = "1";
      document.body.appendChild(backdrop);
      backdrop.addEventListener("click", () => hideModalManually(element));
    }

    element.querySelectorAll('[data-bs-dismiss="modal"]').forEach(button => {
      button.addEventListener("click", function onDismiss() {
        button.removeEventListener("click", onDismiss);
        hideModalManually(element);
      }, { once: true });
    });

    if (!element.dataset.escapeBound) {
      element.dataset.escapeBound = "1";
      document.addEventListener("keydown", function onEscape(event) {
        if (event.key === "Escape" && element.classList.contains("show")) {
          hideModalManually(element);
          document.removeEventListener("keydown", onEscape);
          delete element.dataset.escapeBound;
        }
      });
    }
  }

  /**
   * Pure-DOM modal hide. Removes the runtime classes/styles plus the fallback
   * backdrop appended by {@link showModalManually}.
   * @param {HTMLElement} element - Modal root element.
   */
  function hideModalManually(element) {
    element.classList.remove("show");
    element.style.display = "";
    element.setAttribute("aria-hidden", "true");
    element.removeAttribute("aria-modal");
    element.removeAttribute("role");
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".modal-backdrop[data-fallback='1']").forEach(backdrop => backdrop.remove());
  }

  /**
   * Runs the "check" action for a credential and shows the model reply in a modal.
   * @param {string} provider - Provider identifier.
   * @param {HTMLElement|null|undefined} trigger - Button that launched the check.
   */
  function checkCredential(provider, trigger) {
    const $trigger = trigger ? $(trigger) : $();
    const originalText = $trigger.text();
    $trigger.prop("disabled", true).attr("aria-busy", "true").text("Comprobando...");

    $.ajax({
      url: `${credentialsUrl()}/${encodeURIComponent(provider)}/check`,
      method: "POST",
      dataType: "json",
      timeout: CREDENTIAL_CHECK_TIMEOUT_MS
    })
      .done(function (payload) {
        showCheckModal(buildCheckResultText(payload));
      })
      .fail(function (xhr, textStatus) {
        showCheckModal(buildCheckFailureText(xhr, textStatus));
      })
      .always(function () {
        $trigger.prop("disabled", false).removeAttr("aria-busy").text(originalText);
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
   * Builds the modal text for transport-level check failures, including the
   * frontend timeout that intentionally stops waiting after five seconds.
   * @param {JQuery.jqXHR|null|undefined} xhr - Failed jQuery request.
   * @param {string|null|undefined} textStatus - jQuery failure status.
   * @returns {string} Human-readable failure text.
   */
  function buildCheckFailureText(xhr, textStatus) {
    if (textStatus === "timeout")
      return "Error: la comprobación ha superado el tiempo máximo de 5 segundos.";
    return `Error: ${extractErrorMessage(xhr, "no se pudo comprobar la credencial.")}`;
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
   * @param {{provider:string, model:string, apiKey:string}} entry
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

    $credProviderMenu.on("click", ".provider-name", function (event) {
      event.preventDefault();
      const name = String($(this).data("name") || "");
      if (name)
        selectProvider(name);
    });

    $credProviderMenu.on("click", ".provider-delete", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const name = String($(this).data("name") || "");
      if (name)
        openDeleteCustomProviderModal(name);
    });

    $btnOpenAddCustomProvider.on("click", function () {
      resetCustomProviderModal();
      openBootstrapModal("modalAddCustomProvider");
    });

    $addCustomProviderForm.on("submit", function (event) {
      event.preventDefault();
      submitCustomProviderForm();
    });

    $customProviderName.on("input", validateAndPaintCustomProviderInputs);
    $customProviderUrl.on("input", validateAndPaintCustomProviderInputs);

    $("#modalAddCustomProvider").on("show.bs.modal", resetCustomProviderModal);

    $btnConfirmDeleteCustomProvider.on("click", function () {
      const name = state.pendingDeleteCustomProvider;
      if (!name)
        return;
      deleteCustomProvider(name);
    });

    $credApiKey.on("input", scheduleModelCatalogReload);

    $btnReloadModels.on("click", function () {
      loadModelCatalog({ force: true });
    });

    // The model select used to also offer a "write manually" sentinel; that
    // path was removed. The native change handler now has nothing to do.

    $credentialsTableBody.on("click", ".cred-activate", function () {
      activateCredential($(this).data("provider"));
    });

    $credentialsTableBody.on("click", ".cred-delete", function () {
      deleteCredential($(this).data("provider"));
    });

    $credentialsTableBody.on("click", ".cred-check", function () {
      checkCredential($(this).data("provider"), this);
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
