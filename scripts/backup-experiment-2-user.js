'use strict';

/**
 * Snapshots the experiment-2-user dataset to JSON.
 *
 * Produces three files in the target directory:
 *   - original.json   — entries from test-datasets/experiment-dataset.xml (unannotated)
 *   - annotated.json  — Spanish annotations as emitted by Gemini 2.5 Flash
 *                       (documentation/eval-output/experiment-dataset-gemini-2.5-flash-annotated.xml)
 *   - corrected.json  — current DB state of the dataset, joining Annotation,
 *                       ReviewComment (latest correctedSentence wins per sentence)
 *                       and ReviewDecision (ok/warning/error verdicts).
 *
 * Output directory: process.env.BACKUP_OUT_DIR || /app/uploads/_experiment-backup
 */

const fs = require('node:fs');
const path = require('node:path');

const prisma = require('../prisma/client');
const {
    createBenchmarkXmlParser,
    toArray,
    nodeText
} = require('../utils/xml-format');

const DATASET_NAME = process.env.EXPERIMENT_USER_DATASET_NAME || 'experiment-2-user';
const SOURCE_XML = path.join(__dirname, '..', 'test-datasets', 'experiment-dataset.xml');
const ANNOTATED_XML = path.join(
    __dirname,
    '..',
    'documentation',
    'eval-output',
    'experiment-dataset-gemini-2.5-flash-annotated.xml'
);
const OUT_DIR = process.env.BACKUP_OUT_DIR || '/app/uploads/_experiment-backup';

function assertFileExists(filePath) {
    if (!fs.existsSync(filePath))
        throw new Error(`Missing required file: ${filePath}`);
}

function xmlEntriesToJson(xmlPath) {
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const parser = createBenchmarkXmlParser();
    const parsed = parser.parse(xml);
    const rawEntries = toArray(parsed?.benchmark?.entries?.entry);

    return rawEntries.map(raw => {
        const eid = Number(raw['@_eid']);
        const sourceEidRaw = raw['@_source_eid'];

        return {
            eid,
            category: raw['@_category'] ?? null,
            shape: raw['@_shape'] ?? null,
            shapeType: raw['@_shape_type'] ?? null,
            size: raw['@_size'] != null ? Number(raw['@_size']) : null,
            sourceEid: sourceEidRaw != null ? Number(sourceEidRaw) : null,
            originalTripleset: toArray(raw.originaltripleset).flatMap(ts =>
                toArray(ts?.otriple).map(o => nodeText(o).trim()).filter(Boolean)
            ),
            modifiedTripleset: toArray(raw.modifiedtripleset).flatMap(ts =>
                toArray(ts?.mtriple).map(m => nodeText(m).trim()).filter(Boolean)
            ),
            lex: toArray(raw.lex).map(lex => ({
                lid: lex['@_lid'] ?? null,
                lang: lex['@_lang'] ?? null,
                comment: lex['@_comment'] ?? '',
                text: nodeText(lex).trim()
            }))
        };
    });
}

