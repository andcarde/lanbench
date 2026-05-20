'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsService } = require('../../../services/datasets-service');
const { createDatasetsPermissionsService } = require('../../../services/datasets-permissions-service');
const {
    extractDatasetIdFromPath,
    normalisePermissionUser,
    buildPermissionsUpdatePayload
} = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

describe('dataset permissions administration', () => {
    it('marca boton de revision cuando el usuario es reviewer y el dataset no esta completo', async () => {
        const service = createDatasetsService({
            datasetsRepository: {
                async findAccessibleMany() {
                    return [{
                        id: 4,
                        name: 'Dataset 4',
                        totalEntries: 20,
                        languages: '["Spanish"]',
                        sectionsCompleted: 1,
                        sectionsInReview: 1,
                        sectionsPending: 1,
                        permits: [{
                            isAnnotator: false,
                            isReviewer: true,
                            isAdmin: false,
                            isOwned: false
                        }]
                    }];
                },
                async findReviewableEntryDatasetIds() {
                    return [{ datasetId: 4 }, { datasetId: 4 }];
                },
                async findActiveReviewDatasetIdsForReviewer() {
                    return [];
                }
            },
            usersRepository: {}
        });

        const payload = await service.listAccessibleDatasetItems(9);

        assert.deepEqual(payload[0].review, {
            canReview: true,
            showReviewButton: true,
            reviewAvailable: true,
            reviewableCount: 2
        });
    });

    it('activa el boton si el usuario ya tiene una review activa del dataset', async () => {
        const service = createDatasetsService({
            datasetsRepository: {
                async findAccessibleMany() {
                    return [{
                        id: 5,
                        name: 'Dataset 5',
                        totalEntries: 20,
                        languages: '["Spanish"]',
                        sectionsCompleted: 0,
                        sectionsInReview: 1,
                        sectionsPending: 1,
                        permits: [{
                            isAnnotator: false,
                            isReviewer: true,
                            isAdmin: false,
                            isOwned: false
                        }]
                    }];
                },
                async findReviewableEntryDatasetIds() {
                    return [];
                },
                async findActiveReviewDatasetIdsForReviewer() {
                    return [{ entry: { datasetId: 5 } }];
                }
            },
            usersRepository: {}
        });

        const payload = await service.listAccessibleDatasetItems(9);

        assert.equal(payload[0].review.showReviewButton, true);
        assert.equal(payload[0].review.reviewAvailable, true);
        assert.equal(payload[0].review.reviewableCount, 1);
    });

    it('lista permisos cuando el usuario actual es admin del dataset', async () => {
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        datasetId: 7,
                        userId: 1,
                        isOwned: false,
                        isAdmin: true,
                        dataset: { id: 7, name: 'Dataset 7' }
                    };
                },
                async findPermissionRowsByDataset() {
                    return [{
                        datasetId: 7,
                        userId: 2,
                        isAnnotator: true,
                        isReviewer: false,
                        isAdmin: true,
                        isOwned: false,
                        user: { id: 2, email: 'ana@example.com', isModerator: false }
                    }];
                }
            },
            usersRepository: {}
        });

        const payload = await service.listDatasetPermissions(1, 7);

        assert.deepEqual(payload, {
            dataset: { datasetId: 7, name: 'Dataset 7' },
            options: {
                llmMode: 'none',
                isReviewEnabled: false,
                hasAdditionalReviews: false
            },
            users: [{
                userId: 2,
                email: 'ana@example.com',
                globalIsModerator: false,
                permissions: {
                    annotator: true,
                    reviewer: false,
                    admin: true,
                    owner: false
                }
            }]
        });
    });

    it('rechaza la administracion si el usuario no tiene permiso admin en el dataset', async () => {
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        datasetId: 7,
                        userId: 1,
                        isOwned: false,
                        isAdmin: false,
                        dataset: { id: 7, name: 'Dataset 7' }
                    };
                }
            },
            usersRepository: {}
        });

        await assert.rejects(
            () => service.listDatasetPermissions(1, 7),
            (/** @type {any} */ error) => error.status === 403 && error.code === 'dataset_admin_required'
        );
    });

    it('anade por email exacto con permiso annotator por defecto', async () => {
        /** @type {any[]} */
        const captured = [];
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isOwned: true,
                        dataset: { id: 7, name: 'Dataset 7' }
                    };
                },
                async upsertDatasetPermission(/** @type {*} */ payload) {
                    captured.push(payload);
                    return {
                        ...payload,
                        isOwned: false,
                        user: { id: payload.userId, email: 'bea@example.com', isModerator: false }
                    };
                }
            },
            usersRepository: {
                async findByExactEmail(/** @type {*} */ email) {
                    assert.equal(email, 'bea@example.com');
                    return email === 'bea@example.com'
                        ? { id: 5, email, isModerator: false }
                        : null;
                }
            }
        });

        const result = await service.addDatasetPermissionByEmail(1, 7, ' Bea@Example.COM ');

        assert.deepEqual(captured, [{
            datasetId: 7,
            userId: 5,
            isAnnotator: true,
            isReviewer: false,
            isAdmin: false
        }]);
        assert.equal(result.email, 'bea@example.com');
        assert.equal(result.permissions.annotator, true);
    });

    it('anade respetando los permisos solicitados en el payload', async () => {
        /** @type {any[]} */
        const captured = [];
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isOwned: true,
                        dataset: { id: 7, name: 'Dataset 7', isReviewEnabled: true }
                    };
                },
                async upsertDatasetPermission(/** @type {*} */ payload) {
                    captured.push(payload);
                    return {
                        ...payload,
                        isOwned: false,
                        user: { id: payload.userId, email: 'rev@example.com', isModerator: false }
                    };
                }
            },
            usersRepository: {
                async findByExactEmail() {
                    return { id: 6, email: 'rev@example.com', isModerator: false };
                }
            }
        });

        const result = await service.addDatasetPermissionByEmail(1, 7, 'rev@example.com', {
            annotator: false,
            reviewer: true,
            admin: true
        });

        assert.deepEqual(captured, [{
            datasetId: 7,
            userId: 6,
            isAnnotator: false,
            isReviewer: true,
            isAdmin: true
        }]);
        assert.equal(result.permissions.reviewer, true);
        assert.equal(result.permissions.admin, true);
    });

    it('descarta el permiso reviewer al anadir si el dataset no tiene revision', async () => {
        /** @type {any[]} */
        const captured = [];
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isOwned: true,
                        dataset: { id: 7, name: 'Dataset 7', isReviewEnabled: false }
                    };
                },
                async upsertDatasetPermission(/** @type {*} */ payload) {
                    captured.push(payload);
                    return {
                        ...payload,
                        isOwned: false,
                        user: { id: payload.userId, email: 'rev@example.com', isModerator: false }
                    };
                }
            },
            usersRepository: {
                async findByExactEmail() {
                    return { id: 6, email: 'rev@example.com', isModerator: false };
                }
            }
        });

        const result = await service.addDatasetPermissionByEmail(1, 7, 'rev@example.com', {
            annotator: true,
            reviewer: true,
            admin: false
        });

        assert.deepEqual(captured, [{
            datasetId: 7,
            userId: 6,
            isAnnotator: true,
            isReviewer: false,
            isAdmin: false
        }]);
        assert.equal(result.permissions.reviewer, false);
    });

    it('rechaza con no_role_selected si solo se pide reviewer en dataset sin revision', async () => {
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isOwned: true,
                        dataset: { id: 7, name: 'Dataset 7', isReviewEnabled: false }
                    };
                },
                async upsertDatasetPermission() {
                    throw new Error('upsertDatasetPermission should not be called');
                }
            },
            usersRepository: {
                async findByExactEmail() {
                    return { id: 6, email: 'rev@example.com', isModerator: false };
                }
            }
        });

        await assert.rejects(
            () => service.addDatasetPermissionByEmail(1, 7, 'rev@example.com', {
                annotator: false,
                reviewer: true,
                admin: false
            }),
            (/** @type {any} */ error) => error.status === 400 && error.code === 'no_role_selected'
        );
    });

    it('rechaza el alta si los permisos solicitados son todos falsos', async () => {
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return { isOwned: true, dataset: { id: 7, name: 'Dataset 7' } };
                },
                async upsertDatasetPermission() {
                    throw new Error('upsertDatasetPermission should not be called');
                }
            },
            usersRepository: {
                async findByExactEmail() {
                    return { id: 6, email: 'rev@example.com', isModerator: false };
                }
            }
        });

        await assert.rejects(
            () => service.addDatasetPermissionByEmail(1, 7, 'rev@example.com', {
                annotator: false,
                reviewer: false,
                admin: false
            }),
            (/** @type {any} */ error) => error.status === 400 && error.code === 'no_role_selected'
        );
    });

    it('descarta el permiso reviewer al actualizar si el dataset no tiene revision', async () => {
        /** @type {any[]} */
        const captured = [];
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isAdmin: true,
                        dataset: { id: 7, name: 'Dataset 7', isReviewEnabled: false }
                    };
                },
                async upsertDatasetPermission(/** @type {*} */ payload) {
                    captured.push(payload);
                    return {
                        ...payload,
                        isOwned: false,
                        user: { id: payload.userId, email: 'u@example.com', isModerator: false }
                    };
                }
            },
            usersRepository: {}
        });

        const result = await service.updateDatasetPermission(1, 7, 9, {
            annotator: true,
            reviewer: true,
            admin: false
        });

        assert.deepEqual(captured, [{
            datasetId: 7,
            userId: 9,
            isAnnotator: true,
            isReviewer: false,
            isAdmin: false
        }]);
        assert.equal(result.removed, false);
        assert.equal(result.user.permissions.reviewer, false);
    });

    it('borra la fila cuando se desmarcan los tres permisos', async () => {
        /** @type {any[]} */
        const deleted = [];
        const service = createDatasetsPermissionsService({
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return {
                        isAdmin: true,
                        dataset: { id: 7, name: 'Dataset 7' }
                    };
                },
                async deleteDatasetPermission(/** @type {*} */ payload) {
                    deleted.push(payload);
                    return { count: 1 };
                }
            },
            usersRepository: {}
        });

        const result = await service.updateDatasetPermission(1, 7, 9, {
            annotator: false,
            reviewer: false,
            admin: false
        });

        assert.deepEqual(deleted, [{ datasetId: 7, userId: 9 }]);
        assert.deepEqual(result, { removed: true, userId: 9 });
    });

    it('normaliza helpers del frontend', () => {
        assert.equal(extractDatasetIdFromPath('/datasets/42/admin'), 42);
        assert.deepEqual(
            normalisePermissionUser({
                userId: 3,
                email: 'c@example.com',
                permissions: { annotator: true, reviewer: true }
            }),
            {
                userId: 3,
                email: 'c@example.com',
                permissions: {
                    annotator: true,
                    reviewer: true,
                    admin: false
                }
            }
        );
        assert.deepEqual(buildPermissionsUpdatePayload({ admin: true }), {
            permissions: {
                annotator: false,
                reviewer: false,
                admin: true
            }
        });
    });
});
