'use strict';

/**
 * Creates a review-only clone of Experiment 2 for an independent human pass.
 *
 * The source annotations are the original Gemini 2.5 Flash annotations stored
 * in the annotated XML backup. They are inserted as annotations authored by a
 * technical user so the real reviewer can correct them through /reviewer.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const prisma = require('../prisma/client');
const { createDatasetsService } = require('../services/datasets-service');
const { createPasswordHasher } = require('../services/password-hasher');
const {
    createBenchmarkXmlParser,
    toArray,
    nodeText
} = require('../utils/xml-format');

const DATASET_NAME = process.env.EXPERIMENT_USER_DATASET_NAME || 'experiment-2-user';
const REVIEWER_EMAIL = process.env.EXPERIMENT_REVIEWER_EMAIL || 'a@a.es';
const BOT_EMAIL = process.env.EXPERIMENT_GEMINI_ANNOTATOR_EMAIL || 'gemini-2.5-flash@lanbench.local';
const SECTION_SIZE = 33;
const TOTAL_SECTIONS = 3;
const SOURCE_XML = path.join(__dirname, '..', 'test-datasets', 'experiment-dataset.xml');
const GEMINI_ANNOTATED_XML = path.join(
    __dirname,
    '..',
    'documentation',
    'eval-output',
    'experiment-dataset-gemini-2.5-flash-annotated.xml'
);

function assertFileExists(filePath) {
    if (!fs.existsSync(filePath))
        throw new Error(`Missing required file: ${path.relative(process.cwd(), filePath)}`);
}

function parseGeminiAnnotations() {
    const xml = fs.readFileSync(GEMINI_ANNOTATED_XML, 'utf8');
    const parser = createBenchmarkXmlParser();
    const parsed = parser.parse(xml);
    const rawEntries = toArray(parsed?.benchmark?.entries?.entry);
    const annotationsByEid = new Map();

    for (const rawEntry of rawEntries) {
        const eid = Number(rawEntry?.['@_eid']);
        if (!Number.isInteger(eid) || eid <= 0)
            throw new Error('Gemini annotated XML contains an entry without a valid eid.');

        const sentences = toArray(rawEntry.lex)
            .filter(lex => String(lex?.['@_lang'] || '').trim().toLowerCase() === 'es')
            .map(lex => nodeText(lex).trim())
            .filter(Boolean);

        if (sentences.length === 0)
            throw new Error(`Entry eid=${eid} has no Gemini Spanish annotation.`);

        annotationsByEid.set(eid, sentences);
    }

    if (annotationsByEid.size !== 99)
        throw new Error(`Expected 99 annotated entries, found ${annotationsByEid.size}.`);

    return annotationsByEid;
}

async function resolveReviewer() {
    const requested = await prisma.user.findUnique({
        where: { email: REVIEWER_EMAIL },
        select: { id: true, email: true }
    });
    if (requested)
        return requested;

    const moderator = await prisma.user.findFirst({
        where: { isModerator: true },
        orderBy: { id: 'asc' },
        select: { id: true, email: true }
    });
    if (moderator)
        return moderator;

    const firstUser = await prisma.user.findFirst({
        orderBy: { id: 'asc' },
        select: { id: true, email: true }
    });
    if (firstUser)
        return firstUser;

    throw new Error('No local user exists to own/review the dataset.');
}

async function ensureTechnicalAnnotator() {
    const existing = await prisma.user.findUnique({
        where: { email: BOT_EMAIL },
        select: { id: true, email: true }
    });
    if (existing)
        return existing;

    const passwordHasher = createPasswordHasher();
    const password = await passwordHasher.hashPassword(crypto.randomUUID());
    return prisma.user.create({
        data: {
            email: BOT_EMAIL,
            password,
            isModerator: false
        },
        select: { id: true, email: true }
    });
}

async function assertDatasetNameAvailable() {
    const existing = await prisma.dataset.findFirst({
        where: { name: DATASET_NAME },
        select: { id: true, name: true }
    });
    if (existing)
        throw new Error(`Dataset '${DATASET_NAME}' already exists with id ${existing.id}. Refusing to overwrite it.`);
}

async function createDataset(owner) {
    const datasetsService = createDatasetsService({
        readFileAsBuffer: fs.readFileSync
    });

    const created = await datasetsService.createDataset(
        owner.id,
        {
            filename: SOURCE_XML,
            originalname: `${DATASET_NAME}.xml`
        },
        {
            name: DATASET_NAME,
            description: 'Experiment 2 user correction pass seeded with original Gemini 2.5 Flash annotations.',
            llmMode: 'none',
            isReviewEnabled: true,
            hasAdditionalReviews: false,
            sectionSize: SECTION_SIZE
        }
    );

    return Number(created?.datasetId || created?.id);
}

async function seedGeminiAnnotations({ datasetId, reviewerId, annotatorId, annotationsByEid }) {
    const entries = await prisma.entry.findMany({
        where: { datasetId },
        orderBy: { position: 'asc' },
        select: { id: true, eid: true }
    });
    if (entries.length !== 99)
        throw new Error(`Expected 99 imported entries, found ${entries.length}.`);

    const rows = [];
    for (const entry of entries) {
        const sentences = annotationsByEid.get(Number(entry.eid));
        if (!sentences)
            throw new Error(`No Gemini annotation found for imported entry eid=${entry.eid}.`);

        sentences.forEach((sentence, sentenceIndex) => {
            rows.push({
                entryId: entry.id,
                datasetId,
                userId: annotatorId,
                sentenceIndex,
                sentence,
                rejectionReason: null,
                origin: 'llm',
                isAcceptedFirstTry: true
            });
        });
    }

    await prisma.$transaction(async (tx) => {
        await tx.annotation.createMany({ data: rows });
        await tx.entry.updateMany({
            where: { datasetId },
            data: { status: 'annotated' }
        });
        await tx.dataset.update({
            where: { id: datasetId },
            data: {
                llmMode: 'none',
                isReviewEnabled: true,
                hasAdditionalReviews: false,
                sectionSize: SECTION_SIZE,
                sectionsCompleted: 0,
                sectionsInReview: TOTAL_SECTIONS,
                sectionsPending: 0
            }
        });
        await tx.permit.update({
            where: {
                datasetId_userId: {
                    datasetId,
                    userId: reviewerId
                }
            },
            data: {
                isAnnotator: false,
                isReviewer: true,
                isAdmin: true
            }
        });
    });

    return rows.length;
}

async function getVerification(datasetId, reviewerId) {
    const [dataset, annotations, reviewable] = await Promise.all([
        prisma.dataset.findUnique({
            where: { id: datasetId },
            select: {
                id: true,
                name: true,
                totalEntries: true,
                llmMode: true,
                isReviewEnabled: true,
                hasAdditionalReviews: true,
                sectionsCompleted: true,
                sectionsInReview: true,
                sectionsPending: true,
                sectionSize: true
            }
        }),
        prisma.annotation.count({ where: { datasetId } }),
        prisma.entry.count({
            where: {
                datasetId,
                status: 'annotated',
                dataset: { isReviewEnabled: true },
                annotations: { none: { userId: reviewerId } },
                reviews: {
                    none: {
                        status: { in: ['pending', 'in_progress'] }
                    }
                }
            }
        })
    ]);

    return { dataset, annotations, reviewable };
}

async function main() {
    assertFileExists(SOURCE_XML);
    assertFileExists(GEMINI_ANNOTATED_XML);
    await assertDatasetNameAvailable();

    const annotationsByEid = parseGeminiAnnotations();
    const reviewer = await resolveReviewer();
    const technicalAnnotator = await ensureTechnicalAnnotator();
    const datasetId = await createDataset(reviewer);
    const annotationsInserted = await seedGeminiAnnotations({
        datasetId,
        reviewerId: reviewer.id,
        annotatorId: technicalAnnotator.id,
        annotationsByEid
    });
    const verification = await getVerification(datasetId, reviewer.id);

    console.log(JSON.stringify({
        datasetId,
        datasetName: DATASET_NAME,
        reviewer,
        technicalAnnotator,
        annotationsInserted,
        reviewUrl: `/reviewer?datasetId=${datasetId}`,
        verification
    }, null, 2));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(error && error.message ? error.message : error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
