'use strict';

const { readFileSync } = require('node:fs');
const {
    readDataset: defaultReadDataset,
    parseDatasetXml: defaultParseDatasetXml,
    parseDatasetImport: defaultParseDatasetImport,
    parseAnnotationEntries: defaultParseAnnotationEntries
} = require('../utils/xml-reader');
const { buildDatasetXml: defaultBuildDatasetXml } = require('../utils/dataset-xml');
const { DATASET_COLORS, SECTION_SIZE, DEFAULT_LANGUAGES } = require('../constants/datasets');
const { createDatasetsRepository } = require('../repositories/datasets-repository');
const { ServiceError } = require('./service-error');
const { resolveExistingTempFilePath } = require('../utils/temp-storage');
const {
    mapDatasetListDTO,
    mapDatasetListDTOs,
    mapDatasetSectionDTO
} = require('../contracts/dto-mappers');

function createDatasetsService({
    datasetsRepository,
    readDataset,
    parseDatasetXml,
    parseDatasetImport,
    parseAnnotationEntries,
    buildDatasetXml,
    readFileAsBuffer
} = {}) {
    const deps = {
        datasetsRepository: datasetsRepository || createDatasetsRepository(),
        readDataset: readDataset || defaultReadDataset,
        parseDatasetXml: parseDatasetXml || defaultParseDatasetXml,
        parseDatasetImport: parseDatasetImport || defaultParseDatasetImport,
        parseAnnotationEntries: parseAnnotationEntries || defaultParseAnnotationEntries,
        buildDatasetXml: buildDatasetXml || defaultBuildDatasetXml,
        readFileAsBuffer: readFileAsBuffer || defaultReadFileAsBuffer
    };

    async function listAccessibleDatasets(idUser) {
        const datasetRows = await deps.datasetsRepository.findAccessibleMany(idUser);
        return datasetRows.map(mapDatasetRecordToSource);
    }

    async function listAccessibleDatasetItems(idUser) {
        const datasets = await listAccessibleDatasets(idUser);
        return mapDatasetListDTOs(datasets);
    }

    async function getAccessibleDatasetItem(idUser, idDataset) {
        const datasetRow = await deps.datasetsRepository.findAccessibleById({ idUser, idDataset });
        if (!datasetRow)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        return mapDatasetListDTO(mapDatasetRecordToSource(datasetRow), idDataset);
    }

    async function getAccessibleDatasetSection(idUser, idDataset, sectionNumber) {
        const datasetRow = await getAccessibleDatasetGraph(idUser, idDataset);
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
                idDataset: datasetRow.idDataset,
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

    async function getAccessibleDatasetText(idUser, idDataset) {
        const datasetRow = await getAccessibleDatasetGraph(idUser, idDataset);

        if (hasPersistedEntries(datasetRow))
            return deps.buildDatasetXml(datasetRow.entryRecords.map(mapPersistedEntryToXmlEntry));

        deps.parseDatasetXml(datasetRow.content, `dataset ${idDataset}`);
        return datasetRow.content.toString('utf-8');
    }

    async function createDataset(idUser, file) {
        let datasetImport;
        let datasetDto;
        let contentBuffer;

        try {
            datasetDto = deps.readDataset(file.filename);
            contentBuffer = deps.readFileAsBuffer(file.filename);
            datasetImport = deps.parseDatasetImport(contentBuffer, file.originalname || file.filename);
        } catch (_error) {
            throw new ServiceError('El fichero XML no es válido o no contiene entries.', {
                status: 400,
                code: 'invalid_dataset_xml'
            });
        }

        const name = nameFromFilename(file.originalname);
        const entries = datasetDto.entries.length;

        const datasetRow = await deps.datasetsRepository.createOwnedDataset({
            idUser,
            datasetData: {
                name,
                entries,
                content: contentBuffer,
                languages: JSON.stringify(DEFAULT_LANGUAGES),
                completedPercent: 0,
                withoutReviewPercent: 0,
                remainPercent: 100
            },
            entryRecords: datasetImport.entries,
            resolveColorClass(idDataset) {
                if (!Number.isInteger(idDataset) || idDataset <= 0)
                    throw new Error('La base de datos no devolvió un idDataset válido.');

                return DATASET_COLORS[(idDataset - 1) % DATASET_COLORS.length];
            }
        });

        const dataset = mapDatasetRecordToSource(datasetRow);
        return {
            ok: true,
            idDataset: dataset.idDataset,
            dataset: mapDatasetListDTO(dataset, dataset.idDataset)
        };
    }

    async function getAccessibleDatasetGraph(idUser, idDataset) {
        const datasetRow = typeof deps.datasetsRepository.findAccessibleDatasetGraphById === 'function'
            ? await deps.datasetsRepository.findAccessibleDatasetGraphById({ idUser, idDataset })
            : await deps.datasetsRepository.findAccessibleById({ idUser, idDataset });

        if (!datasetRow)
            throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });

        return datasetRow;
    }

    function getAnnotationEntries(datasetRow) {
        if (hasPersistedEntries(datasetRow))
            return datasetRow.entryRecords.map(mapPersistedEntryToAnnotationEntry);

        return deps.parseAnnotationEntries(datasetRow.content);
    }

    return {
        listAccessibleDatasets,
        listAccessibleDatasetItems,
        getAccessibleDatasetItem,
        getAccessibleDatasetSection,
        getAccessibleDatasetText,
        createDataset
    };
}

