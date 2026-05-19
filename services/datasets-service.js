'use strict';

/**
 * @file Datasets service — orquestacion de alto nivel sobre datasets.
 *
 * Cubre: alta (parse XML + persistencia transaccional via repo), listado con
 * permisos del usuario, lectura de seccion para anotacion, exportacion XML,
 * gestion de permisos por dataset y baja recursiva.
 *
 * Inyecta utilidades de parsing/serializacion XML para que los tests
 * puedan reemplazarlas sin tocar disco.
 *
 * @typedef {import('../types/typedefs').DatasetListDTO}    DatasetListDTO
 * @typedef {import('../types/typedefs').DatasetSectionDTO} DatasetSectionDTO
 *
 * @typedef {Object} DatasetsServiceDeps
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [usersRepository]
 * @property {(filePath:string)=>any} [readDataset]
 * @property {(input:any, filename?:any)=>any} [parseDatasetImport]
 * @property {(dataset:any)=>string} [buildDatasetXml]
 * @property {(filePath:string)=>Buffer} [readFileAsBuffer]
 */

const { readFileSync } = require('node:fs');
const {
    readDataset: defaultReadDataset,
    parseDatasetImport: defaultParseDatasetImport
} = require('../utils/xml-reader');
const { buildDatasetXml: defaultBuildDatasetXml } = require('../utils/dataset-xml');
const { DATASET_COLORS, SECTION_SIZE, DEFAULT_LANGUAGES } = require('../constants/datasets');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createUsersRepository } = require('../repositories/users-repository');
const { ServiceError } = require('./service-error');
const { TERMINAL_REVIEW_STATUSES } = require('../constants/review-status');
const { resolveExistingTempFilePath } = require('../utils/temp-storage');
const { calculatePercentagesFromSectionCounters } = require('../utils/dataset-progress');
const {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO
} = require('../contracts/dto-mappers');

/**
 * Construye el servicio de datasets.
 *
 * @param {DatasetsServiceDeps} [dependencies]
 */
