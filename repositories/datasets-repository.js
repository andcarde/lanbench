'use strict';

/**
 * @file Repository for the `Dataset` model (plus its entry/triple graph).
 *
 * Encapsulates all Prisma queries related to datasets: permission-aware
 * discovery, transactional insertion of the full graph (entries, triplesets,
 * triples, lexes, links), aggregate counters, and recursive deletion.
 *
 * @typedef {import('../types/typedefs').PrismaClientLike} PrismaClientLike
 *
 * @typedef {Object} DatasetRow             Minimal shape returned by Prisma.
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
 * @typedef {Object} EntryRecord            Normalized entry ready to persist.
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
const { resolveSectionSize } = require('../constants/datasets');

/** Options for the import transaction (maxWait/timeout in ms). */
const DATASET_IMPORT_TRANSACTION_OPTIONS = {
    maxWait: 20000,
    timeout: 120000
};
/** Batch size for `createMany` (MySQL/Prisma limits). */
const CREATE_MANY_BATCH_SIZE = 500;

/**
 * Builds the datasets repository wired to the received `prisma` (or to the
 * shared default client).
 *
 * @param {{ prisma?: PrismaClientLike }} [options]
 */
function createDatasetsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    /**
     * Lists all datasets on which the user has some active permission
     * (`isOwned`, `isAnnotator`, `isReviewer` or `isAdmin`).
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
     * Retrieves an accessible dataset by its id (includes the user's permissions).
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
     * Retrieves the dataset accessible to the user with its full graph loaded:
     * entries (ordered by `position`) and their triplesets, triples, lexes,
     * `dbpediaLinks` and `links`.
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
     * Retrieves the dataset accessible to the user with its full graph and the
     * `annotations` persisted per entry (ordered by `sentenceIndex`).
     * Endpoint dedicated to the extended-XML download (US-30): the additional
     * `annotations` include is not added to the base graph so as not to make
     * the other endpoints, which only need the original content, more
     * expensive.
     *
     * @param {{ userId:number, datasetId:number }} input
     * @returns {Promise<Record<string, any>|null>}
     */
    async function findAccessibleDatasetGraphWithAnnotationsById({ userId, datasetId }) {
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
                        },
                        annotations: {
                            where: { datasetId },
                            orderBy: { sentenceIndex: 'asc' }
                        }
                    }
                }
            }
        });
    }

    /**
     * Creates a dataset with a `permit` (`isOwned`/`isAdmin`/`isAnnotator`)
     * for the owning user and persists its entry graph in a single transaction
     * (`DATASET_IMPORT_TRANSACTION_OPTIONS`).
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
     * Finds a dataset *owned* by `userId` (via a `Permit` with `isOwned`) whose
     * name matches, optionally excluding one dataset id. Enforces the
     * per-owner name-uniqueness invariant on creation and rename. The name
     * comparison uses the column's DB collation (case-insensitive by default).
     *
     * @param {{ userId:number, name:string, excludeDatasetId?:number }} input
     * @returns {Promise<{ id:number, name:string }|null>}
     */
    async function findOwnedDatasetWithSameName({ userId, name, excludeDatasetId }) {
        return deps.prisma.dataset.findFirst({
            where: {
                name,
                ...(Number.isInteger(excludeDatasetId) && Number(excludeDatasetId) > 0
                    ? { id: { not: excludeDatasetId } }
                    : {}),
                permits: {
                    some: { userId, isOwned: true }
                }
            },
            select: { id: true, name: true }
        });
    }

    /**
     * Resolves the owning user of a dataset (the `Permit` row with `isOwned`).
     *
     * @param {{ datasetId:number }} input
     * @returns {Promise<number|null>} Owner user id, or null if none.
     */
    async function findDatasetOwnerUserId({ datasetId }) {
        const ownerPermit = await deps.prisma.permit.findFirst({
            where: { datasetId, isOwned: true },
            select: { userId: true }
        });
        return ownerPermit ? ownerPermit.userId : null;
    }

    /**
     * Renames a dataset.
     *
     * @param {{ datasetId:number, name:string }} input
     * @returns {Promise<{ id:number, name:string }>}
     */
    async function renameDataset({ datasetId, name }) {
        return deps.prisma.dataset.update({
            where: { id: datasetId },
            data: { name },
            select: { id: true, name: true }
        });
    }

    /**
     * Updates section counters when an annotated section is completed. If
     * `isReviewEnabled` is off, the section goes directly from `pending` to
     * `completed`. If it is on, it goes to `inReview` awaiting review.
     *
     * When `client` (a Prisma transaction client) is passed, both operations
     * run in that already-open transaction (Prisma does not allow nested
     * `$transaction`). Without `client`, it opens its own transaction.
     *
     * @param {number} datasetId
     * @param {PrismaClientLike} [client] - Cliente transaccional opcional.
     * @returns {Promise<DatasetRow>}
     */
    async function markSectionAsAnnotated(datasetId, client) {
        const run = async (/** @type {*} */ tx) => {
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
        };

        return client ? run(client) : deps.prisma.$transaction(run);
    }

    /**
     * Gets an entry by its global position within the dataset.
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
     * Lists the ids of entries that belong to a section (according to the
     * per-dataset section-size partitioning).
     *
     * `sectionSize` may be supplied by the caller; when omitted it is resolved
     * from the dataset's persisted `sectionSize` (legacy rows fall back to the
     * default). The size determines the contiguous `position` window of the
     * section.
     *
     * @param {{ datasetId:number, sectionIndex:number, sectionSize?:number }} input
     * @returns {Promise<number[]>}
     */
    async function findEntryIdsBySection({ datasetId, sectionIndex, sectionSize }) {
        const size = await resolveDatasetSectionSize(datasetId, sectionSize);
        const startPosition = (sectionIndex - 1) * size;
        const rows = await deps.prisma.entry.findMany({
            where: {
                datasetId,
                position: {
                    gte: startPosition,
                    lt: startPosition + size
                }
            },
            select: { id: true },
            orderBy: { position: 'asc' }
        });

        return rows.map((/** @type {*} */ row) => row.id);
    }

    /**
     * Resolves the section size to use for a dataset: the explicit override when
     * positive, otherwise the dataset's persisted `sectionSize` (with the legacy
     * fallback applied by {@link resolveSectionSize}).
     *
     * @param {number} datasetId
     * @param {number} [sectionSize] - Optional caller-supplied size.
     * @returns {Promise<number>}
     */
    async function resolveDatasetSectionSize(datasetId, sectionSize) {
        if (typeof sectionSize === 'number' && Number.isInteger(sectionSize) && sectionSize > 0)
            return sectionSize;

        const row = await deps.prisma.dataset.findUnique({
            where: { id: datasetId },
            select: { sectionSize: true }
        });
        return resolveSectionSize(row);
    }

    /**
     * Deletes a dataset and all its dependent rows transactionally, respecting
     * the deletion order so as not to violate the FKs (decisions, comments and
     * reviews before entries, etc.).
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
     * Lists entries in `annotated` state that `userId` has not yet annotated
     * and on which there are no live reviews. Only the `datasetId` is
     * returned — used by the service to discover reviewable datasets.
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
                // Mirror reviews-repository.findReviewableEntries: only
                // review-enabled datasets contribute reviewable entries, so the
                // dataset card never advertises a review affordance for a dataset
                // whose admin left review disabled.
                dataset: { isReviewEnabled: true },
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
     * Mirror of {@link findReviewableEntryDatasetIds} for the *opposite* side of
     * the self-review governance rule (USER-STORIES §US-13): entries that would
     * be reviewable except that `userId` annotated them, so the review queue
     * excludes them. Used only to explain a disabled review button — when its
     * count is the sole reason `reviewableCount` is 0, the card surfaces "you
     * annotated all the pending entries yourself" instead of the generic
     * "nothing to review".
     *
     * @param {{ userId:number, datasetIds:number[] }} input
     * @returns {Promise<Array<{ datasetId:number }>>}
     */
    async function findSelfAnnotatedReviewableDatasetIds({ userId, datasetIds }) {
        const safeDatasetIds = Array.isArray(datasetIds)
            ? datasetIds.filter(id => Number.isInteger(id) && id > 0)
            : [];

        if (!safeDatasetIds.length)
            return [];

        return deps.prisma.entry.findMany({
            where: {
                datasetId: { in: safeDatasetIds },
                status: 'annotated',
                dataset: { isReviewEnabled: true },
                // The single difference vs. findReviewableEntryDatasetIds: here we
                // want the entries the reviewer annotated themselves (`some`),
                // which the review queue filters out (`none`).
                annotations: {
                    some: { userId }
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
     * Counts entries with at least one annotation, grouped by dataset.
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
     * Lists the active reviews assigned to `userId` within the given datasets,
     * returning only the `datasetId` (for aggregate mapping).
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
        findAccessibleDatasetGraphWithAnnotationsById,
        createOwnedDataset,
        findOwnedDatasetWithSameName,
        findDatasetOwnerUserId,
        renameDataset,
        markSectionAsAnnotated,
        findEntryByPosition,
        findEntryIdsBySection,
        deleteDatasetRecursively,
        findReviewableEntryDatasetIds,
        findSelfAnnotatedReviewableDatasetIds,
        findActiveReviewDatasetIdsForReviewer,
        countAnnotatedEntriesByDataset
    };
}

/**
 * Builds the Prisma `where` condition that identifies an active permission
 * (any of `isOwned`, `isAnnotator`, `isReviewer`, `isAdmin`) for the given
 * user.
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
 * Returns the list of OR subconditions that delimit "effective permission".
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
 * Builds the `include`/`where` fragment that retrieves ONLY the current user's
 * permission when fetching a dataset.
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
 * Persists the full graph of a just-created dataset:
 * `entries` -> `triplesets` -> `triples`, plus `lexes`, `dbpediaLinks` and
 * `links`. Uses `createMany` batches to minimize the number of DB roundtrips.
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
 * Persists the main `entry` rows (without their dependencies).
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
 * Gets entry ids by position.
 * @param {*} tx - Prisma transaction.
 * @param {number} datasetId - Dataset.
 * @returns {Promise<Map<*, *>>} Map of position -> entryId.
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
 * Builds the rows dependent on an entry.
 * @param {Array<*>} entryRecords - Normalized entries.
 * @param {Map<*, *>} entryIdByPosition - Ids by position.
 * @returns {*} Rows per table.
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
 * Finds the triplesets created for the dataset.
 * @param {*} tx - Prisma transaction.
 * @param {Array<*>} triplesetRows - Tripleset rows.
 * @param {Map<*, *>} entryIdByPosition - Ids by position.
 * @returns {Promise<Array<*>>} Created triplesets.
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
 * Builds triple rows.
 * @param {Array<*>} entryRecords - Normalized entries.
 * @param {Map<*, *>} entryIdByPosition - Ids by position.
 * @param {Map<*, *>} triplesetIdByKey - Ids by tripleset key.
 * @returns {Array<*>} Triple rows.
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
 * Persists rows if there is data.
 * @param {*} model - Prisma model.
 * @param {Array<*>} rows - Rows.
 * @returns {Promise<void>} Persistence promise.
 */
async function createRowsIfAny(model, rows) {
    for (let start = 0; start < rows.length; start += CREATE_MANY_BATCH_SIZE) {
        const batch = rows.slice(start, start + CREATE_MANY_BATCH_SIZE);
        if (batch.length > 0)
            await model.createMany({ data: batch });
    }
}

/**
 * Gets an entryId or throws a contextual error.
 * @param {Map<*, *>} entryIdByPosition - Ids by position.
 * @param {number} position - Position.
 * @returns {number} Entry id.
 */
function requireEntryId(entryIdByPosition, position) {
    const entryId = entryIdByPosition.get(position);
    if (!entryId)
        throw new Error(`No se pudo resolver la entry persistida para la posición ${position}.`);
    return entryId;
}

/**
 * Accumulates `tripleset` rows for the given `entryId`.
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
 * Adds lexicalization rows.
 * @param {Array<*>} targetRows - Destination rows.
 * @param {number} entryId - Entry.
 * @param {Array<*>} lexes - Lexicalizations.
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
 * Adds RDF link rows.
 * @param {Array<*>} targetRows - Destination rows.
 * @param {number} entryId - Entry.
 * @param {Array<*>} links - Links.
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
 * Accumulates `triple` rows for the given triplesets, resolving the
 * `triplesetId` by the key `entryId:type:position`.
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
 * Composite key used to resolve `triplesetId` during the import flow
 * (`entryId:type:position`).
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
