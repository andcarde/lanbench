'use strict';

/**
 * @file Datasets service — high-level orchestration over datasets.
 *
 * Covers: creation (XML parse + transactional persistence via repo), listing
 * with the user's permissions, reading a section for annotation, XML export,
 * per-dataset permission management and recursive deletion.
 *
 * Injects XML parsing/serialization utilities so tests can replace them
 * without touching disk.
 *
 * @typedef {import('../types/typedefs').DatasetListDTO}    DatasetListDTO
 * @typedef {import('../types/typedefs').DatasetSectionDTO} DatasetSectionDTO
 *
 * @typedef {Object} DatasetsServiceDeps
 * @property {Record<string, any>} [datasetsRepository]
 * @property {Record<string, any>} [datasetsPermissionsRepository]
 * @property {Record<string, any>} [datasetLlmCredentialsRepository]
 * @property {Record<string, any>} [usersRepository]
 * @property {(filePath:string)=>any} [readDataset]
 * @property {(input:any, filename?:any)=>any} [parseDatasetImport]
 * @property {(dataset:any)=>string} [buildDatasetXml]
 * @property {(dataset:any)=>string} [buildAnnotatedDatasetXml]
 * @property {(filePath:string)=>Buffer} [readFileAsBuffer]
 */

const { readFileSync } = require('node:fs');
const {
    readDataset: defaultReadDataset,
    parseDatasetImport: defaultParseDatasetImport
} = require('../utils/xml-reader');
const {
    buildDatasetXml: defaultBuildDatasetXml,
    buildAnnotatedDatasetXml: defaultBuildAnnotatedDatasetXml
} = require('../utils/dataset-xml');
const { DATASET_COLORS, DEFAULT_DATASET_COLOR, SECTION_SIZE, resolveSectionSize, DEFAULT_LANGUAGES } = require('../constants/datasets');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { createDatasetsPermissionsRepository } = require('../repositories/datasets-permissions-repository');
const { createDatasetLlmCredentialsRepository } = require('../repositories/dataset-llm-credentials-repository');
const { createUsersRepository } = require('../repositories/users-repository');
const { ServiceError } = require('./service-error');
const { resolveExistingTempFilePath } = require('../utils/temp-storage');
const { toIntegerNormalized, toBoolean, toPositiveInteger } = require('../utils/validators');
const { assertDatasetAdminPermission } = require('./datasets-permissions-service');
const { calculatePercentagesFromSectionCounters } = require('../utils/dataset-progress');
const {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO
} = require('../contracts/dto-mappers');

/**
 * Builds the datasets service.
 *
 * @param {DatasetsServiceDeps} [dependencies]
 */