function createDatasetsService({
    datasetsRepository,
    readDataset,
    parseDatasetImport,
    buildDatasetXml,
    readFileAsBuffer,
    usersRepository
} = {}) {
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        usersRepository: usersRepository || createUsersRepository(),
        readDataset: readDataset || defaultReadDataset,
        parseDatasetImport: parseDatasetImport || defaultParseDatasetImport,
        buildDatasetXml: buildDatasetXml || defaultBuildDatasetXml,
        readFileAsBuffer: readFileAsBuffer || defaultReadFileAsBuffer
    };

    /**
     * Lista los datasets accesibles para el usuario y enriquece cada fila con conteos.
     * @param {*} userId - Identificador del usuario.
     * @returns {Promise<Array<*>>} Datasets accesibles enriquecidos.
     */
    async function listAccessibleDatasets(userId) {
        const datasetRows = await deps.datasetsRepository.findAccessibleMany(userId);
        const reviewableCounts = await getReviewableCountsForDatasets(userId, datasetRows);
        const annotatedEntryCounts = await getAnnotatedEntryCountsForDatasets(datasetRows);
        return datasetRows.map((/** @type {*} */ row) => mapDatasetRecordToSource(row, {
            reviewableCount: reviewableCounts.get(row.id) || 0,
            annotatedEntries: annotatedEntryCounts.has(row.id)
                ? annotatedEntryCounts.get(row.id)
                : null
        }));
    }

    /**
     * Obtiene numero de entries anotadas por dataset.
     * @param {Array<*>} datasetRows - Datasets accesibles.
     * @returns {Promise<Map<number, number>>} Conteos por dataset.
     */
    async function getAnnotatedEntryCountsForDatasets(datasetRows) {
        if (typeof deps.datasetsRepository.countAnnotatedEntriesByDataset !== 'function')
            return new Map();

        const datasetIds = (datasetRows || [])
            .map(row => Number(row?.id))
            .filter(datasetId => Number.isInteger(datasetId) && datasetId > 0);

        if (!datasetIds.length)
            return new Map();

        const rows = await deps.datasetsRepository.countAnnotatedEntriesByDataset({ datasetIds });
        const counts = new Map();

        for (const datasetId of datasetIds)
            counts.set(datasetId, 0);

        for (const row of rows || []) {
            const datasetId = Number(row?.datasetId);
            const count = Number(row?.count);
            if (!Number.isInteger(datasetId) || datasetId <= 0)
                continue;
            counts.set(datasetId, Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
        }

        return counts;
    }

    /**
     * Obtiene numero de entries pendientes de revision para los datasets listados.
     * @param {number} userId - Usuario actual.
     * @param {Array<*>} datasetRows - Datasets accesibles.
     * @returns {Promise<Map<number, number>>} Conteos por dataset.
     */
    async function getReviewableCountsForDatasets(userId, datasetRows) {
        if (typeof deps.datasetsRepository.findReviewableEntryDatasetIds !== 'function')
            return new Map();

        const datasetIds = (datasetRows || [])
            .map(row => Number(row?.id))
            .filter(datasetId => Number.isInteger(datasetId) && datasetId > 0);

        if (!datasetIds.length)
            return new Map();

        const rows = await deps.datasetsRepository.findReviewableEntryDatasetIds({ userId, datasetIds });
        const counts = new Map();

        for (const row of rows || []) {
            const datasetId = Number(row?.datasetId);
            if (!Number.isInteger(datasetId) || datasetId <= 0)
                continue;
            counts.set(datasetId, (counts.get(datasetId) || 0) + 1);
        }

        if (typeof deps.datasetsRepository.findActiveReviewDatasetIdsForReviewer === 'function') {
            const activeReviews = await deps.datasetsRepository.findActiveReviewDatasetIdsForReviewer({ userId, datasetIds });
            for (const row of activeReviews || []) {
                const datasetId = Number(row?.entry?.datasetId ?? row?.datasetId);
                if (!Number.isInteger(datasetId) || datasetId <= 0)
                    continue;
                counts.set(datasetId, (counts.get(datasetId) || 0) + 1);
            }
        }

        return counts;
    }

    /**
     * Lista los datasets accesibles ya mapeados a DTO listo para el cliente.
     * @param {*} userId - Identificador del usuario.
     * @returns {Promise<Array<*>>} Lista de DTOs.
     */
    async function listAccessibleDatasetItems(userId) {
        const datasets = await listAccessibleDatasets(userId);
        return mapDatasetListDTOs(datasets);
    }

    /**
     * Recupera un dataset accesible por el usuario y lo enriquece con metadatos de progreso.
     * @param {*} userId - Identificador del usuario.
     * @param {*} datasetId - Identificador del dataset.
     * @returns {Promise<*>} DTO del dataset.
     */
    async function getAccessibleDatasetItem(userId, datasetId) {
        const datasetRow = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!datasetRow)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        const annotatedEntryCounts = await getAnnotatedEntryCountsForDatasets([datasetRow]);
        return mapDatasetListDTO(
            mapDatasetRecordToSource(datasetRow, {
                annotatedEntries: annotatedEntryCounts.has(datasetRow.id)
                    ? annotatedEntryCounts.get(datasetRow.id)
                    : null
            }),
            datasetId
        );
    }

    /**
     * Devuelve la seccion de un dataset solicitada por el usuario.
     * @param {*} userId - Identificador del usuario.
     * @param {*} datasetId - Identificador del dataset.
     * @param {*} sectionNumber - Numero de seccion (1-indexed).
     * @returns {Promise<*>} DTO con dataset, seccion y entries.
     */
    async function getAccessibleDatasetSection(userId, datasetId, sectionNumber) {
        const datasetRow = await getAccessibleDatasetGraph(userId, datasetId);
        const annotationEntries = getAnnotationEntries(datasetRow);

        if (!annotationEntries.length) {
            throw new ServiceError('El dataset no contiene entries.', {
                status: 404,
                code: 'dataset_without_entries'
            });
        }

        const totalSections = Math.ceil(annotationEntries.length / SECTION_SIZE);
        if (sectionNumber > totalSections) {
            throw new ServiceError('La sección solicitada no existe.', {
                status: 404,
                code: 'dataset_section_not_found'
            });
        }

        const startIndex = (sectionNumber - 1) * SECTION_SIZE;
        const sectionEntries = annotationEntries.slice(startIndex, startIndex + SECTION_SIZE);

        return mapDatasetSectionDTO({
            dataset: {
                id: datasetRow.id,
                name: datasetRow.name,
                totalEntries: annotationEntries.length,
                totalSections
            },
            section: {
                number: sectionNumber,
                size: SECTION_SIZE,
                totalEntries: sectionEntries.length,
                startEntry: startIndex + 1,
                endEntry: startIndex + sectionEntries.length,
                isLastSection: sectionNumber === totalSections
            },
            entries: sectionEntries
        });
    }

    /**
     * Reconstruye el XML del dataset a partir de las entries persistidas.
     * @param {*} userId - Identificador del usuario.
     * @param {*} datasetId - Identificador del dataset.
     * @returns {Promise<string>} Texto XML del dataset.
     */
    async function getAccessibleDatasetText(userId, datasetId) {
        const datasetRow = await getAccessibleDatasetGraph(userId, datasetId);

        if (!hasPersistedEntries(datasetRow)) {
            throw new ServiceError('El dataset no contiene entries.', {
                status: 404,
                code: 'dataset_without_entries'
            });
        }

        return deps.buildDatasetXml(datasetRow.entries.map(mapPersistedEntryToXmlEntry));
    }

    /**
     * Crea un dataset propiedad del usuario a partir de un fichero XML subido.
     * @param {*} userId - Identificador del usuario propietario.
     * @param {*} file - Fichero subido (multer): { filename, originalname }.
     * @param {*} [options] - Opciones de creacion del dataset.
     * @returns {Promise<*>} DTO del dataset creado.
     */
    async function createDataset(userId, file, options = {}) {
        /** @type {any} */
        let datasetImport;
        /** @type {any} */
        let datasetDto;
        /** @type {any} */
        let contentBuffer;
        const datasetOptions = normalizeDatasetCreationOptions(options);

        try {
            datasetDto = deps.readDataset(file.filename);
            contentBuffer = deps.readFileAsBuffer(file.filename);
            datasetImport = deps.parseDatasetImport(contentBuffer, file.originalname || file.filename);
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            const serviceError = new ServiceError('El fichero XML no es válido o no contiene entries.', {
                status: 400,
                code: 'invalid_dataset_xml'
            });
            serviceError.cause = error;
            throw serviceError;
        }

        const name = nameFromFilename(file.originalname);
        const totalEntries = datasetDto.entries.length;
        const totalSections = Math.ceil(totalEntries / SECTION_SIZE);

        const datasetRow = await deps.datasetsRepository.createOwnedDataset({
            userId,
            datasetData: {
                name,
                totalEntries,
                languages: JSON.stringify(DEFAULT_LANGUAGES),
                llmMode: datasetOptions.llmMode,
                isReviewEnabled: datasetOptions.isReviewEnabled,
                hasAdditionalReviews: datasetOptions.hasAdditionalReviews,
                sectionsCompleted: 0,
                sectionsInReview: 0,
                sectionsPending: totalSections
            },
            entryRecords: datasetImport.entries,
            /**
             * Resuelve la clase CSS de color para un dataset segun su id.
             * @param {*} datasetId - Identificador del dataset persistido.
             * @returns {string} Clase CSS de color.
             */
            resolveColorClass(datasetId) {
                if (!Number.isInteger(datasetId) || datasetId <= 0)
                    throw new Error('La base de datos no devolvió un id de dataset válido.');

                return DATASET_COLORS[(datasetId - 1) % DATASET_COLORS.length];
            }
        });

        const dataset = mapDatasetRecordToSource(datasetRow);
        return {
            ok: true,
            datasetId: dataset.id,
            dataset: mapDatasetListDTO(dataset, dataset.id)
        };
    }

    /**
     * Lista permisos de usuarios de un dataset administrable por el actor.
     * @param {number} actorId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Permisos.
     */
    async function listDatasetPermissions(actorId, datasetId) {
        const adminPermit = await requireDatasetAdminPermission(actorId, datasetId);
        const rows = await deps.datasetsRepository.findPermissionRowsByDataset({ datasetId });

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
     * Anade un usuario a los permisos del dataset.
     * @param {number} actorId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @param {string} email - Email exacto del usuario a anadir.
     * @param {*} [requestedPermissions] - Permisos solicitados; por defecto annotator.
     * @returns {Promise<*>} Fila de permiso.
     */
    async function addDatasetPermissionByEmail(actorId, datasetId, email, requestedPermissions) {
        const adminPermit = await requireDatasetAdminPermission(actorId, datasetId);

        const normalizedEmail = normalizeUserEmail(email);
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

        if (!Boolean(adminPermit?.dataset?.isReviewEnabled))
            permissions.isReviewer = false;

        if (!hasAnyDatasetRole(permissions)) {
            throw new ServiceError('Se requiere al menos un rol activo.', {
                status: 400,
                code: 'no_role_selected'
            });
        }

        const row = await deps.datasetsRepository.upsertDatasetPermission({
            datasetId,
            userId: user.id,
            ...permissions
        });

        return mapPermitRowToPermissionDTO(row);
    }

    /**
     * Actualiza permisos de un usuario sobre un dataset.
     * @param {number} actorId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @param {number} userId - Usuario objetivo.
     * @param {*} permissions - Permisos solicitados.
     * @returns {Promise<*>} Resultado.
     */
    async function updateDatasetPermission(actorId, datasetId, userId, permissions) {
        const adminPermit = await requireDatasetAdminPermission(actorId, datasetId);

        const normalizedPermissions = normalizePermissionInput(permissions);
        if (!Boolean(adminPermit?.dataset?.isReviewEnabled))
            normalizedPermissions.isReviewer = false;

        if (!hasAnyDatasetRole(normalizedPermissions)) {
            await deps.datasetsRepository.deleteDatasetPermission({ datasetId, userId });
            return {
                removed: true,
                userId
            };
        }

        const row = await deps.datasetsRepository.upsertDatasetPermission({
            datasetId,
            userId,
            ...normalizedPermissions
        });

        return {
            removed: false,
            user: mapPermitRowToPermissionDTO(row)
        };
    }

    /**
     * Borra por completo un dataset administrable por el actor.
     * @param {number} actorId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Resultado de borrado.
     */
    async function deleteDataset(actorId, datasetId) {
        await requireDatasetAdminPermission(actorId, datasetId);
        await deps.datasetsRepository.deleteDatasetRecursively({ datasetId });

        return {
            ok: true,
            datasetId
        };
    }

    // (deleteDataset)

    /**
     * Calcula estadisticas de anotacion y revision para un dataset accesible.
     * @param {number} userId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Estadisticas.
     */
    async function getDatasetStatistics(userId, datasetId) {
        await getAccessibleDatasetItem(userId, datasetId);

        const dataset = await deps.datasetsRepository.findDatasetStatisticsGraph({ datasetId });
        if (!dataset)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        return buildDatasetStatisticsDTO(dataset);
    }

    /**
     * Recupera el grafo completo del dataset si es accesible para el usuario.
     * @param {*} userId - Identificador del usuario.
     * @param {*} datasetId - Identificador del dataset.
     * @returns {Promise<*>} Dataset con sus entries y relaciones.
     */
    async function getAccessibleDatasetGraph(userId, datasetId) {
        const datasetRow = typeof deps.datasetsRepository.findAccessibleDatasetGraphById === 'function'
            ? await deps.datasetsRepository.findAccessibleDatasetGraphById({ userId, datasetId })
            : await deps.datasetsRepository.findAccessibleById({ userId, datasetId });

        if (!datasetRow)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        return datasetRow;
    }

    /**
     * Exige permiso admin sobre el dataset.
     * @param {number} actorId - Usuario actual.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Permiso del usuario actual.
     */
    async function requireDatasetAdminPermission(actorId, datasetId) {
        return requireDatasetAdminPermissionFactory(deps, actorId, datasetId);
    }

    /**
     * Obtiene annotation entries desde las entries persistidas del dataset.
     * @param {*} datasetRow - Fila de dataset con entries persistidas.
     * @returns {Array<*>} Annotation entries listas para el cliente.
     */
    function getAnnotationEntries(datasetRow) {
        if (!hasPersistedEntries(datasetRow))
            return [];

        return datasetRow.entries.map(mapPersistedEntryToAnnotationEntry);
    }

    return {
        listAccessibleDatasets,
        listAccessibleDatasetItems,
        getAccessibleDatasetItem,
        getAccessibleDatasetSection,
        getAccessibleDatasetText,
        createDataset,
        listDatasetPermissions,
        addDatasetPermissionByEmail,
        updateDatasetPermission,
        deleteDataset,
        getDatasetStatistics
    };
}

