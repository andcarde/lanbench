'use strict';

/**
 * @file Datasets permissions service — bounded context for US-22
 * (per-dataset admin/annotator/reviewer permissions).
 *
 * Injects `datasetsRepository` and `usersRepository`. Exposes both the
 * high-level operations (`listDatasetPermissions`,
 * `addDatasetPermissionByEmail`, `updateDatasetPermission`) and the shared
 * helper `assertDatasetAdminPermission`, consumed by
 * `datasets-service.deleteDataset` (which also requires being an admin but
 * belongs to the main context).
 *
 * @typedef {Object} DatasetsPermissionsServiceDeps
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [usersRepository]
 */

const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createUsersRepository } = require('../repositories/users-repository');
const { ServiceError } = require('./service-error');
const { normalizeEmail } = require('../utils/validators');

/**
 * Builds the dataset-permissions service.
 *
 * @param {DatasetsPermissionsServiceDeps} [options]
 */
function createDatasetsPermissionsService({ datasetsPermissionsRepository, usersRepository } = {}) {
    const deps = {
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        usersRepository: usersRepository || createUsersRepository()
    };

    /**
     * Lists the user permissions of a dataset administrable by the actor.
     * @param {number} actorId - Current user.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Permissions.
     */
    async function listDatasetPermissions(actorId, datasetId) {
        const adminPermit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        const rows = await deps.datasetsPermissionsRepository.findPermissionRowsByDataset({ datasetId });

        return {
            dataset: {
                datasetId: adminPermit.dataset.id,
                name: adminPermit.dataset.name
            },
            options: {
                llmMode: adminPermit.dataset.llmMode || 'none',
                isReviewEnabled: Boolean(adminPermit.dataset.isReviewEnabled),
                hasAdditionalReviews: Boolean(adminPermit.dataset.hasAdditionalReviews)
            },
            users: rows
                .map(mapPermitRowToPermissionDTO)
                .sort((/** @type {*} */ a, /** @type {*} */ b) => a.email.localeCompare(b.email))
        };
    }

    /**
     * Adds a user to the dataset's permissions.
     * @param {number} actorId - Current user.
     * @param {number} datasetId - Dataset.
     * @param {string} email - Exact email of the user to add.
     * @param {*} [requestedPermissions] - Requested permissions; defaults to annotator.
     * @returns {Promise<*>} Permission row.
     */
    async function addDatasetPermissionByEmail(actorId, datasetId, email, requestedPermissions) {
        const adminPermit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);

        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) {
            throw new ServiceError('Introduce un email de usuario válido.', {
                status: 400,
                code: 'invalid_user_email'
            });
        }

        const user = await deps.usersRepository.findByExactEmail(normalizedEmail);
        if (!user) {
            throw new ServiceError('No existe ningún usuario con ese email.', {
                status: 404,
                code: 'user_not_found'
            });
        }

        const permissions = requestedPermissions === undefined || requestedPermissions === null
            ? { isAnnotator: true, isReviewer: false, isAdmin: false }
            : normalizePermissionInput(requestedPermissions);

        if (!adminPermit?.dataset?.isReviewEnabled)
            permissions.isReviewer = false;

        if (!hasAnyDatasetRole(permissions)) {
            throw new ServiceError('Se requiere al menos un rol activo.', {
                status: 400,
                code: 'no_role_selected'
            });
        }

        const row = await deps.datasetsPermissionsRepository.upsertDatasetPermission({
            datasetId,
            userId: user.id,
            ...permissions
        });

        return mapPermitRowToPermissionDTO(row);
    }

    /**
     * Updates a user's permissions on a dataset.
     * @param {number} actorId - Current user.
     * @param {number} datasetId - Dataset.
     * @param {number} userId - Target user.
     * @param {*} permissions - Requested permissions.
     * @returns {Promise<*>} Result.
     */
    async function updateDatasetPermission(actorId, datasetId, userId, permissions) {
        const adminPermit = await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);

        const normalizedPermissions = normalizePermissionInput(permissions);
        if (!adminPermit?.dataset?.isReviewEnabled)
            normalizedPermissions.isReviewer = false;

        if (!hasAnyDatasetRole(normalizedPermissions)) {
            await deps.datasetsPermissionsRepository.deleteDatasetPermission({ datasetId, userId });
            return {
                removed: true,
                userId
            };
        }

        const row = await deps.datasetsPermissionsRepository.upsertDatasetPermission({
            datasetId,
            userId,
            ...normalizedPermissions
        });

        return {
            removed: false,
            user: mapPermitRowToPermissionDTO(row)
        };
    }

    return {
        listDatasetPermissions,
        addDatasetPermissionByEmail,
        updateDatasetPermission
    };
}