function createDatasetsService({
    datasetsRepository,
    datasetsPermissionsRepository,
    datasetLlmCredentialsRepository,
    readDataset,
    parseDatasetImport,
    buildDatasetXml,
    buildAnnotatedDatasetXml,
    readFileAsBuffer,
    usersRepository
} = {}) {
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        datasetsPermissionsRepository: datasetsPermissionsRepository || createDatasetsPermissionsRepository(),
        datasetLlmCredentialsRepository: datasetLlmCredentialsRepository || createDatasetLlmCredentialsRepository(),
        usersRepository: usersRepository || createUsersRepository(),
        readDataset: readDataset || defaultReadDataset,
        parseDatasetImport: parseDatasetImport || defaultParseDatasetImport,
        buildDatasetXml: buildDatasetXml || defaultBuildDatasetXml,
        buildAnnotatedDatasetXml: buildAnnotatedDatasetXml || defaultBuildAnnotatedDatasetXml,
        readFileAsBuffer: readFileAsBuffer || defaultReadFileAsBuffer
    };

    /**
     * Lists the datasets accessible to the user and enriches each row with counts.
     * @param {*} userId - User identifier.
     * @returns {Promise<Array<*>>} Enriched accessible datasets.
     */
    async function listAccessibleDatasets(userId) {
        const datasetRows = await deps.datasetsRepository.findAccessibleMany(userId);
        const reviewableCounts = await getReviewableCountsForDatasets(userId, datasetRows);
        const selfAnnotatedCounts = await getSelfAnnotatedReviewableCountsForDatasets(userId, datasetRows);
        const annotatedEntryCounts = await getAnnotatedEntryCountsForDatasets(datasetRows);
        const activeCredentialIds = await getActiveCredentialDatasetIds(datasetRows);
        return datasetRows.map((/** @type {*} */ row) => mapDatasetRecordToSource(row, {
            reviewableCount: reviewableCounts.get(row.id) || 0,
            selfAnnotatedReviewableCount: selfAnnotatedCounts.get(row.id) || 0,
            annotatedEntries: annotatedEntryCounts.has(row.id)
                ? annotatedEntryCounts.get(row.id)
                : null,
            hasActiveCredential: activeCredentialIds.has(Number(row.id))
        }));
    }

    /**
     * Returns the set of dataset ids (from `datasetRows`) that have at least
     * one active LLM credential. Used by `listAccessibleDatasets` to gate the
     * "Anotar" button on the frontend (and mirrors the backend enforcement in
     * `continueDatasetService`).
     *
     * @param {Array<*>} datasetRows - Accessible datasets.
     * @returns {Promise<Set<number>>}
     */
    async function getActiveCredentialDatasetIds(datasetRows) {
        if (typeof deps.datasetLlmCredentialsRepository.findDatasetIdsWithActiveCredential !== 'function')
            return new Set();

        const datasetIds = (datasetRows || [])
            .map(row => Number(row?.id))
            .filter(datasetId => Number.isInteger(datasetId) && datasetId > 0);

        if (!datasetIds.length)
            return new Set();

        return deps.datasetLlmCredentialsRepository.findDatasetIdsWithActiveCredential({ datasetIds });
    }

    /**
     * Gets the number of annotated entries per dataset.
     * @param {Array<*>} datasetRows - Accessible datasets.
     * @returns {Promise<Map<number, number>>} Counts per dataset.
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
     * Gets the number of entries pending review for the listed datasets.
     * @param {number} userId - Current user.
     * @param {Array<*>} datasetRows - Accessible datasets.
     * @returns {Promise<Map<number, number>>} Counts per dataset.
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

        const activeReviews = await deps.datasetsRepository.findActiveReviewDatasetIdsForReviewer({ userId, datasetIds });
        for (const row of activeReviews || []) {
            const datasetId = Number(row?.entry?.datasetId ?? row?.datasetId);
            if (!Number.isInteger(datasetId) || datasetId <= 0)
                continue;
            counts.set(datasetId, (counts.get(datasetId) || 0) + 1);
        }

        return counts;
    }

    /**
     * Per-dataset count of entries that would be reviewable but are excluded
     * because the current user annotated them (the self-review governance rule).
     * It explains a disabled review button: when this is the *only* reason
     * `reviewableCount` is 0, the card tells the reviewer they annotated every
     * pending entry themselves instead of the generic "nothing to review".
     *
     * @param {number} userId - Current user.
     * @param {Array<*>} datasetRows - Accessible datasets.
     * @returns {Promise<Map<number, number>>} Counts per dataset.
     */
    async function getSelfAnnotatedReviewableCountsForDatasets(userId, datasetRows) {
        if (typeof deps.datasetsRepository.findSelfAnnotatedReviewableDatasetIds !== 'function')
            return new Map();

        const datasetIds = (datasetRows || [])
            .map(row => Number(row?.id))
            .filter(datasetId => Number.isInteger(datasetId) && datasetId > 0);

        if (!datasetIds.length)
            return new Map();

        const rows = await deps.datasetsRepository.findSelfAnnotatedReviewableDatasetIds({ userId, datasetIds });
        const counts = new Map();

        for (const row of rows || []) {
            const datasetId = Number(row?.datasetId);
            if (!Number.isInteger(datasetId) || datasetId <= 0)
                continue;
            counts.set(datasetId, (counts.get(datasetId) || 0) + 1);
        }

        return counts;
    }

    /**
     * Lists the accessible datasets already mapped to a client-ready DTO.
     * @param {*} userId - User identifier.
     * @returns {Promise<Array<*>>} List of DTOs.
     */
    async function listAccessibleDatasetItems(userId) {
        const datasets = await listAccessibleDatasets(userId);
        return mapDatasetListDTOs(datasets);
    }

    /**
     * Retrieves a user-accessible dataset and enriches it with progress metadata.
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<*>} Dataset DTO.
     */
    async function getAccessibleDatasetItem(userId, datasetId) {
        const datasetRow = await deps.datasetsRepository.findAccessibleById({ userId, datasetId });
        if (!datasetRow)
            throw ServiceError.datasetNotFound();

        const annotatedEntryCounts = await getAnnotatedEntryCountsForDatasets([datasetRow]);
        // Compute the reviewable count for this dataset too, so the single-dataset
        // DTO reports `review.reviewAvailable` consistently with the list endpoint
        // (otherwise a freshly reviewable section would never surface the Revisión
        // affordance when the card is read on its own — P5).
        const reviewableCounts = await getReviewableCountsForDatasets(userId, [datasetRow]);
        const selfAnnotatedCounts = await getSelfAnnotatedReviewableCountsForDatasets(userId, [datasetRow]);
        const activeCredentialIds = await getActiveCredentialDatasetIds([datasetRow]);
        return mapDatasetListDTO(
            mapDatasetRecordToSource(datasetRow, {
                annotatedEntries: annotatedEntryCounts.has(datasetRow.id)
                    ? annotatedEntryCounts.get(datasetRow.id)
                    : null,
                reviewableCount: reviewableCounts.get(datasetRow.id) || 0,
                selfAnnotatedReviewableCount: selfAnnotatedCounts.get(datasetRow.id) || 0,
                hasActiveCredential: activeCredentialIds.has(Number(datasetRow.id))
            }),
            datasetId
        );
    }

    /**
     * Returns the dataset section requested by the user.
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @param {*} sectionNumber - Section number (1-indexed).
     * @returns {Promise<*>} DTO with dataset, section and entries.
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

        const sectionSize = resolveSectionSize(datasetRow);
        const totalSections = Math.ceil(annotationEntries.length / sectionSize);
        if (sectionNumber > totalSections) {
            throw new ServiceError('La sección solicitada no existe.', {
                status: 404,
                code: 'dataset_section_not_found'
            });
        }

        const startIndex = (sectionNumber - 1) * sectionSize;
        const sectionEntries = annotationEntries.slice(startIndex, startIndex + sectionSize);

        return mapDatasetSectionDTO({
            datasetId: datasetRow.id,
            datasetName: datasetRow.name,
            totalSections,
            sectionIndex: sectionNumber,
            sectionSize,
            totalEntries: sectionEntries.length,
            startEntry: startIndex + 1,
            endEntry: startIndex + sectionEntries.length,
            isLastSection: sectionNumber === totalSections,
            entries: sectionEntries
        });
    }

    /**
     * Rebuilds the dataset XML from the persisted entries.
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<string>} Dataset XML text.
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
     * Rebuilds the dataset XML and wraps it as a named download.
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<{filename:string, body:string, contentType:string}>} Download-ready payload.
     */
    async function getAccessibleDatasetXmlDownload(userId, datasetId) {
        const datasetRow = await getAccessibleDatasetGraph(userId, datasetId);

        if (!hasPersistedEntries(datasetRow)) {
            throw new ServiceError('El dataset no contiene entries.', {
                status: 404,
                code: 'dataset_without_entries'
            });
        }

        return {
            filename: `${datasetRow.name}.xml`,
            body: deps.buildDatasetXml(datasetRow.entries.map(mapPersistedEntryToXmlEntry)),
            contentType: 'application/xml; charset=utf-8'
        };
    }

    /**
     * Downloads the extended XML (original + Spanish annotations) when the
     * dataset is 100% complete. The canonical completion condition is verified
     * on the backend even though the UI already disables the button.
     *
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<{filename:string, body:string, contentType:string}>} Download-ready payload.
     */
    async function getAccessibleDatasetAnnotatedXmlDownload(userId, datasetId) {
        const datasetRow = await getAccessibleDatasetGraphWithAnnotations(userId, datasetId);

        if (!hasPersistedEntries(datasetRow)) {
            throw new ServiceError('El dataset no contiene entries.', {
                status: 404,
                code: 'dataset_without_entries'
            });
        }

        const totalSections = Math.ceil(Number(datasetRow.totalEntries || 0) / resolveSectionSize(datasetRow));
        const sectionsCompleted = Number(datasetRow.sectionsCompleted || 0);
        const sectionsPending = Number(datasetRow.sectionsPending || 0);
        if (sectionsCompleted !== totalSections || sectionsPending !== 0) {
            throw new ServiceError('El dataset todavía no está completado al 100%.', {
                status: 409,
                code: 'dataset_not_completed'
            });
        }

        return {
            filename: `${datasetRow.name}-extended.xml`,
            body: deps.buildAnnotatedDatasetXml(
                datasetRow.entries.map(mapPersistedEntryToAnnotatedXmlEntry)
            ),
            contentType: 'application/xml; charset=utf-8'
        };
    }

    /**
     * Creates a dataset owned by the user from an uploaded XML file.
     * @param {*} userId - Owning user identifier.
     * @param {*} file - Uploaded file (multer): { filename, originalname }.
     * @param {*} [options] - Dataset creation options.
     * @returns {Promise<*>} DTO of the created dataset.
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

        // The dataset name is requested from the user on creation; it defaults
        // to the uploaded file name (without `.xml`) in the UI. We honour the
        // provided name when present, otherwise derive it from the file.
        const requestedName = normalizeDatasetName(options.name);
        const name = requestedName || nameFromFilename(file.originalname);
        assertValidDatasetName(name);
        await assertDatasetNameAvailable(userId, name);

        const description = normalizeDatasetDescription(options.description);
        assertValidDatasetDescription(description);

        const totalEntries = datasetDto.entries.length;
        const totalSections = Math.ceil(totalEntries / datasetOptions.sectionSize);

        const datasetRow = await deps.datasetsRepository.createOwnedDataset({
            userId,
            datasetData: {
                name,
                description,
                totalEntries,
                languages: JSON.stringify(DEFAULT_LANGUAGES),
                llmMode: datasetOptions.llmMode,
                isReviewEnabled: datasetOptions.isReviewEnabled,
                hasAdditionalReviews: datasetOptions.hasAdditionalReviews,
                sectionSize: datasetOptions.sectionSize,
                sectionsCompleted: 0,
                sectionsInReview: 0,
                sectionsPending: totalSections
            },
            entryRecords: datasetImport.entries,
            /**
             * Resolves the color CSS class for a dataset based on its id.
             * @param {*} datasetId - Identifier of the persisted dataset.
             * @returns {string} Color CSS class.
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
     * Fully deletes a dataset administrable by the actor.
     * @param {number} actorId - Current user.
     * @param {number} datasetId - Dataset.
     * @returns {Promise<*>} Deletion result.
     */
    async function deleteDataset(actorId, datasetId) {
        await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);
        await deps.datasetsRepository.deleteDatasetRecursively({ datasetId });

        return {
            ok: true,
            datasetId
        };
    }

    /**
     * Renames a dataset administrable by the actor, enforcing the per-owner
     * name-uniqueness invariant. The duplicate check runs against the datasets
     * owned by *this dataset's owner* (not necessarily the acting admin), so the
     * invariant "no owner has two datasets with the same name" holds regardless
     * of who performs the rename.
     *
     * @param {number} actorId - Current user.
     * @param {number} datasetId - Dataset.
     * @param {*} rawName - Requested new name.
     * @returns {Promise<*>} Rename result.
     */
    async function renameDataset(actorId, datasetId, rawName) {
        await assertDatasetAdminPermission(deps.datasetsPermissionsRepository, actorId, datasetId);

        const name = normalizeDatasetName(rawName);
        assertValidDatasetName(name);

        const ownerUserId = await resolveDatasetOwnerId(datasetId, actorId);
        await assertDatasetNameAvailable(ownerUserId, name, datasetId);

        const updated = await deps.datasetsRepository.renameDataset({ datasetId, name });

        return {
            ok: true,
            datasetId,
            dataset: {
                datasetId,
                name: updated && typeof updated.name === 'string' ? updated.name : name
            }
        };
    }

    /**
     * Throws when the (owner, name) pair would collide with an existing owned
     * dataset. No-op when the repository does not expose the lookup (keeps unit
     * tests that stub a minimal repository unaffected).
     *
     * @param {number} ownerUserId - Owner whose datasets are checked.
     * @param {string} name - Candidate name.
     * @param {number} [excludeDatasetId] - Dataset id to ignore (rename case).
     * @returns {Promise<void>}
     */
    async function assertDatasetNameAvailable(ownerUserId, name, excludeDatasetId) {
        if (typeof deps.datasetsRepository.findOwnedDatasetWithSameName !== 'function')
            return;

        const existing = await deps.datasetsRepository.findOwnedDatasetWithSameName({
            userId: ownerUserId,
            name,
            excludeDatasetId
        });

        if (existing && existing.id !== excludeDatasetId) {
            throw new ServiceError('Ya tienes un dataset con ese nombre. Elige otro.', {
                status: 409,
                code: 'duplicate_dataset_name'
            });
        }
    }

    /**
     * Resolves the owning user of a dataset, falling back to `fallbackUserId`
     * when the repository cannot resolve an owner (or does not expose the
     * lookup, for minimal test stubs).
     *
     * @param {number} datasetId - Dataset.
     * @param {number} fallbackUserId - User id used when no owner is found.
     * @returns {Promise<number>}
     */
    async function resolveDatasetOwnerId(datasetId, fallbackUserId) {
        if (typeof deps.datasetsRepository.findDatasetOwnerUserId !== 'function')
            return fallbackUserId;

        const ownerId = await deps.datasetsRepository.findDatasetOwnerUserId({ datasetId });
        return Number.isInteger(ownerId) && ownerId > 0 ? ownerId : fallbackUserId;
    }

    /**
     * Retrieves the dataset's full graph if it is accessible to the user.
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<*>} Dataset with its entries and relations.
     */
    async function getAccessibleDatasetGraph(userId, datasetId) {
        const datasetRow = await deps.datasetsRepository.findAccessibleDatasetGraphById({ userId, datasetId });

        if (!datasetRow)
            throw ServiceError.datasetNotFound();

        return datasetRow;
    }

    /**
     * Retrieves the dataset's full graph with its annotations per entry.
     *
     * @param {*} userId - User identifier.
     * @param {*} datasetId - Dataset identifier.
     * @returns {Promise<*>} Dataset with its entries, relations and annotations.
     */
    async function getAccessibleDatasetGraphWithAnnotations(userId, datasetId) {
        const datasetRow = await deps.datasetsRepository.findAccessibleDatasetGraphWithAnnotationsById({ userId, datasetId });

        if (!datasetRow)
            throw ServiceError.datasetNotFound();

        return datasetRow;
    }

    /**
     * Gets annotation entries from the dataset's persisted entries.
     * @param {*} datasetRow - Dataset row with persisted entries.
     * @returns {Array<*>} Annotation entries ready for the client.
     */
    function getAnnotationEntries(datasetRow) {
        if (!hasPersistedEntries(datasetRow))
            return [];

        return datasetRow.entries.map(mapPersistedEntryToAnnotationEntry);
    }

    return {
        listAccessibleDatasetItems,
        getAccessibleDatasetItem,
        getAccessibleDatasetSection,
        getAccessibleDatasetText,
        getAccessibleDatasetXmlDownload,
        getAccessibleDatasetAnnotatedXmlDownload,
        createDataset,
        renameDataset,
        deleteDataset
    };
}