async function buildCorrectedExport() {
    const dataset = await prisma.dataset.findFirst({
        where: { name: DATASET_NAME }
    });
    if (!dataset)
        throw new Error(`Dataset '${DATASET_NAME}' not found in the database.`);

    const entries = await prisma.entry.findMany({
        where: { datasetId: dataset.id },
        orderBy: { position: 'asc' },
        include: {
            triplesets: {
                orderBy: [{ type: 'asc' }, { position: 'asc' }],
                include: {
                    triples: { orderBy: { position: 'asc' } }
                }
            },
            lexes: { orderBy: { position: 'asc' } },
            annotations: {
                orderBy: { sentenceIndex: 'asc' },
                include: { user: { select: { id: true, email: true } } }
            },
            reviews: {
                orderBy: [{ roundIndex: 'asc' }, { assignedAt: 'asc' }],
                include: {
                    reviewer: { select: { id: true, email: true } },
                    annotator: { select: { id: true, email: true } },
                    decisions: { orderBy: { decidedAt: 'asc' } },
                    comments: { orderBy: { createdAt: 'asc' } }
                }
            }
        }
    });

    const entryNodes = entries.map(entry => {
        const sentenceMap = new Map();
        for (const ann of entry.annotations) {
            sentenceMap.set(ann.sentenceIndex, {
                sentenceIndex: ann.sentenceIndex,
                annotator: ann.user?.email ?? null,
                annotationOrigin: ann.origin,
                isAcceptedFirstTry: ann.isAcceptedFirstTry,
                originalSentence: ann.sentence,
                correctedSentence: ann.sentence,
                wasCorrected: false,
                decisions: [],
                comments: []
            });
        }

        const reviewLevelDecisions = [];

        for (const review of entry.reviews) {
            for (const comment of review.comments) {
                const target = sentenceMap.get(comment.sentenceIndex);
                const commentRecord = {
                    reviewId: review.id,
                    reviewer: review.reviewer?.email ?? null,
                    originalSentence: comment.originalSentence,
                    correctedSentence: comment.correctedSentence,
                    comment: comment.comment,
                    createdAt: comment.createdAt
                };
                if (target) {
                    target.comments.push(commentRecord);
                    target.correctedSentence = comment.correctedSentence;
                    target.wasCorrected = target.correctedSentence !== target.originalSentence;
                }
            }

            for (const decision of review.decisions) {
                const decisionRecord = {
                    reviewId: review.id,
                    reviewer: review.reviewer?.email ?? null,
                    criterionCode: decision.criterionCode,
                    decision: decision.decision,
                    comment: decision.comment,
                    decidedAt: decision.decidedAt
                };
                if (decision.sentenceIndex == null) {
                    reviewLevelDecisions.push(decisionRecord);
                    continue;
                }
                const target = sentenceMap.get(decision.sentenceIndex);
                if (target)
                    target.decisions.push(decisionRecord);
            }
        }

        return {
            eid: entry.eid,
            category: entry.category,
            shape: entry.shape,
            shapeType: entry.shapeType,
            size: entry.size,
            position: entry.position,
            status: entry.status,
            triplesets: entry.triplesets.map(ts => ({
                type: ts.type,
                position: ts.position,
                triples: ts.triples.map(t => ({
                    subject: t.subject,
                    predicate: t.predicate,
                    object: t.object
                }))
            })),
            lex: entry.lexes.map(l => ({
                lid: l.lid,
                lang: l.lang,
                comment: l.comment,
                text: l.text
            })),
            annotations: Array.from(sentenceMap.values())
                .sort((a, b) => a.sentenceIndex - b.sentenceIndex),
            reviewLevelDecisions,
            reviews: entry.reviews.map(r => ({
                id: r.id,
                status: r.status,
                roundIndex: r.roundIndex,
                cleanRound: r.cleanRound,
                reviewer: r.reviewer?.email ?? null,
                annotator: r.annotator?.email ?? null,
                assignedAt: r.assignedAt,
                completedAt: r.completedAt,
                timeSpentSeconds: r.timeSpentSeconds
            }))
        };
    });

    return {
        dataset: {
            id: dataset.id,
            name: dataset.name,
            description: dataset.description,
            totalEntries: dataset.totalEntries,
            llmMode: dataset.llmMode,
            isReviewEnabled: dataset.isReviewEnabled,
            hasAdditionalReviews: dataset.hasAdditionalReviews,
            sectionSize: dataset.sectionSize,
            sectionsCompleted: dataset.sectionsCompleted,
            sectionsInReview: dataset.sectionsInReview,
            sectionsPending: dataset.sectionsPending,
            createdAt: dataset.createdAt,
            updatedAt: dataset.updatedAt
        },
        entries: entryNodes
    };
}

function writeJson(filePath, payload) {
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(filePath, json + '\n', 'utf8');
}

async function main() {
    assertFileExists(SOURCE_XML);
    assertFileExists(ANNOTATED_XML);

    if (!fs.existsSync(OUT_DIR))
        fs.mkdirSync(OUT_DIR, { recursive: true });

    const exportedAt = new Date().toISOString();

    const originalEntries = xmlEntriesToJson(SOURCE_XML);
    writeJson(path.join(OUT_DIR, 'original.json'), {
        meta: {
            source: 'test-datasets/experiment-dataset.xml',
            description: 'WebNLG-style unannotated source of the experiment-2-user dataset (English reference + tripleset only).',
            totalEntries: originalEntries.length,
            exportedAt
        },
        entries: originalEntries
    });

    const annotatedEntries = xmlEntriesToJson(ANNOTATED_XML);
    writeJson(path.join(OUT_DIR, 'annotated.json'), {
        meta: {
            source: 'documentation/eval-output/experiment-dataset-gemini-2.5-flash-annotated.xml',
            description: 'Spanish annotations produced by Gemini 2.5 Flash for the experiment-2-user dataset (before human review).',
            annotator: 'Gemini 2.5 Flash',
            totalEntries: annotatedEntries.length,
            exportedAt
        },
        entries: annotatedEntries
    });

    const correctedExport = await buildCorrectedExport();
    writeJson(path.join(OUT_DIR, 'corrected.json'), {
        meta: {
            source: `database:lanbench/dataset:${correctedExport.dataset.name}`,
            description: 'Final state of the experiment-2-user dataset after manual review. Each annotation carries the latest correctedSentence (last ReviewComment wins) and the per-sentence ReviewDecision verdicts (ok/warning/error). reviewLevelDecisions captures dataset-wide criteria such as diversity.',
            totalEntries: correctedExport.entries.length,
            exportedAt
        },
        dataset: correctedExport.dataset,
        entries: correctedExport.entries
    });

    console.log(JSON.stringify({
        outDir: OUT_DIR,
        files: ['original.json', 'annotated.json', 'corrected.json'],
        counts: {
            original: originalEntries.length,
            annotated: annotatedEntries.length,
            corrected: correctedExport.entries.length,
            datasetTotalEntries: correctedExport.dataset.totalEntries
        }
    }, null, 2));
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error(error && error.message ? error.message : error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