function hasPersistedEntries(datasetRow) {
    return Array.isArray(datasetRow && datasetRow.entryRecords)
        && datasetRow.entryRecords.length > 0;
}

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
            .filter(lex => lex.lang === 'en')
            .map(lex => lex.text.trim())
            .filter(Boolean)
    };
}

function mapPersistedEntryToXmlEntry(entryRecord) {
    return {
        eid: entryRecord.eid,
        category: entryRecord.category || '',
        shape: entryRecord.shape ?? null,
        shapeType: entryRecord.shapeType ?? null,
        size: entryRecord.size,
        originalTriplesets: filterPersistedTriplesets(entryRecord.triplesets, 'original'),
        modifiedTriplesets: filterPersistedTriplesets(entryRecord.triplesets, 'modified'),
        lexes: entryRecord.lexes.map(lex => ({
            lid: lex.lid,
            lang: lex.lang,
            comment: lex.comment,
            text: lex.text
        })),
        dbpediaLinks: entryRecord.dbpediaLinks.map(link => ({
            direction: link.direction,
            subject: link.subject,
            predicate: link.predicate,
            object: link.object
        })),
        links: entryRecord.links.map(link => ({
            direction: link.direction,
            subject: link.subject,
            predicate: link.predicate,
            object: link.object
        }))
    };
}

function filterPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter(tripleset => tripleset.type === type)
        .map(tripleset => ({
            triples: tripleset.triples.map(triple => ({
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            }))
        }));
}

function flattenPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter(tripleset => tripleset.type === type)
        .flatMap(tripleset => tripleset.triples.map(triple => ({
            subject: triple.subject,
            predicate: triple.predicate,
            object: triple.object
        })));
}

function mapDatasetRecordToSource(datasetRow) {
    return {
        idDataset: datasetRow.idDataset,
        name: datasetRow.name,
        triplesRDF: datasetRow.entries,
        languages: parseLanguages(datasetRow.languages),
        completedPercent: toPercent(datasetRow.completedPercent, 0),
        withoutReviewPercent: toPercent(datasetRow.withoutReviewPercent, 0),
        remainPercent: toPercent(datasetRow.remainPercent, 100),
        colorClass: typeof datasetRow.colorClass === 'string' && datasetRow.colorClass.trim().length > 0
            ? datasetRow.colorClass
            : 'dataset-purple'
    };
}

function parseLanguages(value) {
    if (Array.isArray(value))
        return value.filter(item => typeof item === 'string' && item.trim().length > 0);

    if (typeof value !== 'string' || value.trim().length === 0)
        return ['Spanish', 'English'];

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed))
            return ['Spanish', 'English'];

        const normalized = parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
        return normalized.length > 0 ? normalized : ['Spanish', 'English'];
    } catch (_error) {
        return ['Spanish', 'English'];
    }
}

function toPercent(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    if (parsed < 0)
        return 0;
    if (parsed > 100)
        return 100;
    return parsed;
}

function defaultReadFileAsBuffer(filename) {
    return readFileSync(resolveExistingTempFilePath(filename));
}

function nameFromFilename(originalname) {
    const name = (originalname || '').replace(/\.xml$/i, '').trim();
    if (!name || name.length > 128)
        return 'NUEVO DATASET';
    return name;
}

module.exports = {
    createDatasetsService
};
