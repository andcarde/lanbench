'use strict';

/**
 * @file Dataset custom-providers service (US-36).
 *
 * Owns the rules around user-added LLM providers per dataset:
 *   - authorization (admin-only),
 *   - name and URL validation (same shape as the credentials service),
 *   - duplicate-name guard against the built-in catalog and against existing
 *     custom providers of the same dataset,
 *   - cascading credential cleanup on delete (decision 5 of the plan).
 *
 * The service does not touch encryption: custom providers do not store any
 * secret material — only the base URL.
 *
 * @typedef {Object} DatasetCustomProvidersServiceDeps
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [customProvidersRepository]
 */

const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetCustomProvidersRepository } = require('../repositories/dataset-custom-providers-repository');
const { assertDatasetAdminPermission } = require('./datasets-permissions-service');
const { ServiceError } = require('./service-error');
const { trimmedOr } = require('../utils/validators');
const {
    PROVIDER_NAME_PATTERN,
    isBuiltinProviderName
} = require('../constants/llm-providers');

/** Maximum accepted base URL length (mirrors the column). */
const URL_BASE_MAX_LENGTH = 255;

/**
 * Builds the dataset-custom-providers service.
 *
 * @param {DatasetCustomProvidersServiceDeps} [options]
 */
function createDatasetCustomProvidersService({
    datasetsPermissionsRepository,
    customProvidersRepository
} = {}) {
    const deps = {
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        customProvidersRepository: customProvidersRepository || createDatasetCustomProvidersRepository()
    };

    /**
     * Lists the custom providers of a dataset for its admin.
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @returns {Promise<Array<{ name:string, urlBase:string, createdAt:Date }>>}
     */
    async function listForAdmin(actorId, datasetId) {
        await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        return deps.customProvidersRepository.listByDataset(datasetId);
    }

    /**
     * Creates a custom provider for the dataset. Rejects:
     *   - non-admin actors (403),
     *   - invalid name or URL (400),
     *   - duplicate names against the built-in catalog or against an existing
     *     custom row in the same dataset (409).
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {{ name?:string, urlBase?:string }} input
     * @returns {Promise<{ name:string, urlBase:string, createdAt:Date }>}
     */
    async function createCustomProvider(actorId, datasetId, input) {
        await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);

        const name = normalizeProviderName(input?.name);
        const urlBase = normalizeProviderUrlBase(input?.urlBase);

        if (isBuiltinProviderName(name))
            throw providerAlreadyExists();

        const existing = await deps.customProvidersRepository.findByName({ datasetId, name });
        if (existing)
            throw providerAlreadyExists();

        try {
            return await deps.customProvidersRepository.create({ datasetId, name, urlBase });
        } catch (caughtError) {
            // Concurrent creation: the unique constraint won the race.
            if (caughtError && caughtError.code === 'P2002')
                throw providerAlreadyExists();
            throw caughtError;
        }
    }

    /**
     * Deletes a custom provider together with any credential row that
     * references it (cascade in the same transaction at the repository level).
     * Rejects:
     *   - non-admin actors (403),
     *   - built-in provider names (400),
     *   - unknown custom provider for the dataset (404).
     *
     * @param {number} actorId
     * @param {number} datasetId
     * @param {string} rawName
     * @returns {Promise<{ removed:true, name:string, credentialsRemoved:number }>}
     */
    async function deleteCustomProvider(actorId, datasetId, rawName) {
        await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);

        const name = normalizeProviderName(rawName);
        if (isBuiltinProviderName(name))
            throw new ServiceError('No se puede eliminar un proveedor cableado en la plataforma.', {
                status: 400,
                code: 'invalid_payload'
            });

        const result = await deps.customProvidersRepository.deleteByName({ datasetId, name });
        if (!result || !result.count)
            throw new ServiceError('El proveedor personalizado no existe en este dataset.', {
                status: 404,
                code: 'custom_provider_not_found'
            });

        return { removed: true, name, credentialsRemoved: Number(result.credentialsRemoved || 0) };
    }

    return {
        listForAdmin,
        createCustomProvider,
        deleteCustomProvider
    };
}

/**
 * Validates and normalizes the provider name (same shape as the credentials
 * service so any name accepted here can be later persisted as `provider`).
 *
 * @param {*} value - Raw name.
 * @returns {string} Lowercased name.
 */
function normalizeProviderName(value) {
    const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!PROVIDER_NAME_PATTERN.test(name))
        throw new ServiceError('El nombre del proveedor es inválido.', {
            status: 400,
            code: 'invalid_payload'
        });
    return name;
}

/**
 * Validates and normalizes the provider base URL.
 *
 * @param {*} value - Raw URL.
 * @returns {string} Trimmed URL.
 */
function normalizeProviderUrlBase(value) {
    const urlBase = trimmedOr(value);
    if (!urlBase
        || urlBase.length > URL_BASE_MAX_LENGTH
        || !(urlBase.startsWith('http://') || urlBase.startsWith('https://'))) {
        throw new ServiceError('La URL del proveedor es inválida.', {
            status: 400,
            code: 'invalid_payload'
        });
    }
    return urlBase;
}

/**
 * Builds the `409 provider_already_exists` service error.
 * @returns {ServiceError}
 */
function providerAlreadyExists() {
    return new ServiceError('Proveedor ya añadido', {
        status: 409,
        code: 'provider_already_exists'
    });
}

module.exports = {
    createDatasetCustomProvidersService
};
