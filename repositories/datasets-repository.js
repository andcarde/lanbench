'use strict';

/**
 * @file Repository for the `Dataset` model (plus its entry/triple graph).
 *
 * Encapsula todas las consultas a Prisma relativas a datasets: descubrimiento
 * con permisos, alta transaccional del grafo completo (entries, triplesets,
 * triples, lexes, links), contadores agregados, y baja recursiva.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} DatasetRow             Forma minima devuelta por Prisma.
 * @property {number} id
 * @property {string} name
 * @property {string} colorClass
 * @property {boolean} [isReviewEnabled]
 *
 * @typedef {Object} PermitRow
 * @property {number} datasetId
 * @property {number} userId
 * @property {boolean} isOwned
 * @property {boolean} isAnnotator
 * @property {boolean} isReviewer
 * @property {boolean} isAdmin
 *
 * @typedef {Object} EntryRecord            Entry normalizada lista para persistir.
 * @property {string|number} eid
 * @property {string} category
 * @property {string|null} shape
 * @property {string|null} shapeType
 * @property {number} size
 * @property {number} position
 * @property {Array<*>} originalTriplesets
 * @property {Array<*>} modifiedTriplesets
 * @property {Array<*>} lexes
 * @property {Array<*>} dbpediaLinks
 * @property {Array<*>} links
 */

const defaultPrisma = require('../prisma/client');
const { ACTIVE_REVIEW_STATUSES } = require('../constants/review-status');
const { SECTION_SIZE } = require('../constants/datasets');

/** Opciones de la transaccion de importacion (maxWait/timeout en ms). */
const DATASET_IMPORT_TRANSACTION_OPTIONS = {
    maxWait: 20000,
    timeout: 120000
};
/** Tamano del lote para `createMany` (limites de MySQL/Prisma). */
const CREATE_MANY_BATCH_SIZE = 500;

