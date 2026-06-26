'use strict';

/**
 * @file Dataset LLM credentials service (US-31).
 *
 * Owns the business rules for per-dataset AI credentials:
 *   - authorization (every write/list/check requires dataset admin);
 *   - at-rest encryption (delegated to `utils/secret-crypto`) and masking
 *     (the clear key never leaves the service);
 *   - the `llm_mode = 'none'` gate (panel hidden ⇒ empty list, writes/check
 *     rejected, no credential resolved even if rows exist);
 *   - resolving the active credential into a `providerConfig` for the
 *     annotation `/check` flow;
 *   - the "check" action that calls the model with the decrypted key.
 *
 * Dependencies are injected so the service can be unit-tested without a DB or
 * real network/crypto.
 *
 * @typedef {Object} DatasetLlmCredentialsServiceDeps
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [credentialsRepository]
 * @property {Record<string, any>} [customProvidersRepository]
 * @property {Record<string, any>} [secretCrypto]
 * @property {Record<string, any>} [llmClient]
 * @property {Record<string, any>} [modelCatalog]
 */

const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetLlmCredentialsRepository } = require('../repositories/dataset-llm-credentials-repository');
const { createDatasetCustomProvidersRepository } = require('../repositories/dataset-custom-providers-repository');
const secretCryptoModule = require('../utils/secret-crypto');
const llmClientModule = require('../utils/llm-client');
const modelCatalogModule = require('../utils/llm-model-catalog');
const { assertDatasetAdminPermission } = require('./datasets-permissions-service');
const { ServiceError } = require('./service-error');
const { mapDatasetLlmCredentialDTO, mapDatasetLlmCredentialDTOs } = require('../contracts/dto-mappers');
const { trimmedOr } = require('../utils/validators');
const {
    PROVIDER_NAME_PATTERN,
    getBuiltinProvider
} = require('../constants/llm-providers');

/** Disabled-AI mode where the whole credentials panel does not apply. */
const LLM_MODE_NONE = 'none';
/** Maximum accepted model name length (mirrors the column). */
const MODEL_MAX_LENGTH = 120;

/**
 * Builds the dataset-LLM-credentials service.
 *
 * @param {DatasetLlmCredentialsServiceDeps} [options]
 */
