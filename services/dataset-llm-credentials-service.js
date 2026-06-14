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
 * @property {Record<string, any>} [secretCrypto]
 * @property {Record<string, any>} [llmClient]
 * @property {Record<string, any>} [modelCatalog]
 */

const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetLlmCredentialsRepository } = require('../repositories/dataset-llm-credentials-repository');
const secretCryptoModule = require('../utils/secret-crypto');
const llmClientModule = require('../utils/llm-client');
const modelCatalogModule = require('../utils/llm-model-catalog');
const { assertDatasetAdminPermission } = require('./datasets-permissions-service');
const { ServiceError } = require('./service-error');
const { mapDatasetLlmCredentialDTO, mapDatasetLlmCredentialDTOs } = require('../contracts/dto-mappers');
const { trimmedOr } = require('../utils/validators');

/** Disabled-AI mode where the whole credentials panel does not apply. */
const LLM_MODE_NONE = 'none';
/** Allowed provider identifier shape (lowercase, conservative charset). */
const PROVIDER_PATTERN = /^[a-z0-9._-]{1,40}$/;
/** Maximum accepted model name length (mirrors the column). */
const MODEL_MAX_LENGTH = 120;
/** Maximum accepted API base length (mirrors the column). */
const API_BASE_MAX_LENGTH = 255;

/**
 * Builds the dataset-LLM-credentials service.
 *
 * @param {DatasetLlmCredentialsServiceDeps} [options]
 */
function createDatasetLlmCredentialsService({
    datasetsPermissionsRepository,
    credentialsRepository,
    secretCrypto,
    llmClient,
    modelCatalog
} = {}) {
    const deps = {
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        credentialsRepository: credentialsRepository || createDatasetLlmCredentialsRepository(),
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
     * Creates or updates a provider credential. Validates input, encrypts the
     * key and returns the masked DTO. Rejected when `llm_mode = 'none'`.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {{ provider?:string, apiBase?:string, model?:string, apiKey?:string }} input
     * @returns {Promise<Record<string, any>>}
     */
    async function saveCredential(actorId, datasetId, input) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProvider(input?.provider);
        const model = normalizeModel(input?.model);
        const apiBase = normalizeApiBase(input?.apiBase);
        const apiKey = normalizeApiKey(input?.apiKey);

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

        const provider = normalizeProvider(rawProvider);
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

        const provider = normalizeProvider(rawProvider);
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

        const provider = normalizeProvider(rawProvider);
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
     * Lists the provider's available models for the picker (US-35). The key
     * typed in the form wins; with no typed key the stored credential of that
     * provider is decrypted server-side. Provider-side failures are returned
     * as `{ ok:false, code, error }` (same handled-failure contract as the
     * "check" action) with the key redacted; bad input throws 400.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {{ provider?:string, apiKey?:string, apiBase?:string }} input
     * @returns {Promise<{ ok:true, provider:string, models:Array<{id:string,label:string}> }|{ ok:false, provider:string, code:string, error:string }>}
     */
    async function listProviderModels(actorId, datasetId, input) {
        const permit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        assertLlmEnabled(permit);

        const provider = normalizeProvider(input?.provider);
        if (!deps.modelCatalog.supportsModelCatalog(provider))
            throw invalidPayload('Este proveedor no ofrece un catálogo de modelos consultable.');

        let apiKey = trimmedOr(input?.apiKey);
        let apiBase = normalizeApiBase(input?.apiBase);

        if (!apiKey) {
            const row = await deps.credentialsRepository.findByProvider({ datasetId, provider });
            if (!row) {
                throw invalidPayload('Introduce una API key (o guarda antes una credencial del proveedor) para consultar sus modelos.');
            }
            apiKey = deps.secretCrypto.decryptSecret(row.apiKeyCipher);
            if (!apiBase)
                apiBase = row.apiBase || null;
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
 * Validates and normalizes the provider identifier.
 * @param {*} value - Raw provider.
 * @returns {string} Lowercased provider.
 */
function normalizeProvider(value) {
    const provider = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!PROVIDER_PATTERN.test(provider))
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
 * Validates and normalizes the optional API base URL.
 * @param {*} value - Raw API base.
 * @returns {string|null} Trimmed URL, or null when absent.
 */
function normalizeApiBase(value) {
    const apiBase = trimmedOr(value);
    if (apiBase === null)
        return null;

    if (apiBase.length > API_BASE_MAX_LENGTH || !(apiBase.startsWith('http://') || apiBase.startsWith('https://')))
        throw invalidPayload('La URL base del proveedor es inválida.');

    if (isGroqWebsiteHost(apiBase))
        throw invalidPayload('La URL base apunta a la web de Groq (console.groq.com / groq.com). Usa https://api.groq.com/openai/v1.');

    return apiBase;
}

/**
 * Detects URLs that point to Groq's website (console/marketing) instead of
 * its API host (`api.groq.com`). These return HTML 404 pages and are a common
 * setup mistake.
 *
 * @param {string} apiBase - Trimmed http(s) URL.
 * @returns {boolean}
 */
function isGroqWebsiteHost(apiBase) {
    try {
        const host = new URL(apiBase).hostname.toLowerCase();
        return host === 'groq.com' || host === 'www.groq.com' || host === 'console.groq.com';
    } catch {
        return false;
    }
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