/**
 * Exige permiso admin sobre el dataset.
 * @param {number} actorId - Usuario actual.
 * @param {number} datasetId - Dataset.
 * @returns {Promise<*>} Permiso del usuario actual.
 */
async function requireDatasetAdminPermissionFactory(/** @type {*} */ deps, actorId, datasetId) {
    const permit = await deps.datasetsRepository.findPermitForUser({ datasetId, userId: actorId });
    if (!permit) {
        throw new ServiceError('Dataset no encontrado o no accesible.', {
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
 * Indica si el dataset tiene al menos una entry persistida.
 * @param {*} datasetRow - Fila de dataset cargada con sus entries.
 * @returns {boolean} True si hay entries.
 */
function hasPersistedEntries(datasetRow) {
    return Array.isArray(datasetRow && datasetRow.entries)
        && datasetRow.entries.length > 0;
}

/**
 * Mapea una fila de Permit al DTO de permisos.
 * @param {*} row - Fila de permiso.
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
 * Construye DTO de estadisticas de dataset.
 * @param {*} dataset - Dataset con relaciones minimas.
 * @returns {*} Estadisticas.
 */
function buildDatasetStatisticsDTO(dataset) {
    const totalEntries = normalizePositiveCount(dataset?.totalEntries);
    const annotationRowsByUser = new Map();
    const reviewRowsByUser = new Map();
    const annotationTimeByUser = sumAssignmentTimeByUser(dataset?.sectionAssignments);

    for (const entry of dataset?.entries || []) {
        collectAnnotationEntryStats(annotationRowsByUser, entry);
        collectReviewEntryStats(reviewRowsByUser, entry);
    }

    return {
        dataset: {
            datasetId: Number(dataset?.id || 0),
            name: dataset?.name || '',
            totalEntries
        },
        annotation: buildStatsRows(annotationRowsByUser, totalEntries, annotationTimeByUser),
        review: buildStatsRows(reviewRowsByUser, totalEntries)
    };
}

/**
 * Acumula estadisticas de anotacion por entry.
 * @param {Map<*, *>} rowsByUser - Acumulador.
 * @param {*} entry - Entry.
 */
function collectAnnotationEntryStats(rowsByUser, entry) {
    const byUserForEntry = new Map();

    for (const annotation of entry?.annotations || []) {
        const userId = Number(annotation.userId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        const current = byUserForEntry.get(userId) || {
            userId,
            email: annotation.user?.email || '',
            isAcceptedFirstTry: true
        };
        current.isAcceptedFirstTry = current.isAcceptedFirstTry && annotation.isAcceptedFirstTry !== false;
        if (!current.email && annotation.user?.email)
            current.email = annotation.user.email;
        byUserForEntry.set(userId, current);
    }

    for (const item of byUserForEntry.values())
        incrementStatsRow(rowsByUser, item);
}

/**
 * Acumula estadisticas de revision por entry.
 * @param {Map<*, *>} rowsByUser - Acumulador.
 * @param {*} entry - Entry.
 */
function collectReviewEntryStats(rowsByUser, entry) {
    for (const review of entry?.reviews || []) {
        if (!TERMINAL_REVIEW_STATUSES.includes(review.status))
            continue;

        const userId = Number(review.reviewerId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        const comments = Array.isArray(review.comments) ? review.comments : [];
        incrementStatsRow(rowsByUser, {
            userId,
            email: review.reviewer?.email || '',
            isAcceptedFirstTry: comments.every((/** @type {*} */ comment) => comment.isAcceptedFirstTry !== false),
            timeSpentSeconds: normalizeNonNegativeInteger(review.timeSpentSeconds)
        });
    }
}

/**
 * Incrementa una fila de estadisticas.
 * @param {Map<*, *>} rowsByUser - Acumulador.
 * @param {*} item - Item.
 */
function incrementStatsRow(rowsByUser, item) {
    const row = rowsByUser.get(item.userId) || {
        userId: item.userId,
        email: item.email || '',
        totalEntries: 0,
        acceptedFirstTryEntries: 0,
        timeSpentSeconds: 0
    };

    row.totalEntries += 1;
    if (item.isAcceptedFirstTry)
        row.acceptedFirstTryEntries += 1;
    row.timeSpentSeconds += normalizeNonNegativeInteger(item.timeSpentSeconds);
    if (!row.email && item.email)
        row.email = item.email;

    rowsByUser.set(item.userId, row);
}

/**
 * Suma tiempos de asignaciones por usuario.
 * @param {Array<*>} assignments - Asignaciones.
 * @returns {Map<number, number>} Tiempo por usuario.
 */
function sumAssignmentTimeByUser(assignments) {
    const result = new Map();

    for (const assignment of assignments || []) {
        const userId = Number(assignment.userId);
        if (!Number.isInteger(userId) || userId <= 0)
            continue;

        result.set(
            userId,
            (result.get(userId) || 0) + normalizeNonNegativeInteger(assignment.timeSpentSeconds)
        );
    }

    return result;
}

/**
 * Construye filas finales ordenadas.
 * @param {Map<*, *>} rowsByUser - Acumulador.
 * @param {number} totalDatasetEntries - Total de entries.
 * @param {Map<*, *>|null} [timeByUser] - Tiempo por usuario opcional.
 * @returns {Array<*>} Filas.
 */
function buildStatsRows(rowsByUser, totalDatasetEntries, timeByUser = null) {
    return [...rowsByUser.values()]
        .map(row => {
            const totalTime = timeByUser instanceof Map
                ? (timeByUser.get(row.userId) || 0)
                : row.timeSpentSeconds;

            return {
                userId: row.userId,
                email: row.email,
                totalEntries: row.totalEntries,
                datasetPercent: formatFloorPercent(row.totalEntries, totalDatasetEntries),
                averageTime: formatAverageTime(totalTime, row.totalEntries),
                precision: formatFloorPercent(row.acceptedFirstTryEntries, row.totalEntries)
            };
        })
        .sort((a, b) => (
            b.totalEntries - a.totalEntries
            || a.email.localeCompare(b.email)
        ));
}

/**
 * Formatea porcentaje con dos decimales aproximando hacia abajo.
 * @param {number} numerator - Numerador.
 * @param {number} denominator - Denominador.
 * @returns {string} Porcentaje.
 */
function formatFloorPercent(numerator, denominator) {
    const safeNumerator = normalizeNonNegativeInteger(numerator);
    const safeDenominator = normalizePositiveCount(denominator);

    if (safeDenominator <= 0)
        return '0.00%';

    const cents = Math.floor((safeNumerator * 10000) / safeDenominator);
    return `${(cents / 100).toFixed(2)}%`;
}

/**
 * Formatea tiempo medio por entry.
 * @param {number} totalSeconds - Segundos totales.
 * @param {number} totalEntries - Entries.
 * @returns {string} Tiempo legible.
 */
function formatAverageTime(totalSeconds, totalEntries) {
    const seconds = normalizeNonNegativeInteger(totalSeconds);
    const entries = normalizePositiveCount(totalEntries);

    if (seconds <= 0 || entries <= 0)
        return '-';

    const average = Math.floor(seconds / entries);
    const minutes = Math.floor(average / 60);
    const remainingSeconds = average % 60;

    if (minutes <= 0)
        return `${remainingSeconds}s`;

    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

/**
 * Normaliza entero no negativo.
 * @param {*} value - Valor.
 * @returns {number} Entero.
 */
function normalizeNonNegativeInteger(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.floor(parsed);
}

/**
 * Normaliza conteo positivo o cero.
 * @param {*} value - Valor.
 * @returns {number} Conteo.
 */
function normalizePositiveCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.floor(parsed);
}

/**
 * Normaliza email recibido desde la UI.
 * @param {*} value - Email.
 * @returns {?string} Email normalizado.
 */
function normalizeUserEmail(value) {
    if (typeof value !== 'string')
        return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/**
 * Normaliza permisos recibidos.
 * @param {*} permissions - Payload.
 * @returns {*} Permisos.
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
 * Comprueba si hay algun rol de dataset activo.
 * @param {*} permissions - Permisos normalizados.
 * @returns {boolean} True si alguno esta activo.
 */
function hasAnyDatasetRole(permissions) {
    return Boolean(permissions?.isAnnotator || permissions?.isReviewer || permissions?.isAdmin);
}

/**
 * Comprueba si una fila permite administrar el dataset.
 * @param {*} permit - Permiso.
 * @returns {boolean} True si administra.
 */
function hasDatasetAdminPermission(permit) {
    return Boolean(permit && (permit.isAdmin || permit.isOwned));
}

/**
 * Adapta una entry persistida al modelo consumido por la pantalla de anotacion.
 * @param {*} entryRecord - Entry tal como la devuelve Prisma.
 * @returns {*} Annotation entry preparada para el cliente.
 */
function mapPersistedEntryToAnnotationEntry(entryRecord) {
    return {
        eid: entryRecord.eid,
        category: entryRecord.category || '',
        shape: entryRecord.shape ?? null,
        shapeType: entryRecord.shapeType ?? null,
        size: entryRecord.size,
        originalTriples: flattenPersistedTriplesets(entryRecord.triplesets, 'original'),
        modifiedTriples: flattenPersistedTriplesets(entryRecord.triplesets, 'modified'),
        sourceSentences: entryRecord.lexes
            .filter((/** @type {*} */ lex) => lex.lang === 'en')
            .map((/** @type {*} */ lex) => lex.text.trim())
            .filter(Boolean)
    };
}

/**
 * Adapta una entry persistida al modelo que entiende `buildDatasetXml`.
 * @param {*} entryRecord - Entry tal como la devuelve Prisma.
 * @returns {*} Estructura compatible con el serializador XML.
 */
function mapPersistedEntryToXmlEntry(entryRecord) {
    return {
        eid: entryRecord.eid,
        category: entryRecord.category || '',
        shape: entryRecord.shape ?? null,
        shapeType: entryRecord.shapeType ?? null,
        size: entryRecord.size,
        originalTriplesets: filterPersistedTriplesets(entryRecord.triplesets, 'original'),
        modifiedTriplesets: filterPersistedTriplesets(entryRecord.triplesets, 'modified'),
        lexes: entryRecord.lexes.map((/** @type {*} */ lex) => ({
            lid: lex.lid,
            lang: lex.lang,
            comment: lex.comment,
            text: lex.text
        })),
        dbpediaLinks: entryRecord.dbpediaLinks.map((/** @type {*} */ link) => ({
            direction: link.direction,
            subject: link.subject,
            predicate: link.predicate,
            object: link.object
        })),
        links: entryRecord.links.map((/** @type {*} */ link) => ({
            direction: link.direction,
            subject: link.subject,
            predicate: link.predicate,
            object: link.object
        }))
    };
}

/**
 * Filtra triplesets persistidos por tipo y los normaliza para XML.
 * @param {*} triplesets - Coleccion persistida.
 * @param {*} type - Tipo de tripleset ("original" | "modified").
 * @returns {Array<*>} Triplesets filtrados con sus triples.
 */
function filterPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter((/** @type {*} */ tripleset) => tripleset.type === type)
        .map((/** @type {*} */ tripleset) => ({
            triples: tripleset.triples.map((/** @type {*} */ triple) => ({
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            }))
        }));
}

/**
 * Aplana triplesets persistidos por tipo en una lista plana de triples.
 * @param {*} triplesets - Coleccion persistida.
 * @param {*} type - Tipo de tripleset ("original" | "modified").
 * @returns {Array<*>} Triples planos.
 */
function flattenPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter((/** @type {*} */ tripleset) => tripleset.type === type)
        .flatMap((/** @type {*} */ tripleset) => tripleset.triples.map((/** @type {*} */ triple) => ({
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object
        })));
}

/**
 * Aplana una fila de dataset enriquecida al objeto base usado por los mappers de DTO.
 * @param {*} datasetRow - Fila de dataset persistida.
 * @param {*} [options] - Conteos adicionales calculados aparte (reviewableCount, annotatedEntries).
 * @returns {*} Objeto base para construir DTOs.
 */
function mapDatasetRecordToSource(datasetRow, { reviewableCount = 0, annotatedEntries = /** @type {*} */ (null) } = {}) {
    const isReviewEnabled = Boolean(datasetRow.isReviewEnabled);
    const percentages = calculatePercentagesFromSectionCounters({
        sectionsCompleted: datasetRow.sectionsCompleted,
        sectionsInReview: datasetRow.sectionsInReview,
        sectionsPending: datasetRow.sectionsPending,
        reviewEnabled: isReviewEnabled,
        annotatedEntries,
        totalEntries: datasetRow.totalEntries
    });

    return {
        id: datasetRow.id,
        name: datasetRow.name,
        triplesRDF: datasetRow.totalEntries,
        totalEntries: datasetRow.totalEntries,
        languages: parseLanguages(datasetRow.languages),
        completedPercent: percentages.completed,
        withoutReviewPercent: percentages.withoutReview,
        remainPercent: percentages.remaining,
        permissions: mapCurrentUserDatasetPermissions(datasetRow),
        review: mapCurrentUserReviewState(datasetRow, percentages, reviewableCount),
        options: {
            llmMode: datasetRow.llmMode || 'none',
            isReviewEnabled,
            hasAdditionalReviews: Boolean(datasetRow.hasAdditionalReviews)
        },
        colorClass: typeof datasetRow.colorClass === 'string' && datasetRow.colorClass.trim().length > 0
            ? datasetRow.colorClass
            : 'dataset-purple'
    };
}

/**
 * Normaliza opciones recibidas durante la creacion de un dataset.
 * @param {*} options - Opciones crudas.
 * @returns {*} Opciones listas para persistir.
 */
function normalizeDatasetCreationOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    const rawLlmMode = typeof source.llmMode === 'string'
        ? source.llmMode.trim().toLowerCase()
        : '';
    const llmMode = ['generation', 'correction', 'none'].includes(rawLlmMode)
        ? rawLlmMode
        : 'none';

    return {
        llmMode,
        isReviewEnabled: normalizeBooleanOption(source.isReviewEnabled ?? source.reviewEnabled),
        hasAdditionalReviews: normalizeBooleanOption(source.hasAdditionalReviews ?? source.additionalReviews)
    };
}

/**
 * Normaliza booleanos enviados por multipart o JSON.
 * @param {*} value - Valor crudo.
 * @returns {boolean} Booleano normalizado.
 */
function normalizeBooleanOption(value) {
    if (typeof value === 'boolean')
        return value;

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return ['true', '1', 'yes', 'on', 'si', 'sí'].includes(normalized);
    }

    return value === 1;
}

/**
 * Mapea estado de revision del usuario actual para pintar acciones.
 * @param {*} datasetRow - Dataset persistido.
 * @param {*} percentages - Porcentajes calculados.
 * @param {number} reviewableCount - Entries pendientes de revision.
 * @returns {*} Estado de revision.
 */
function mapCurrentUserReviewState(datasetRow, percentages, reviewableCount) {
    const permissions = mapCurrentUserDatasetPermissions(datasetRow);
    const safeCount = normalizeNonNegativeInteger(reviewableCount);
    const canReview = Boolean(permissions && permissions.reviewer);
    const completed = Number(percentages?.completed || 0) >= 100;

    return {
        canReview,
        showReviewButton: canReview && !completed,
        reviewAvailable: canReview && !completed && safeCount > 0,
        reviewableCount: safeCount
    };
}

/**
 * Mapea permisos del usuario actual incluidos con el dataset.
 * @param {*} datasetRow - Dataset persistido.
 * @returns {*} Permisos o null.
 */
function mapCurrentUserDatasetPermissions(datasetRow) {
    const permit = Array.isArray(datasetRow?.permits) && datasetRow.permits.length > 0
        ? datasetRow.permits[0]
        : null;

    if (!permit)
        return null;

    return {
        annotator: Boolean(permit.isAnnotator),
        reviewer: Boolean(permit.isReviewer),
        admin: Boolean(permit.isAdmin || permit.isOwned),
        owner: Boolean(permit.isOwned),
        canAdmin: Boolean(permit.isAdmin || permit.isOwned)
    };
}

/**
 * Parsea la columna `languages` de un dataset (texto JSON o array) a una lista de idiomas.
 * @param {*} value - Valor crudo persistido.
 * @returns {Array<string>} Idiomas normalizados o el default.
 */
function parseLanguages(value) {
    if (Array.isArray(value))
        return value.filter(item => typeof item === 'string' && item.trim().length > 0);

    if (typeof value !== 'string' || value.trim().length === 0)
        return DEFAULT_LANGUAGES;

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            return DEFAULT_LANGUAGES;

        const normalized = parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
        return normalized.length > 0 ? normalized : DEFAULT_LANGUAGES;
    } catch (caughtError) {
        const error = /** @type {any} */ (caughtError);
        if (error instanceof SyntaxError)
            return DEFAULT_LANGUAGES;
        throw error;
    }
}

/**
 * Lee desde disco el contenido binario de un fichero temporal subido.
 * @param {*} filename - Nombre del fichero temporal.
 * @returns {Buffer} Contenido binario.
 */
function defaultReadFileAsBuffer(filename) {
    return readFileSync(resolveExistingTempFilePath(filename));
}

/**
 * Deriva un nombre canonico para un dataset a partir de su filename original.
 * @param {*} originalname - Nombre original del fichero subido.
 * @returns {string} Nombre normalizado.
 */
function nameFromFilename(originalname) {
    const name = (originalname || '').replace(/\.xml$/i, '').trim();
    if (!name || name.length > 128)
        return 'NUEVO DATASET';
    return name;
}

module.exports = {
    createDatasetsService
};