function createDatasetLlmCredentialsService({
    datasetsPermissionsRepository,
    credentialsRepository,
    customProvidersRepository,
    secretCrypto,
    llmClient,
    modelCatalog
} = {}) {
    const deps = {
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        credentialsRepository: credentialsRepository || createDatasetLlmCredentialsRepository(),
        customProvidersRepository: customProvidersRepository || createDatasetCustomProvidersRepository(),
        secretCrypto: secretCrypto || secretCryptoModule,
        llmClient: llmClient || llmClientModule,
        modelCatalog: modelCatalog || modelCatalogModule
    };

    /**
     * Lists the masked credentials of a dataset for its admin. Returns an empty
     * list when `llm_mode = 'none'` (the panel does not apply).
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @returns {Promise<Array<Record<string, any>>>}
     */
    async function listForAdmin(actorId, datasetId) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        if (isLlmDisabled(permit))
            return [];

        const rows = await deps.credentialsRepository.listByDataset(datasetId);
        return mapDatasetLlmCredentialDTOs(rows);
    }

    /**
     * Creates or updates a provider credential. Validates input, derives the
     * provider's `apiBase` (built-in constant or custom-provider row of the
     * dataset), encrypts the key and returns the masked DTO. Rejected when
     * `llm_mode = 'none'` or when the provider does not belong to the dataset.
     *
     * Note: the legacy `apiBase` field of the input payload is **ignored** —
     * the URL is tied to the provider, not to the credential (US-36).
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {{ provider?:string, model?:string, apiKey?:string }} input
     * @returns {Promise<Record<string, any>>}
     */
    async function saveCredential(actorId, datasetId, input) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProviderId(input?.provider);
        const model = normalizeModel(input?.model);
        const apiKey = normalizeApiKey(input?.apiKey);
        const apiBase = await resolveProviderApiBase(datasetId, provider);

        const apiKeyCipher = deps.secretCrypto.encryptSecret(apiKey);
        const keyLast4 = apiKey.slice(-4);

        const row = await deps.credentialsRepository.upsertByProvider({
            datasetId,
            provider,
            apiBase,
            model,
            apiKeyCipher,
            keyLast4
        });

        return mapDatasetLlmCredentialDTO(row);
    }

    /**
     * Resolves the base URL bound to a provider name within a dataset. Built-in
     * names return the canonical constant; custom names are looked up in the
     * dataset's `DatasetCustomProvider` table. Unknown names throw 400.
     *
     * @param {number} datasetId
     * @param {string} provider - Already-normalized provider id.
     * @returns {Promise<string>} Base URL.
     */
    async function resolveProviderApiBase(datasetId, provider) {
        const builtin = getBuiltinProvider(provider);
        if (builtin)
            return builtin.urlBase;

        const custom = await deps.customProvidersRepository.findByName({ datasetId, name: provider });
        if (!custom)
            throw invalidPayload('El proveedor no está registrado en este dataset.');
        return custom.urlBase;
    }

    /**
     * Activates a provider credential (deactivating the rest). Rejected when
     * `llm_mode = 'none'` or when the provider does not exist.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {string} rawProvider
     * @returns {Promise<{ provider:string, isActive:true }>}
     */
    async function activateCredential(actorId, datasetId, rawProvider) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProviderId(rawProvider);
        const activatedCount = await deps.credentialsRepository.setActive({ datasetId, provider });
        if (!activatedCount)
            throw credentialNotFound();

        return { provider, isActive: true };
    }

    /**
     * Deletes a provider credential. Rejected when `llm_mode = 'none'` or when
     * the provider does not exist.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {string} rawProvider
     * @returns {Promise<{ removed:true, provider:string }>}
     */
    async function deleteCredential(actorId, datasetId, rawProvider) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProviderId(rawProvider);
        const result = await deps.credentialsRepository.deleteByProvider({ datasetId, provider });
        if (!result || !result.count)
            throw credentialNotFound();

        return { removed: true, provider };
    }

    /**
     * "Check" action: calls the model with the decrypted key and returns the
     * text it produced. Never persists anything and never leaks the key.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {string} rawProvider
     * @returns {Promise<{ ok:boolean, message?:string, error?:string }>}
     */
    async function checkCredential(actorId, datasetId, rawProvider) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProviderId(rawProvider);
        const row = await deps.credentialsRepository.findByProvider({ datasetId, provider });
        if (!row)
            throw credentialNotFound();

        const apiKey = deps.secretCrypto.decryptSecret(row.apiKeyCipher);
        const providerConfig = buildProviderConfig(row, apiKey);
        const prompt = `Respond "I'm ${row.model} and I am ready to work"`;

        try {
            const message = await deps.llmClient.generateText({ providerConfig, prompt });
            return { ok: true, message: typeof message === 'string' ? message : String(message) };
        } catch (caughtError) {
            return { ok: false, error: sanitizeProviderError(caughtError, apiKey) };
        }
    }

    /**
     * Lists the provider's available models for the picker (US-35, US-36). The
     * key typed in the form wins; with no typed key the stored credential of
     * that provider is decrypted server-side. The base URL is always derived
     * from the provider (built-in constant or custom-provider row of the
     * dataset), never accepted from the input. Provider-side failures are
     * returned as `{ ok:false, code, error }` (same handled-failure contract
     * as the "check" action) with the key redacted; bad input throws 400.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {{ provider?:string, apiKey?:string }} input
     * @returns {Promise<{ ok:true, provider:string, models:Array<{id:string,label:string}> }|{ ok:false, provider:string, code:string, error:string }>}
     */
    async function listProviderModels(actorId, datasetId, input) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProviderId(input?.provider);
        const apiBase = await resolveProviderApiBase(datasetId, provider);

        if (!deps.modelCatalog.supportsModelCatalog(provider))
            throw invalidPayload('Este proveedor no ofrece un catálogo de modelos consultable.');

        let apiKey = trimmedOr(input?.apiKey);
        if (!apiKey) {
            const row = await deps.credentialsRepository.findByProvider({ datasetId, provider });
            if (!row) {
                throw invalidPayload('Introduce una API key (o guarda antes una credencial del proveedor) para consultar sus modelos.');
            }
            apiKey = deps.secretCrypto.decryptSecret(row.apiKeyCipher);
        }

        try {
            const models = await deps.modelCatalog.listModels({ provider, apiKey, apiBase });
            return { ok: true, provider, models };
        } catch (caughtError) {
            const code = caughtError && typeof (/** @type {any} */ (caughtError).code) === 'string'
                ? /** @type {any} */ (caughtError).code
                : 'provider_unavailable';
            return { ok: false, provider, code, error: sanitizeProviderError(caughtError, apiKey) };
        }
    }

    /**
     * Returns the "active credential" status of a dataset for a user who only
     * holds a `Permit` (not necessarily admin). The annotation flow (US-33)
     * needs this to decide whether to enable the "Confirmar" button: the
     * admin-only listing is too coarse a gate for that.
     *
     * The response intentionally does not include any cipher or `keyLast4`:
     * only the boolean `hasActive` plus the dataset's `llmMode`.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @returns {Promise<{ hasActive:boolean, llmMode:string }>}
     */
    async function getActiveStatusForUser(actorId, datasetId) {
        const permit = await deps.datasetsPermissionsRepository.findPermitForUser({ datasetId, userId: actorId });
        if (!permit)
            throw ServiceError.datasetNotFound();

        const llmMode = permit?.dataset?.llmMode || LLM_MODE_NONE;
        if (llmMode === LLM_MODE_NONE)
            return { hasActive: false, llmMode };

        const active = await deps.credentialsRepository.findActiveByDataset(datasetId);
        return { hasActive: Boolean(active), llmMode };
    }

    /**
     * Resolves the active credential of a dataset into a `providerConfig` for
     * the annotation `/check` flow. Internal use (no authorization here — the
     * caller validates dataset access). Returns `null` when `llm_mode = 'none'`
     * or when there is no active credential.
     *
     * @param {number} datasetId
     * @returns {Promise<{ provider:string, apiBase:string|null, model:string, apiKey:string }|null>}
     */
    async function resolveActiveProviderConfig(datasetId) {
        const llmMode = await deps.credentialsRepository.findDatasetLlmMode(datasetId);
        if (!llmMode || llmMode === LLM_MODE_NONE)
            return null;

        const active = await deps.credentialsRepository.findActiveByDataset(datasetId);
        if (!active)
            return null;

        const apiKey = deps.secretCrypto.decryptSecret(active.apiKeyCipher);
        return buildProviderConfig(active, apiKey);
    }

    return {
        listForAdmin,
        saveCredential,
        activateCredential,
        deleteCredential,
        checkCredential,
        listProviderModels,
        resolveActiveProviderConfig,
        getActiveStatusForUser
    };
}