/**
 * Construye el repositorio de datasets cableado al `prisma` recibido (o al
 * cliente compartido por defecto).
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Lista todos los datasets sobre los que el usuario tiene algun permiso
     * activo (`isOwned`, `isAnnotator`, `isReviewer` o `isAdmin`).
     *
     * @param {number} userId
     * @returns {Promise<Array<DatasetRow & { permits: PermitRow[] }>>}
     */
    async function findAccessibleMany(userId) {
        return deps.prisma.dataset.findMany({
            where: {
                permits: {
                    some: accessiblePermitWhere(userId)
                }
            },
            include: {
                permits: userPermitInclude(userId)
            },
            orderBy: { id: 'asc' }
        });
    }

    /**
     * Recupera un dataset accesible por su id (incluye permisos del usuario).
     *
     * @param {{ userId:number, datasetId:number }} input
     * @returns {Promise<(DatasetRow & { permits: PermitRow[] })|null>}
     */
    async function findAccessibleById({ userId, datasetId }) {
        return deps.prisma.dataset.findFirst({
            where: {
                id: datasetId,
                permits: {
                    some: accessiblePermitWhere(userId)
                }
            },
            include: {
                permits: userPermitInclude(userId)
            }
        });
    }

    /**
     * Recupera el dataset accesible al usuario con todo su grafo cargado:
     * entries (ordenadas por `position`) y sus triplesets, triples, lexes,
     * `dbpediaLinks` y `links`.
     *
     * @param {{ userId:number, datasetId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findAccessibleDatasetGraphById({ userId, datasetId }) {
        return deps.prisma.dataset.findFirst({
            where: {
                id: datasetId,
                permits: {
                    some: accessiblePermitWhere(userId)
                }
            },
            include: {
                permits: userPermitInclude(userId),
                entries: {
                    orderBy: { position: 'asc' },
                    include: {
                        triplesets: {
                            orderBy: [{ type: 'asc' }, { position: 'asc' }],
                            include: {
                                triples: {
                                    orderBy: { position: 'asc' }
                                }
                            }
                        },
                        lexes: {
                            orderBy: { position: 'asc' }
                        },
                        dbpediaLinks: {
                            orderBy: { position: 'asc' }
                        },
                        links: {
                            orderBy: { position: 'asc' }
                        }
                    }
                }
            }
        });
    }

    /**
     * Da de alta un dataset con `permit` (`isOwned`/`isAdmin`/`isAnnotator`)
     * para el usuario propietario y persiste su grafo de entries en una
     * unica transaccion (`DATASET_IMPORT_TRANSACTION_OPTIONS`).
     *
     * @param {{
     *   userId:number,
     *   datasetData: Record<string, any>,
     *   entryRecords?: EntryRecord[],
     *   resolveColorClass: (datasetId:number, currentColorClass:string) => string
     * }} input
     * @returns {Promise<DatasetRow>}
     */
    async function createOwnedDataset({ userId, datasetData, entryRecords = [], resolveColorClass }) {
        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            let createdDataset = await tx.dataset.create({
                data: datasetData
            });

            const datasetId = createdDataset.id;
            const colorClass = resolveColorClass(datasetId, createdDataset.colorClass);
            if (createdDataset.colorClass !== colorClass) {
                createdDataset = await tx.dataset.update({
                    where: { id: datasetId },
                    data: { colorClass }
                });
            }

            await tx.permit.create({
                data: {
                    datasetId,
                    userId,
                    isOwned: true,
                    isAnnotator: true,
                    isReviewer: false,
                    isAdmin: true
                }
            });

            if (entryRecords.length > 0)
                await persistDatasetGraph(tx, datasetId, entryRecords);

            return createdDataset;
        }, DATASET_IMPORT_TRANSACTION_OPTIONS);
    }

    /**
     * Actualiza contadores de secciones cuando se completa una seccion
     * anotada. Si `isReviewEnabled` esta desactivado, la seccion pasa
     * directamente de `pending` a `completed`. Si esta activado, pasa a
     * `inReview` a la espera de revision.
     *
     * @param {number} datasetId
     * @returns {Promise<DatasetRow>}
     */
    async function markSectionAsAnnotated(datasetId) {
        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            const dataset = await tx.dataset.findUnique({
                where: { id: datasetId },
                select: { isReviewEnabled: true }
            });

            const targetCounterUpdate = dataset && dataset.isReviewEnabled
                ? { sectionsInReview: { increment: 1 } }
                : { sectionsCompleted: { increment: 1 } };

            return tx.dataset.update({
                where: { id: datasetId },
                data: {
                    sectionsPending: { decrement: 1 },
                    ...targetCounterUpdate
                }
            });
        });
    }

    /**
     * Obtiene el permiso de un usuario sobre un dataset, incluyendo
     * informacion minima del dataset (modo LLM, revision activa, etc.) y
     * del propio usuario.
     *
     * @param {{ datasetId:number, userId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findPermitForUser({ datasetId, userId }) {
        return deps.prisma.permit.findUnique({
            where: {
                datasetId_userId: { datasetId, userId }
            },
            include: {
                dataset: {
                    select: {
                        id: true,
                        name: true,
                        llmMode: true,
                        isReviewEnabled: true,
                        hasAdditionalReviews: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        email: true
                    }
                }
            }
        });
    }

    /**
     * Lista usuarios con algun permiso activo sobre un dataset.
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<Array<Record<string, any>>>}
     */
    async function findPermissionRowsByDataset({ datasetId }) {
        return deps.prisma.permit.findMany({
            where: {
                datasetId,
                OR: activePermissionConditions()
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isModerator: true
                    }
                }
            },
            orderBy: { userId: 'asc' }
        });
    }

    /**
     * Crea o actualiza permisos de usuario en dataset. Solo escribe los
     * booleanos pasados; `isOwned` se respeta en `create` y nunca cambia
     * en `update`.
     *
     * @param {{ datasetId:number, userId:number, isAnnotator?:boolean, isReviewer?:boolean, isAdmin?:boolean }} payload
     * @returns {Promise<PermitRow>}
     */
    async function upsertDatasetPermission(payload) {
        const data = {
            isAnnotator: Boolean(payload.isAnnotator),
            isReviewer: Boolean(payload.isReviewer),
            isAdmin: Boolean(payload.isAdmin)
        };

        return deps.prisma.permit.upsert({
            where: {
                datasetId_userId: {
                    datasetId: payload.datasetId,
                    userId: payload.userId
                }
            },
            create: {
                datasetId: payload.datasetId,
                userId: payload.userId,
                isOwned: false,
                ...data
            },
            update: data,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isModerator: true
                    }
                }
            }
        });
    }

    /**
     * Borra cualquier `Permit` para `(datasetId, userId)` (revoca el acceso).
     *
     * @param {{ datasetId:number, userId:number }} input
     * @returns {Promise<{ count: number }>}
     */
    async function deleteDatasetPermission({ datasetId, userId }) {
        return deps.prisma.permit.deleteMany({
            where: { datasetId, userId }
        });
    }

    /**
     * Obtiene una entry por posicion global dentro del dataset.
     *
     * @param {{ datasetId:number, position:number }} input
     * @returns {Promise<{ id:number, eid:string|number, position:number }|null>}
     */
    async function findEntryByPosition({ datasetId, position }) {
        return deps.prisma.entry.findUnique({
            where: {
                datasetId_position: { datasetId, position }
            },
            select: {
                id: true,
                eid: true,
                position: true
            }
        });
    }

    /**
     * Lista los ids de entries que pertenecen a una seccion (segun el
     * particionado por `SECTION_SIZE`).
     *
     * @param {{ datasetId:number, sectionIndex:number }} input
     * @returns {Promise<number[]>}
     */
    async function findEntryIdsBySection({ datasetId, sectionIndex }) {
        const startPosition = (sectionIndex - 1) * SECTION_SIZE;
        const rows = await deps.prisma.entry.findMany({
            where: {
                datasetId,
                position: {
                    gte: startPosition,
                    lt: startPosition + SECTION_SIZE
                }
            },
            select: { id: true },
            orderBy: { position: 'asc' }
        });

        return rows.map((/** @type {*} */ row) => row.id);
    }

    /**
     * Lista los `size` de todas las entries del dataset ordenadas por
     * `position`.
     *
     * @param {number} datasetId
     * @returns {Promise<number[]>}
     */
    async function findEntrySizesByDataset(datasetId) {
        const rows = await deps.prisma.entry.findMany({
            where: { datasetId },
            select: { size: true },
            orderBy: { position: 'asc' }
        });

        return rows.map((/** @type {*} */ row) => row.size);
    }

    /**
     * Borra un dataset y todas sus filas dependientes de forma
     * transaccional, respetando el orden de borrado para no violar las
     * FKs (decisiones, comentarios y reviews antes que entries, etc.).
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<{ datasetId:number }>}
     */
    async function deleteDatasetRecursively({ datasetId }) {
        return deps.prisma.$transaction(async (/** @type {*} */ tx) => {
            await tx.reviewDecision.deleteMany({
                where: { review: { entry: { datasetId } } }
            });
            await tx.reviewComment.deleteMany({
                where: { review: { entry: { datasetId } } }
            });
            await tx.review.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.annotationAlertDecision.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.annotation.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.triple.deleteMany({
                where: { tripleset: { entry: { datasetId } } }
            });
            await tx.tripleset.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.lex.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.dbpediaLink.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.link.deleteMany({
                where: { entry: { datasetId } }
            });
            await tx.entry.deleteMany({
                where: { datasetId }
            });
            await tx.sectionAssignment.deleteMany({
                where: { datasetId }
            });
            await tx.section.deleteMany({
                where: { datasetId }
            });
            await tx.permit.deleteMany({
                where: { datasetId }
            });

            await tx.dataset.delete({
                where: { id: datasetId }
            });
            return { datasetId };
        });
    }

    /**
     * Obtiene el grafo minimo necesario para calcular estadisticas del
     * dataset (anotaciones por usuario, reviews con resoluciones y tiempos).
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findDatasetStatisticsGraph({ datasetId }) {
        return deps.prisma.dataset.findUnique({
            where: { id: datasetId },
            select: {
                id: true,
                name: true,
                totalEntries: true,
                sectionAssignments: {
                    select: {
                        userId: true,
                        timeSpentSeconds: true
                    }
                },
                entries: {
                    select: {
                        id: true,
                        annotations: {
                            select: {
                                userId: true,
                                isAcceptedFirstTry: true,
                                user: {
                                    select: {
                                        id: true,
                                        email: true
                                    }
                                }
                            }
                        },
                        reviews: {
                            select: {
                                id: true,
                                reviewerId: true,
                                status: true,
                                timeSpentSeconds: true,
                                reviewer: {
                                    select: {
                                        id: true,
                                        email: true
                                    }
                                },
                                comments: {
                                    select: {
                                        isAcceptedFirstTry: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Lista entries con estado `annotated` que el `userId` aun no ha
     * anotado y sobre las que no hay reviews vivas. Solo el `datasetId` se
     * devuelve — la usa el servicio para descubrir datasets revisables.
     *
     * @param {{ userId:number, datasetIds:number[] }} input
     * @returns {Promise<Array<{ datasetId:number }>>}
     */
    async function findReviewableEntryDatasetIds({ userId, datasetIds }) {
        const safeDatasetIds = Array.isArray(datasetIds)
            ? datasetIds.filter(id => Number.isInteger(id) && id > 0)
            : [];

        if (!safeDatasetIds.length)
            return [];

        return deps.prisma.entry.findMany({
            where: {
                datasetId: { in: safeDatasetIds },
                status: 'annotated',
                annotations: {
                    none: { userId }
                },
                reviews: {
                    none: {
                        status: {
                            in: ['pending', 'in_progress', 'completed', 'disputed']
                        }
                    }
                }
            },
            select: {
                datasetId: true
            }
        });
    }

    /**
     * Cuenta entries con al menos una anotacion, agrupando por dataset.
     *
     * @param {{ datasetIds:number[] }} input
     * @returns {Promise<Array<{ datasetId:number, count:number }>>}
     */
    async function countAnnotatedEntriesByDataset({ datasetIds }) {
        const safeDatasetIds = Array.isArray(datasetIds)
            ? datasetIds.filter(id => Number.isInteger(id) && id > 0)
            : [];

        if (!safeDatasetIds.length)
            return [];

        const rows = await deps.prisma.entry.findMany({
            where: {
                datasetId: { in: safeDatasetIds },
                annotations: { some: {} }
            },
            select: { datasetId: true }
        });

        const counts = new Map();
        for (const row of rows) {
            const datasetId = Number(row?.datasetId);
            if (!Number.isInteger(datasetId) || datasetId <= 0)
                continue;
            counts.set(datasetId, (counts.get(datasetId) || 0) + 1);
        }

        return [...counts.entries()].map(([datasetId, count]) => ({ datasetId, count }));
    }

    /**
     * Lista las reviews activas asignadas al `userId` dentro de los datasets
     * dados, devolviendo solo el `datasetId` (para mapeo agregado).
     *
     * @param {{ userId:number, datasetIds:number[] }} input
     * @returns {Promise<Array<{ entry: { datasetId:number } }>>}
     */
    async function findActiveReviewDatasetIdsForReviewer({ userId, datasetIds }) {
        const safeDatasetIds = Array.isArray(datasetIds)
            ? datasetIds.filter(id => Number.isInteger(id) && id > 0)
            : [];

        if (!safeDatasetIds.length)
            return [];

        return deps.prisma.review.findMany({
            where: {
                reviewerId: userId,
                status: { in: ACTIVE_REVIEW_STATUSES },
                entry: {
                    datasetId: { in: safeDatasetIds }
                }
            },
            select: {
                entry: {
                    select: {
                        datasetId: true
                    }
                }
            }
        });
    }

    return {
        findAccessibleMany,
        findAccessibleById,
        findAccessibleDatasetGraphById,
        createOwnedDataset,
        markSectionAsAnnotated,
        findEntryByPosition,
        findEntryIdsBySection,
        findEntrySizesByDataset,
        findPermitForUser,
        findPermissionRowsByDataset,
        upsertDatasetPermission,
        deleteDatasetPermission,
        deleteDatasetRecursively,
        findDatasetStatisticsGraph,
        findReviewableEntryDatasetIds,
        findActiveReviewDatasetIdsForReviewer,
        countAnnotatedEntriesByDataset
    };
}

