'use strict';

const defaultPrisma = require('../prisma/client');

function createDatasetsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    async function findAccessibleMany(idUser) {
        return deps.prisma.dataset.findMany({
            where: {
                permits: {
                    some: { idUser }
                }
            },
            orderBy: { idDataset: 'asc' }
        });
    }

    async function findAccessibleById({ idUser, idDataset }) {
        return deps.prisma.dataset.findFirst({
            where: {
                idDataset,
                permits: {
                    some: { idUser }
                }
            }
        });
    }

    async function findAccessibleDatasetGraphById({ idUser, idDataset }) {
        return deps.prisma.dataset.findFirst({
            where: {
                idDataset,
                permits: {
                    some: { idUser }
                }
            },
            include: {
                entryRecords: {
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

    async function createOwnedDataset({ idUser, datasetData, entryRecords = [], resolveColorClass }) {
        return deps.prisma.$transaction(async tx => {
            let createdDataset = await tx.dataset.create({
                data: datasetData
            });

            const colorClass = resolveColorClass(createdDataset.idDataset, createdDataset.colorClass);
            if (createdDataset.colorClass !== colorClass) {
                createdDataset = await tx.dataset.update({
                    where: { idDataset: createdDataset.idDataset },
                    data: { colorClass }
                });
            }

            await tx.permits.create({
                data: {
                    idDataset: createdDataset.idDataset,
                    idUser,
                    isOwned: true
                }
            });

            if (entryRecords.length > 0)
                await persistDatasetGraph(tx, createdDataset.idDataset, entryRecords);

            return createdDataset;
        });
    }

    return {
        findAccessibleMany,
        findAccessibleById,
        findAccessibleDatasetGraphById,
        createOwnedDataset
    };
}

async function persistDatasetGraph(tx, idDataset, entryRecords) {
    await tx.entry.createMany({
        data: entryRecords.map(entry => ({
            idDataset,
            eid: entry.eid,
            category: entry.category,
            shape: entry.shape,
            shapeType: entry.shapeType,
            size: entry.size,
            position: entry.position
        }))
    });

    const createdEntries = await tx.entry.findMany({
        where: { idDataset },
        select: {
            idEntry: true,
            position: true
        },
        orderBy: { position: 'asc' }
    });

    const entryIdByPosition = new Map(createdEntries.map(entry => [entry.position, entry.idEntry]));
    const triplesetRows = [];
    const lexRows = [];
    const dbpediaLinkRows = [];
    const linkRows = [];

    for (const entry of entryRecords) {
        const idEntry = entryIdByPosition.get(entry.position);
        if (!idEntry)
            throw new Error(`No se pudo resolver la entry persistida para la posición ${entry.position}.`);

        pushTriplesets(triplesetRows, idEntry, entry.originalTriplesets, 'original');
        pushTriplesets(triplesetRows, idEntry, entry.modifiedTriplesets, 'modified');

        for (const lex of entry.lexes) {
            lexRows.push({
                idEntry,
                lid: lex.lid,
                lang: lex.lang,
                comment: lex.comment,
                text: lex.text,
                position: lex.position
            });
        }

        for (const dbpediaLink of entry.dbpediaLinks) {
            dbpediaLinkRows.push({
                idEntry,
                direction: dbpediaLink.direction,
                subject: dbpediaLink.subject,
                predicate: dbpediaLink.predicate,
                object: dbpediaLink.object,
                position: dbpediaLink.position
            });
        }

        for (const link of entry.links) {
            linkRows.push({
                idEntry,
                direction: link.direction,
                subject: link.subject,
                predicate: link.predicate,
                object: link.object,
                position: link.position
            });
        }
    }

    if (triplesetRows.length > 0)
        await tx.tripleset.createMany({ data: triplesetRows });

    const createdTriplesets = triplesetRows.length > 0
        ? await tx.tripleset.findMany({
            where: {
                idEntry: {
                    in: [...entryIdByPosition.values()]
                }
            },
            select: {
                idTripleset: true,
                idEntry: true,
                type: true,
                position: true
            }
        })
        : [];

    const triplesetIdByKey = new Map(
        createdTriplesets.map(tripleset => [
            buildTriplesetKey(tripleset.idEntry, tripleset.type, tripleset.position),
            tripleset.idTripleset
        ])
    );

    const tripleRows = [];

    for (const entry of entryRecords) {
        const idEntry = entryIdByPosition.get(entry.position);
        if (!idEntry)
            continue;

        pushTriples(tripleRows, triplesetIdByKey, idEntry, entry.originalTriplesets, 'original');
        pushTriples(tripleRows, triplesetIdByKey, idEntry, entry.modifiedTriplesets, 'modified');
    }

    if (tripleRows.length > 0)
        await tx.triple.createMany({ data: tripleRows });

    if (lexRows.length > 0)
        await tx.lex.createMany({ data: lexRows });

    if (dbpediaLinkRows.length > 0)
        await tx.dbpedialink.createMany({ data: dbpediaLinkRows });

    if (linkRows.length > 0)
        await tx.link.createMany({ data: linkRows });
}

function pushTriplesets(targetRows, idEntry, triplesets, type) {
    for (const tripleset of triplesets) {
        targetRows.push({
            idEntry,
            type,
            position: tripleset.position
        });
    }
}

function pushTriples(targetRows, triplesetIdByKey, idEntry, triplesets, type) {
    for (const tripleset of triplesets) {
        const triplesetKey = buildTriplesetKey(idEntry, type, tripleset.position);
        const idTripleset = triplesetIdByKey.get(triplesetKey);

        if (!idTripleset)
            throw new Error(`No se pudo resolver el tripleset ${triplesetKey}.`);

        for (const triple of tripleset.triples) {
            targetRows.push({
                idTripleset,
                position: triple.position,
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            });
        }
    }
}

function buildTriplesetKey(idEntry, type, position) {
    return `${idEntry}:${type}:${position}`;
}

module.exports = {
    createDatasetsRepository
};