/**
 * Indicates whether the dataset has at least one persisted entry.
 * @param {*} datasetRow - Dataset row loaded with its entries.
 * @returns {boolean} True if there are entries.
 */
function hasPersistedEntries(datasetRow) {
    return Array.isArray(datasetRow && datasetRow.entries)
        && datasetRow.entries.length > 0;
}

/**
 * Extracts the common header of a persisted entry (eid, category, shape,
 * shapeType, size). Used as a base by the mappers that derive into
 * annotation/XML/annotated forms.
 *
 * @param {*} entryRecord - Entry as Prisma returns it.
 * @returns {{eid:*, category:string, shape:*, shapeType:*, size:*}}
 */
function extractEntryHead(entryRecord) {
    return {
        eid: entryRecord.eid,
        category: entryRecord.category || '',
        shape: entryRecord.shape ?? null,
        shapeType: entryRecord.shapeType ?? null,
        size: entryRecord.size
    };
}

/**
 * Adapts a persisted entry to the canonical model consumed by the annotation
 * screen (`EntryContextDTO`).
 *
 * Contract decision: the annotator always sees the dataset's *original*
 * triples; `modified` triplesets are reserved for future flows and are not
 * exposed here.
 *
 * @param {*} entryRecord - Entry as Prisma returns it.
 * @returns {*} Annotation entry prepared for the client.
 */