/**
 * Construye la condicion `where` Prisma que identifica un permiso activo
 * (cualquiera de `isOwned`, `isAnnotator`, `isReviewer`, `isAdmin`) para el
 * usuario dado.
 *
 * @param {number} userId
 * @returns {Record<string, any>}
 */
function accessiblePermitWhere(userId) {
    return {
        userId,
        OR: activePermissionConditions()
    };
}

/**
 * Devuelve la lista de subcondiciones OR que delimitan "permiso efectivo".
 *
 * @returns {Array<Record<string, true>>}
 */
function activePermissionConditions() {
    return [
        { isOwned: true },
        { isAnnotator: true },
        { isReviewer: true },
        { isAdmin: true }
    ];
}

/**
 * Construye el fragmento `include`/`where` que recupera SOLO el permiso del
 * usuario actual al traer un dataset.
 *
 * @param {number} userId
 * @returns {Record<string, any>}
 */
function userPermitInclude(userId) {
    return {
        where: { userId },
        select: {
            isOwned: true,
            isAnnotator: true,
            isReviewer: true,
            isAdmin: true
        }
    };
}

/**
 * Persiste el grafo completo de un dataset recien creado:
 * `entries` -> `triplesets` -> `triples`, mas `lexes`, `dbpediaLinks` y
 * `links`. Usa lotes `createMany` para minimizar el numero de roundtrips
 * a la BD.
 *
 * @param {*} tx
 * @param {number} datasetId
 * @param {EntryRecord[]} entryRecords
 * @returns {Promise<void>}
 */
