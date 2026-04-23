'use strict';

const defaultPrisma = require('../prisma/client');

function createAnnotationsRepository({ prisma } = {}) {
    const deps = {
        prisma: prisma || defaultPrisma
    };

    async function replaceForAccessibleEntry({ idUser, idDataset, eid, sentences }) {
        return deps.prisma.$transaction(async tx => {
            const entry = await tx.entry.findFirst({
                where: {
                    idDataset,
                    eid,
                    dataset: {
                        permits: {
                            some: { idUser }
                        }
                    }
                },
                select: {
                    idEntry: true
                }
            });

            if (!entry)
                return null;

            await tx.annotation.deleteMany({
                where: {
                    idEntry: entry.idEntry,
                    idUser
                }
            });

            if (sentences.length > 0) {
                await tx.annotation.createMany({
                    data: sentences.map(sentence => ({
                        idEntry: entry.idEntry,
                        idUser,
                        sentenceIndex: sentence.sentenceIndex,
                        sentence: sentence.sentence,
                        rejectionReason: sentence.rejectionReason
                    }))
                });
            }

            return {
                idEntry: entry.idEntry,
                savedCount: sentences.length
            };
        });
    }

    return {
        replaceForAccessibleEntry
    };
}

module.exports = {
    createAnnotationsRepository
};