function mapPersistedEntryToAnnotationEntry(entryRecord) {
    return {
        entryId: entryRecord.eid,
        category: entryRecord.category || '',
        shape: entryRecord.shape ?? null,
        shapeType: entryRecord.shapeType ?? null,
        size: entryRecord.size,
        triples: flattenPersistedTriplesets(entryRecord.triplesets, 'original'),
        englishSentences: entryRecord.lexes
            .filter((/** @type {*} */ lex) => lex.lang === 'en')
            .map((/** @type {*} */ lex) => lex.text.trim())
            .filter(Boolean)
    };
}

/**
 * Adapts a persisted entry to the model understood by `buildDatasetXml`.
 * @param {*} entryRecord - Entry as Prisma returns it.
 * @returns {*} Structure compatible with the XML serializer.
 */
function mapPersistedEntryToXmlEntry(entryRecord) {
    return {
        ...extractEntryHead(entryRecord),
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
            ...pickTripleFields(link)
        })),
        links: entryRecord.links.map((/** @type {*} */ link) => ({
            direction: link.direction,
            ...pickTripleFields(link)
        }))
    };
}

/**
 * Adapts a persisted entry (with `annotations`) to the model understood by
 * `buildAnnotatedDatasetXml`.
 *
 * @param {*} entryRecord - Entry as Prisma returns it.
 * @returns {*} Structure compatible with the extended XML serializer.
 */
