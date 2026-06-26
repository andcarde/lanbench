'use strict';

/**
 * Imports Experiment 2's `experiment-dataset.xml` into Lanbench and runs the
 * production auto-annotation flow with Google AI Studio Gemini 2.5 Flash.
 *
 * The script is intentionally operational, not a test harness:
 *   - creates the dataset with `llmMode=generation` and `sectionSize=33`;
 *   - stores the Gemini credential as a per-dataset active credential;
 *   - invokes `services/auto-annotation-service.js`;
 *   - exports an annotated XML backup after completion.
 *
 * Usage:
 *   node scripts/run-gemini-experiment.js
 *
 * Optional env:
 *   EXPERIMENT_USER_EMAIL=a@a.es
 *   EXPERIMENT_DATASET_NAME=experiment-dataset
 *   EXPERIMENT_GEMINI_INTER_CALL_MS=2000
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const prisma = require('../prisma/client');
const { createDatasetsService } = require('../services/datasets-service');
const { createDatasetLlmCredentialsService } = require('../services/dataset-llm-credentials-service');
const { createAutoAnnotationService } = require('../services/auto-annotation-service');
const llmClient = require('../utils/llm-client');

const DATASET_NAME = process.env.EXPERIMENT_DATASET_NAME || 'experiment-dataset';
const XML_PATH = path.join(__dirname, '..', 'test-datasets', 'experiment-dataset.xml');
const BACKUP_PATH = path.join(
    __dirname,
    '..',
    'documentation',
    'eval-output',
    'experiment-dataset-gemini-2.5-flash-annotated.xml'
);
const SECTION_SIZE = 33;
const SECTIONS_COUNT = 3;
const DEFAULT_INTER_CALL_MS = 2000;
const DEFAULT_RETRIES = 6;
const DEFAULT_BACKOFF_MS = 10000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function redactSecrets(message) {
    let output = String(message || '');
    for (const secret of [config.gemini.apiKey, config.groq.apiKey]) {
        if (secret)
            output = output.split(secret).join('[REDACTED]');
    }
    return output;
}

function createThrottledLlmClient() {
    const interCallMs = positiveInt(process.env.EXPERIMENT_GEMINI_INTER_CALL_MS, DEFAULT_INTER_CALL_MS);
    const retries = positiveInt(process.env.EXPERIMENT_GEMINI_RETRIES, DEFAULT_RETRIES);
    const backoffMs = positiveInt(process.env.EXPERIMENT_GEMINI_BACKOFF_MS, DEFAULT_BACKOFF_MS);
    let lastCallAt = 0;
    let callCount = 0;

    async function waitForSlot() {
        const elapsed = Date.now() - lastCallAt;
        const waitMs = Math.max(0, interCallMs - elapsed);
        if (waitMs > 0)
            await sleep(waitMs);
    }

    async function generateJson(options) {
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            await waitForSlot();
            try {
                callCount += 1;
                if (callCount === 1 || callCount % 10 === 0)
                    console.log(`Gemini call ${callCount}/99`);
                const result = await llmClient.generateJson(options);
                lastCallAt = Date.now();
                return result;
            } catch (caughtError) {
                lastCallAt = Date.now();
                const message = redactSecrets(caughtError && caughtError.message ? caughtError.message : caughtError);
                if (attempt === retries)
                    throw new Error(message);

                const waitMs = backoffMs * (attempt + 1);
                console.warn(`Gemini call failed (attempt ${attempt + 1}/${retries + 1}); retrying in ${waitMs} ms: ${message}`);
                await sleep(waitMs);
            }
        }
        throw new Error('Gemini call failed unexpectedly.');
    }

    return {
        generateJson,
        generateText: llmClient.generateText
    };
}

function positiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function resolveExperimentUser() {
    const requestedEmail = process.env.EXPERIMENT_USER_EMAIL;
    if (requestedEmail) {
        const user = await prisma.user.findUnique({
            where: { email: requestedEmail },
            select: { id: true, email: true }
        });
        if (!user)
            throw new Error(`No user found for EXPERIMENT_USER_EMAIL=${requestedEmail}`);
        return user;
    }

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
    if (!firstUser)
        throw new Error('No users exist in the local database.');
    return firstUser;
}

async function findOwnedExperimentDataset(userId) {
    const existing = await prisma.dataset.findFirst({
        where: {
            name: DATASET_NAME,
            permits: { some: { userId, isOwned: true } }
        },
        select: {
            id: true,
            name: true,
            totalEntries: true,
            llmMode: true,
            sectionsCompleted: true,
            sectionsInReview: true,
            sectionsPending: true
        }
    });

    return existing;
}

async function prepareExistingDatasetForRun(datasetId) {
    const annotationCount = await prisma.annotation.count({ where: { datasetId } });
    if (annotationCount > 0) {
        throw new Error(
            `Dataset '${DATASET_NAME}' already has ${annotationCount} annotations. ` +
            'Refusing to overwrite experiment data.'
        );
    }

    await prisma.$transaction([
        prisma.sectionAssignment.deleteMany({ where: { datasetId } }),
        prisma.activeSession.deleteMany({ where: { datasetId } }),
        prisma.entry.updateMany({ where: { datasetId }, data: { status: 'pending' } }),
        prisma.dataset.update({
            where: { id: datasetId },
            data: {
                llmMode: 'generation',
                isReviewEnabled: false,
                hasAdditionalReviews: false,
                sectionSize: SECTION_SIZE,
                sectionsCompleted: 0,
                sectionsInReview: 0,
                sectionsPending: SECTIONS_COUNT
            }
        })
    ]);
}

async function importDataset(user) {
    const datasetsService = createDatasetsService({
        readFileAsBuffer: fs.readFileSync
    });

    const created = await datasetsService.createDataset(
        user.id,
        {
            filename: XML_PATH,
            originalname: `${DATASET_NAME}.xml`
        },
        {
            name: DATASET_NAME,
            description: 'Experimento 2: muestra estratificada 99 entradas, Gemini 2.5 Flash.',
            llmMode: 'generation',
            isReviewEnabled: false,
            hasAdditionalReviews: false,
            sectionSize: SECTION_SIZE
        }
    );

    return {
        datasetsService,
        datasetId: Number(created?.id || created?.datasetId)
    };
}

async function resolveDatasetForRun(user) {
    const datasetsService = createDatasetsService({
        readFileAsBuffer: fs.readFileSync
    });

    const existing = await findOwnedExperimentDataset(user.id);
    if (existing) {
        if (Number(existing.totalEntries) !== 99) {
            throw new Error(
                `Dataset '${DATASET_NAME}' exists with ${existing.totalEntries} entries; expected 99. ` +
                'Rename/delete it before re-running this experiment.'
            );
        }

        await prepareExistingDatasetForRun(existing.id);
        console.log(`Reusing existing dataset '${DATASET_NAME}' (id ${existing.id}); cleared stale auto-annotation locks.`);
        return { datasetsService, datasetId: existing.id };
    }

    return importDataset(user);
}

async function configureGeminiCredential(userId, datasetId) {
    if (!config.gemini.apiKey)
        throw new Error('GEMINI_API_KEY is not configured in .env.');

    const credentialsService = createDatasetLlmCredentialsService();
    await credentialsService.saveCredential(userId, datasetId, {
        provider: 'google-ai-studio',
        apiBase: config.gemini.apiBase,
        model: 'gemini-2.5-flash',
        apiKey: config.gemini.apiKey
    });
    await credentialsService.activateCredential(userId, datasetId, 'google-ai-studio');
}

async function runAutoAnnotation({ userId, datasetId, datasetsService }) {
    const service = createAutoAnnotationService({
        datasetsService,
        llmClient: createThrottledLlmClient(),
        logger: console
    });

    const started = await service.start(userId, datasetId, SECTIONS_COUNT);
    console.log(`Auto-annotation started: ${JSON.stringify(started)}`);

    let lastPrintable = '';
    for (;;) {
        const status = await service.getStatus(userId, datasetId);
        const printable = `${status.status}:${status.entriesAnnotated}/${status.totalEntries}:section:${status.currentSection}`;
        if (printable !== lastPrintable) {
            console.log(`Auto-annotation status: ${printable}`);
            lastPrintable = printable;
        }

        if (status.status === 'completed')
            return status;

        if (status.status === 'failed') {
            throw new Error(`Auto-annotation failed: ${redactSecrets(status.lastError || 'unknown error')}`);
        }

        await sleep(5000);
    }
}

async function exportAnnotatedBackup(userId, datasetId, datasetsService) {
    fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
    const payload = await datasetsService.getAccessibleDatasetAnnotatedXmlDownload(userId, datasetId);
    fs.writeFileSync(BACKUP_PATH, payload.body, 'utf8');
    return BACKUP_PATH;
}

async function main() {
    if (!fs.existsSync(XML_PATH))
        throw new Error(`Missing ${path.relative(process.cwd(), XML_PATH)}. Run scripts/build-quality-eval-sample.js first.`);

    const user = await resolveExperimentUser();

    console.log(`Experiment user: ${user.email} (id ${user.id})`);
    console.log(`Preparing dataset '${DATASET_NAME}' from ${path.relative(process.cwd(), XML_PATH)}`);

    const { datasetsService, datasetId } = await resolveDatasetForRun(user);
    console.log(`Dataset ready: id ${datasetId}`);

    await configureGeminiCredential(user.id, datasetId);
    console.log('Gemini credential saved and activated for dataset.');

    const completed = await runAutoAnnotation({ userId: user.id, datasetId, datasetsService });
    console.log(`Auto-annotation completed: ${completed.entriesAnnotated}/${completed.totalEntries} entries.`);

    const backupPath = await exportAnnotatedBackup(user.id, datasetId, datasetsService);
    console.log(`Annotated backup written: ${path.relative(process.cwd(), backupPath)}`);

    const summary = {
        datasetId,
        datasetName: DATASET_NAME,
        userId: user.id,
        userEmail: user.email,
        model: 'gemini-2.5-flash',
        provider: 'google-ai-studio',
        totalEntries: completed.totalEntries,
        backupPath: path.relative(process.cwd(), backupPath),
        completedAt: new Date().toISOString()
    };
    console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(`FATAL: ${redactSecrets(error && error.message ? error.message : error)}`);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