/**
 * Builds a `providerConfig` from a credential row and its decrypted key.
 * @param {Record<string, any>} row - Credential row.
 * @param {string} apiKey - Decrypted API key.
 * @returns {{ provider:string, apiBase:string|null, model:string, apiKey:string }}
 */
function buildProviderConfig(row, apiKey) {
    return {
        provider: row.provider,
        apiBase: row.apiBase || null,
        model: row.model,
        apiKey
    };
}

/**
 * Indicates whether the dataset attached to a permit has AI disabled.
 * @param {Record<string, any>} permit - Permit (includes `dataset`).
 * @returns {boolean}
 */
function isLlmDisabled(permit) {
    const llmMode = permit?.dataset?.llmMode || LLM_MODE_NONE;
    return llmMode === LLM_MODE_NONE;
}

/**
 * Throws `409 llm_disabled` when the dataset has AI disabled.
 * @param {Record<string, any>} permit - Permit (includes `dataset`).
 * @returns {void}
 */
function assertLlmEnabled(permit) {
    if (isLlmDisabled(permit)) {
        throw new ServiceError('Las credenciales de IA no aplican: el dataset no usa LLMs.', {
            status: 409,
            code: 'llm_disabled'
        });
    }
}

/**
 * Validates and normalizes the provider identifier shape (lowercase, conservative
 * charset, length 1-40). Existence of the provider in the dataset (built-in or
 * custom row) is asserted separately by `resolveProviderApiBase`.
 *
 * @param {*} value - Raw provider.
 * @returns {string} Lowercased provider.
 */
function normalizeProviderId(value) {
    const provider = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!PROVIDER_NAME_PATTERN.test(provider))
        throw invalidPayload('El proveedor de IA es inválido.');
    return provider;
}

/**
 * Validates and normalizes the model name.
 * @param {*} value - Raw model.
 * @returns {string} Trimmed model.
 */
function normalizeModel(value) {
    const model = trimmedOr(value);
    if (!model || model.length > MODEL_MAX_LENGTH)
        throw invalidPayload('El modelo de IA es inválido.');
    return model;
}

/**
 * Validates and normalizes the API key.
 * @param {*} value - Raw API key.
 * @returns {string} Trimmed key.
 */
function normalizeApiKey(value) {
    const apiKey = typeof value === 'string' ? value.trim() : '';
    if (apiKey.length < 1)
        throw invalidPayload('La API key es obligatoria.');
    return apiKey;
}

/**
 * Builds a `400 invalid_payload` service error.
 * @param {string} message - Human message.
 * @returns {ServiceError}
 */
function invalidPayload(message) {
    return new ServiceError(message, { status: 400, code: 'invalid_payload' });
}

/**
 * Builds a `404 credential_not_found` service error.
 * @returns {ServiceError}
 */
function credentialNotFound() {
    return new ServiceError('No existe una credencial para ese proveedor en el dataset.', {
        status: 404,
        code: 'credential_not_found'
    });
}

/**
 * Produces a safe error message for a failed provider call, redacting the API
 * key if it ever appeared in the message.
 * @param {*} error - Caught error.
 * @param {string} apiKey - Decrypted API key to redact.
 * @returns {string} Sanitized message.
 */
function sanitizeProviderError(error, apiKey) {
    const message = error && typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message
        : 'No se pudo contactar con el proveedor de IA.';

    if (apiKey && message.includes(apiKey))
        return message.split(apiKey).join('[REDACTED]');

    return message;
}

module.exports = {
    createDatasetLlmCredentialsService
};