function mapPersistedEntryToAnnotatedXmlEntry(entryRecord) {
    return {
        ...mapPersistedEntryToXmlEntry(entryRecord),
        annotations: (entryRecord.annotations || []).map((/** @type {*} */ annotation) => ({
            sentenceIndex: Number(annotation.sentenceIndex) || 0,
            sentence: typeof annotation.sentence === 'string' ? annotation.sentence : ''
        }))
    };
}

/**
 * Extracts the three canonical fields of a persisted triple (subject,
 * predicate, object). Also used as a base for mapping `dbpediaLinks` and
 * `links`, which add `direction`.
 *
 * @param {*} triple - Persisted row with subject/predicate/object.
 * @returns {{subject:*, predicate:*, object:*}}
 */
function pickTripleFields(triple) {
    return {
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object
    };
}

/**
 * Filters persisted triplesets by type and normalizes them for XML.
 * @param {*} triplesets - Persisted collection.
 * @param {*} type - Tripleset type ("original" | "modified").
 * @returns {Array<*>} Filtered triplesets with their triples.
 */
function filterPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter((/** @type {*} */ tripleset) => tripleset.type === type)
        .map((/** @type {*} */ tripleset) => ({
            triples: tripleset.triples.map(pickTripleFields)
        }));
}

/**
 * Flattens persisted triplesets by type into a flat list of triples.
 * @param {*} triplesets - Persisted collection.
 * @param {*} type - Tripleset type ("original" | "modified").
 * @returns {Array<*>} Flat triples.
 */
function flattenPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter((/** @type {*} */ tripleset) => tripleset.type === type)
        .flatMap((/** @type {*} */ tripleset) => tripleset.triples.map(pickTripleFields));
}

/**
 * Flattens an enriched dataset row into the base object used by the DTO mappers.
 * @param {*} datasetRow - Persisted dataset row.
 * @param {*} [options] - Additional counts computed separately (reviewableCount, annotatedEntries).
 * @returns {*} Base object for building DTOs.
 */
function mapDatasetRecordToSource(datasetRow, { reviewableCount = 0, selfAnnotatedReviewableCount = 0, annotatedEntries = /** @type {*} */ (null), hasActiveCredential } = {}) {
    const isReviewEnabled = Boolean(datasetRow.isReviewEnabled);
    const percentages = calculatePercentagesFromSectionCounters({
        sectionsCompleted: datasetRow.sectionsCompleted,
        sectionsInReview: datasetRow.sectionsInReview,
        sectionsPending: datasetRow.sectionsPending,
        reviewEnabled: isReviewEnabled,
        annotatedEntries,
        totalEntries: datasetRow.totalEntries,
        sectionSize: resolveSectionSize(datasetRow)
    });

    /** @type {Record<string, any>} */
    const source = {
        id: datasetRow.id,
        name: datasetRow.name,
        description: typeof datasetRow.description === 'string' && datasetRow.description.length > 0
            ? datasetRow.description
            : null,
        totalEntries: datasetRow.totalEntries,
        languages: parseLanguages(datasetRow.languages),
        completedPercent: percentages.completed,
        withoutReviewPercent: percentages.withoutReview,
        remainPercent: percentages.remaining,
        permissions: mapCurrentUserDatasetPermissions(datasetRow),
        review: mapCurrentUserReviewState(datasetRow, percentages, reviewableCount, selfAnnotatedReviewableCount),
        options: {
            llmMode: datasetRow.llmMode || 'none',
            isReviewEnabled,
            hasAdditionalReviews: Boolean(datasetRow.hasAdditionalReviews)
        },
        colorClass: typeof datasetRow.colorClass === 'string' && datasetRow.colorClass.trim().length > 0
            ? datasetRow.colorClass
            : DEFAULT_DATASET_COLOR
    };

    if (typeof hasActiveCredential === 'boolean')
        source.hasActiveCredential = hasActiveCredential;

    return source;
}