async function persistDatasetGraph(tx, datasetId, entryRecords) {
    await createEntryRows(tx, datasetId, entryRecords);

    const entryIdByPosition = await findEntryIdsByPosition(tx, datasetId);
    const relatedRows = buildRelatedRows(entryRecords, entryIdByPosition);

    await createRowsIfAny(tx.tripleset, relatedRows.triplesetRows);

    const createdTriplesets = await findCreatedTriplesets(tx, relatedRows.triplesetRows, entryIdByPosition);

    const triplesetIdByKey = new Map(
        createdTriplesets.map(tripleset => [
            buildTriplesetKey(tripleset.entryId, tripleset.type, tripleset.position),
            tripleset.id
        ])
    );

    const tripleRows = buildTripleRows(entryRecords, entryIdByPosition, triplesetIdByKey);

    await createRowsIfAny(tx.triple, tripleRows);
    await createRowsIfAny(tx.lex, relatedRows.lexRows);
    await createRowsIfAny(tx.dbpediaLink, relatedRows.dbpediaLinkRows);
    await createRowsIfAny(tx.link, relatedRows.linkRows);
}

/**
 * Persiste las filas principales de `entry` (sin sus dependencias).
 *
 * @param {*} tx
 * @param {number} datasetId
 * @param {EntryRecord[]} entryRecords
 * @returns {Promise<void>}
 */