/**
 * Loads the actor's `Permit` over the dataset and verifies that it has
 * administration privileges. Throws `ServiceError(404 dataset_not_found)` if
 * the permit does not exist, and `ServiceError(403 dataset_admin_required)` if
 * it exists but is not admin/owner. Exported so that
 * `datasets-service.deleteDataset` can consume it without instantiating the
 * service.
 *
 * @param {*} datasetsRepository - Repository that exposes `findPermitForUser`.
 * @param {number} actorId - Current user.
 * @param {number} datasetId - Dataset.
 * @returns {Promise<*>} The actor's permit (includes `dataset`).
 */
async function assertDatasetAdminPermission(datasetsRepository, actorId, datasetId) {
    const permit = await datasetsRepository.findPermitForUser({ datasetId, userId: actorId });
    if (!permit) {
        throw new ServiceError('Dataset no encontrado.', {
            status: 404,
            code: 'dataset_not_found'
        });
    }

    if (!hasDatasetAdminPermission(permit)) {
        throw new ServiceError('No tienes permisos de administración sobre este dataset.', {
            status: 403,
            code: 'dataset_admin_required'
        });
    }

    return permit;
}

/**
 * Pure predicate: indicates whether a row allows administering the dataset.
 * @param {*} permit - Permission row.
 * @returns {boolean} True if it can administer (admin or owner).
 */
function hasDatasetAdminPermission(permit) {
    return Boolean(permit && (permit.isAdmin || permit.isOwned));
}

/**
 * Maps a Permit row to the permissions DTO exposed to the client.
 * @param {*} row - Permission row.
 * @returns {*} DTO.
 */
function mapPermitRowToPermissionDTO(row) {
    const user = row && row.user ? row.user : {};

    return {
        userId: Number(row?.userId ?? user.id ?? 0),
        email: user.email || '',
        globalIsModerator: Boolean(user?.isModerator),
        permissions: {
            annotator: Boolean(row?.isAnnotator),
            reviewer: Boolean(row?.isReviewer),
            admin: Boolean(row?.isAdmin || row?.isOwned),
            owner: Boolean(row?.isOwned)
        }
    };
}

/**
 * Normalizes received permissions.
 * @param {*} permissions - Payload.
 * @returns {*} Permissions.
 */
function normalizePermissionInput(permissions) {
    const source = permissions && typeof permissions === 'object' ? permissions : {};

    return {
        isAnnotator: Boolean(source.isAnnotator ?? source.annotator),
        isReviewer: Boolean(source.isReviewer ?? source.reviewer),
        isAdmin: Boolean(source.isAdmin ?? source.admin)
    };
}

/**
 * Checks whether there is any active dataset role in a normalized payload.
 * @param {*} permissions - Normalized permissions.
 * @returns {boolean} True if any is active.
 */
function hasAnyDatasetRole(permissions) {
    return Boolean(permissions?.isAnnotator || permissions?.isReviewer || permissions?.isAdmin);
}

module.exports = {
    createDatasetsPermissionsService,
    assertDatasetAdminPermission
};