/**
 * Normalizes options received during dataset creation.
 * @param {*} options - Raw options.
 * @returns {*} Options ready to persist.
 */
function normalizeDatasetCreationOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    const rawLlmMode = typeof source.llmMode === 'string'
        ? source.llmMode.trim().toLowerCase()
        : '';
    const llmMode = ['generation', 'correction', 'none'].includes(rawLlmMode)
        ? rawLlmMode
        : 'none';

    // Section size is an optional, declarative per-dataset value (US: P4).
    // Anything missing or non-positive clamps to the default (10).
    const sectionSize = toPositiveInteger(source.sectionSize) ?? SECTION_SIZE;

    let isReviewEnabled = toBoolean(source.isReviewEnabled ?? source.reviewEnabled, false);
    let hasAdditionalReviews = toBoolean(source.hasAdditionalReviews ?? source.additionalReviews, false);

    // Defensive enforcement of the creation invariants (P6). Policy: NORMALISE,
    // never reject — a crafted request cannot persist an illegal combination.
    //   R2: llmMode = 'correction' ⇒ review ∧ additional reviews (both forced on).
    //   R1: review disabled ⇒ additional reviews forced off.
    if (llmMode === 'correction') {
        isReviewEnabled = true;
        hasAdditionalReviews = true;
    } else if (!isReviewEnabled) {
        hasAdditionalReviews = false;
    }

    return {
        llmMode,
        isReviewEnabled,
        hasAdditionalReviews,
        sectionSize
    };
}

/**
 * Maps the current user's review state for rendering actions.
 * @param {*} datasetRow - Persisted dataset.
 * @param {*} percentages - Computed percentages.
 * @param {number} reviewableCount - Entries pending review.
 * @param {number} [selfAnnotatedReviewableCount] - Entries excluded from the
 *   reviewer's queue solely because they annotated them (self-review rule).
 * @returns {*} Review state.
 */