async function createEntryRows(tx, datasetId, entryRecords) {
    await createRowsIfAny(tx.entry, entryRecords.map(entry => ({
        datasetId,
        eid: entry.eid,
        category: entry.category,
        shape: entry.shape,
        shapeType: entry.shapeType,
        size: entry.size,
        position: entry.position
    })));
}

/**
 * Obtiene ids de entries por posicion.
 * @param {*} tx - Transaccion Prisma.
 * @param {number} datasetId - Dataset.
 * @returns {Promise<Map<*, *>>} Mapa posicion -> entryId.
 */
async function findEntryIdsByPosition(tx, datasetId) {
    const createdEntries = await tx.entry.findMany({
        where: { datasetId },
        select: {
            id: true,
            position: true
        },
        orderBy: { position: 'asc' }
    });

    return new Map(createdEntries.map((/** @type {*} */ entry) => [entry.position, entry.id]));
}

/**
 * Construye filas dependientes de entry.
 * @param {Array<*>} entryRecords - Entries normalizadas.
 * @param {Map<*, *>} entryIdByPosition - Ids por posicion.
 * @returns {*} Filas por tabla.
 */
function buildRelatedRows(entryRecords, entryIdByPosition) {
    const rows = {
        triplesetRows: [],
        lexRows: [],
        dbpediaLinkRows: [],
        linkRows: []
    };

    for (const entry of entryRecords) {
        const entryId = requireEntryId(entryIdByPosition, entry.position);

        pushTriplesets(rows.triplesetRows, entryId, entry.originalTriplesets, 'original');
        pushTriplesets(rows.triplesetRows, entryId, entry.modifiedTriplesets, 'modified');
        pushLexRows(rows.lexRows, entryId, entry.lexes);
        pushLinkRows(rows.dbpediaLinkRows, entryId, entry.dbpediaLinks);
        pushLinkRows(rows.linkRows, entryId, entry.links);
    }

    return rows;
}

/**
 * Busca triplesets creados para el dataset.
 * @param {*} tx - Transaccion Prisma.
 * @param {Array<*>} triplesetRows - Filas de tripleset.
 * @param {Map<*, *>} entryIdByPosition - Ids por posicion.
 * @returns {Promise<Array<*>>} Triplesets creados.
 */
async function findCreatedTriplesets(tx, triplesetRows, entryIdByPosition) {
    if (triplesetRows.length === 0)
        return [];

    return tx.tripleset.findMany({
        where: {
            entryId: {
                in: [...entryIdByPosition.values()]
            }
        },
        select: {
            id: true,
            entryId: true,
            type: true,
            position: true
        }
    });
}

/**
 * Construye filas de triples.
 * @param {Array<*>} entryRecords - Entries normalizadas.
 * @param {Map<*, *>} entryIdByPosition - Ids por posicion.
 * @param {Map<*, *>} triplesetIdByKey - Ids por clave de tripleset.
 * @returns {Array<*>} Filas de triple.
 */