function mapCurrentUserReviewState(datasetRow, percentages, reviewableCount, selfAnnotatedReviewableCount = 0) {
    const permissions = mapCurrentUserDatasetPermissions(datasetRow);
    const safeCount = toIntegerNormalized(reviewableCount);
    const selfAnnotatedCount = toIntegerNormalized(selfAnnotatedReviewableCount);
    const canReview = Boolean(permissions && permissions.reviewer);
    const completed = Number(percentages?.completed || 0) >= 100;
    const showReviewButton = canReview && !completed;

    return {
        canReview,
        showReviewButton,
        reviewAvailable: showReviewButton && safeCount > 0,
        reviewableCount: safeCount,
        // The button is shown but disabled *only* because every candidate entry
        // was annotated by this reviewer — lets the card explain why instead of
        // the generic "nothing to review" (self-review rule, USER-STORIES §US-13).
        blockedBySelfAnnotation: showReviewButton && safeCount === 0 && selfAnnotatedCount > 0
    };
}

/**
 * Maps the current user's permissions included with the dataset.
 * @param {*} datasetRow - Persisted dataset.
 * @returns {*} Permissions, or null.
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
 * Parses a dataset's `languages` column (JSON text or array) into a list of languages.
 * @param {*} value - Raw persisted value.
 * @returns {Array<string>} Normalized languages, or the default.
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
 * Reads the binary content of an uploaded temporary file from disk.
 * @param {*} filename - Temporary file name.
 * @returns {Buffer} Binary content.
 */
function defaultReadFileAsBuffer(filename) {
    return readFileSync(resolveExistingTempFilePath(filename));
}

/** Maximum length of a dataset name (mirrors `Dataset.name` `VarChar(128)`). */
const DATASET_NAME_MAX_LENGTH = 128;
/** Maximum length of a dataset description (mirrors `Dataset.description` `VarChar(512)`). */
const DATASET_DESCRIPTION_MAX_LENGTH = 512;

/**
 * Derives a canonical name for a dataset from its original filename.
 * @param {*} originalname - Original name of the uploaded file.
 * @returns {string} Normalized name.
 */
function nameFromFilename(originalname) {
    const name = (originalname || '').replace(/\.xml$/i, '').trim();
    if (!name || name.length > DATASET_NAME_MAX_LENGTH)
        return 'NUEVO DATASET';
    return name;
}

/**
 * Normalizes a requested dataset name: trims a string, otherwise returns `''`.
 * @param {*} rawName - Raw name (typically from the request body).
 * @returns {string} Trimmed name, or empty string.
 */
function normalizeDatasetName(rawName) {
    return typeof rawName === 'string' ? rawName.trim() : '';
}

/**
 * Validates a (already normalized) dataset name. Throws a `ServiceError` when
 * empty or longer than the column limit.
 * @param {string} name - Normalized name.
 * @returns {void}
 */
function assertValidDatasetName(name) {
    if (!name) {
        throw new ServiceError('El nombre del dataset es obligatorio.', {
            status: 400,
            code: 'invalid_dataset_name'
        });
    }

    if (name.length > DATASET_NAME_MAX_LENGTH) {
        throw new ServiceError(`El nombre del dataset no puede superar los ${DATASET_NAME_MAX_LENGTH} caracteres.`, {
            status: 400,
            code: 'dataset_name_too_long'
        });
    }
}

/**
 * Normalizes a dataset description: trims a string, returns `null` for empty
 * input. Any other type (undefined, missing) becomes `null`.
 * @param {*} rawDescription - Raw description (typically from the request body).
 * @returns {string|null} Trimmed description, or null when absent/blank.
 */
function normalizeDatasetDescription(rawDescription) {
    if (typeof rawDescription !== 'string')
        return null;
    const trimmed = rawDescription.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates a (already normalized) dataset description. Throws a `ServiceError`
 * when longer than the column limit. Empty / `null` is valid (optional field).
 * @param {string|null} description - Normalized description.
 * @returns {void}
 */
function assertValidDatasetDescription(description) {
    if (description === null)
        return;

    if (description.length > DATASET_DESCRIPTION_MAX_LENGTH) {
        throw new ServiceError(`La descripción del dataset no puede superar los ${DATASET_DESCRIPTION_MAX_LENGTH} caracteres.`, {
            status: 400,
            code: 'dataset_description_too_long'
        });
    }
}

module.exports = {
    createDatasetsService
};