function buildTripleRows(entryRecords, entryIdByPosition, triplesetIdByKey) {
    /** @type {any[]} */
    const tripleRows = [];

    for (const entry of entryRecords) {
        const entryId = entryIdByPosition.get(entry.position);
        if (!entryId)
            continue;

        pushTriples(tripleRows, triplesetIdByKey, entryId, entry.originalTriplesets, 'original');
        pushTriples(tripleRows, triplesetIdByKey, entryId, entry.modifiedTriplesets, 'modified');
    }

    return tripleRows;
}

/**
 * Persiste filas si hay datos.
 * @param {*} model - Modelo Prisma.
 * @param {Array<*>} rows - Filas.
 * @returns {Promise<void>} Promesa de persistencia.
 */
async function createRowsIfAny(model, rows) {
    for (let start = 0; start < rows.length; start += CREATE_MANY_BATCH_SIZE) {
        const batch = rows.slice(start, start + CREATE_MANY_BATCH_SIZE);
        if (batch.length > 0)
            await model.createMany({ data: batch });
    }
}

/**
 * Obtiene entryId o lanza error contextual.
 * @param {Map<*, *>} entryIdByPosition - Ids por posicion.
 * @param {number} position - Posicion.
 * @returns {number} Id de entry.
 */
function requireEntryId(entryIdByPosition, position) {
    const entryId = entryIdByPosition.get(position);
    if (!entryId)
        throw new Error(`No se pudo resolver la entry persistida para la posición ${position}.`);
    return entryId;
}

/**
 * Acumula filas `tripleset` para el `entryId` dado.
 *
 * @param {Array<Record<string, any>>} targetRows
 * @param {number} entryId
 * @param {Array<{ position:number, triples?: Array<*> }>} triplesets
 * @param {'original'|'modified'} type
 * @returns {void}
 */
function pushTriplesets(targetRows, entryId, triplesets, type) {
    for (const tripleset of triplesets) {
        targetRows.push({
            entryId,
            type,
            position: tripleset.position
        });
    }
}

/**
 * Agrega filas de lexicalizaciones.
 * @param {Array<*>} targetRows - Filas destino.
 * @param {number} entryId - Entry.
 * @param {Array<*>} lexes - Lexicalizaciones.
 * @returns {void}
 */
function pushLexRows(targetRows, entryId, lexes) {
    for (const lex of lexes) {
        targetRows.push({
            entryId,
            lid: lex.lid,
            lang: lex.lang,
            comment: lex.comment,
            text: lex.text,
            position: lex.position
        });
    }
}

/**
 * Agrega filas de enlaces RDF.
 * @param {Array<*>} targetRows - Filas destino.
 * @param {number} entryId - Entry.
 * @param {Array<*>} links - Enlaces.
 * @returns {void}
 */
function pushLinkRows(targetRows, entryId, links) {
    for (const link of links) {
        targetRows.push({
            entryId,
            direction: link.direction,
            subject: link.subject,
            predicate: link.predicate,
            object: link.object,
            position: link.position
        });
    }
}

/**
 * Acumula filas `triple` para los triplesets dados, resolviendo el
 * `triplesetId` por la clave `entryId:type:position`.
 *
 * @param {Array<Record<string, any>>} targetRows
 * @param {Map<string, number>} triplesetIdByKey
 * @param {number} entryId
 * @param {Array<{ position:number, triples: Array<*> }>} triplesets
 * @param {'original'|'modified'} type
 * @returns {void}
 */
function pushTriples(targetRows, triplesetIdByKey, entryId, triplesets, type) {
    for (const tripleset of triplesets) {
        const triplesetKey = buildTriplesetKey(entryId, type, tripleset.position);
        const triplesetId = triplesetIdByKey.get(triplesetKey);

        if (!triplesetId)
            throw new Error(`No se pudo resolver el tripleset ${triplesetKey}.`);

        for (const triple of tripleset.triples) {
            targetRows.push({
                triplesetId,
                position: triple.position,
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            });
        }
    }
}

/**
 * Clave compuesta utilizada para resolver `triplesetId` durante el flujo de
 * importacion (`entryId:type:position`).
 *
 * @param {number} entryId
 * @param {'original'|'modified'} type
 * @param {number} position
 * @returns {string}
 */
function buildTriplesetKey(entryId, type, position) {
    return `${entryId}:${type}:${position}`;
}

module.exports = {
    createDatasetsRepository
};
