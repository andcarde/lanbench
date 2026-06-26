'use strict';

/**
 * Applies the human-review pass for Experiment 2 / Gemini 2.5 Flash.
 *
 * The initial model output is preserved in:
 *   documentation/eval-output/experiment-dataset-gemini-2.5-flash-annotated.xml
 *
 * This script writes:
 *   documentation/eval-output/quality-eval-gemini-2.5-flash.json
 *   documentation/eval-output/experiment-dataset-gemini-2.5-flash-corrected.xml
 *
 * Usage:
 *   DB_HOST=localhost node scripts/review-gemini-experiment.js
 */

const fs = require('node:fs');
const path = require('node:path');

const prisma = require('../prisma/client');
const { createDatasetsService } = require('../services/datasets-service');

const DATASET_NAME = 'experiment-dataset';
const MODEL = 'gemini-2.5-flash';
const PROVIDER = 'google-ai-studio';
const REPORT_DIR = path.join(__dirname, '..', 'documentation', 'eval-output');
const REPORT_PATH = path.join(REPORT_DIR, 'quality-eval-gemini-2.5-flash.json');
const CORRECTED_XML_PATH = path.join(REPORT_DIR, 'experiment-dataset-gemini-2.5-flash-corrected.xml');
const METADATA_PATH = path.join(__dirname, '..', 'test-datasets', 'experiment-dataset-metadata.json');
const ANNOTATED_BACKUP_PATH = path.join(REPORT_DIR, 'experiment-dataset-gemini-2.5-flash-annotated.xml');

const REVIEW_NOTES = {
    7: {
        verdict: 'warning',
        corrected: 'Las personas de Sudáfrica pueden decir que son de Sudáfrica.',
        rationale: 'La frase inicial usa "gentilicio" de forma poco natural para un valor RDF anómalo.'
    },
    13: {
        verdict: 'warning',
        corrected: 'Batagor es una variación del siomay.',
        rationale: 'La frase inicial vuelve simétrica una relación de variación que en el RDF es direccional.'
    },
    17: {
        verdict: 'warning',
        corrected: 'Olympiacos F.C. es el campeón de la Superliga de Grecia.',
        rationale: 'Concordancia verbal mejorable.'
    },
    23: {
        verdict: 'warning',
        corrected: '110 Lydia tiene una temperatura de 168.0 kelvin y una apoapsis de 440756000.0 kilómetros.',
        rationale: 'Ajuste de género gramatical en "apoapsis".'
    },
    26: {
        verdict: 'warning',
        corrected: 'El Bionico es un postre cuya variante incluye queso cottage.',
        rationale: 'La formulación inicial era comprensible, pero poco natural.'
    },
    37: {
        verdict: 'warning',
        corrected: 'El cuerpo celeste 110 Lydia tiene un período orbital de 142603000.0, una apoapsis de 440756000.0 kilómetros y una época del 31 de diciembre de 2006.',
        rationale: 'Ajuste de género gramatical en "apoapsis".'
    },
    38: {
        verdict: 'warning',
        corrected: '11264 Claudiomaccone tiene una época del 26 de noviembre de 2005, una temperatura de 173 kelvin y una apoapsis de 475426000.0 kilómetros.',
        rationale: 'Ajuste de género gramatical en "apoapsis".'
    },
    40: {
        verdict: 'warning',
        corrected: 'Ayam penyet es un plato de Java, donde el grupo étnico son los javaneses, y se encuentra a nivel nacional, así como en Malasia y Singapur.',
        rationale: 'La expresión "en todo el país" quedaba ambigua por el valor RDF "Java".'
    },
    47: {
        verdict: 'warning',
        corrected: 'El Monumento a Atatürk (İzmir) se encuentra en Turquía, país que tiene como cargo de liderazgo el de Presidente de Turquía y a Ahmet Davutoğlu como líder.',
        rationale: 'La frase inicial asociaba directamente el título presidencial a Ahmet Davutoğlu.'
    },
    59: {
        verdict: 'warning',
        corrected: '110 Lydia tiene una época del 31 de diciembre de 2006, una velocidad de escape de 0.0455 kilómetros por segundo, un período orbital de 142603000.0 y una apoapsis de 440756000.0 kilómetros.',
        rationale: 'Ajuste de género gramatical en "apoapsis".'
    },
    64: {
        verdict: 'warning',
        corrected: 'Batchoy es un plato de Filipinas, donde se habla español filipino y donde se encuentran los zamboangueños y el pueblo moro.',
        rationale: 'La frase inicial verbalizaba débilmente la relación de país del plato.'
    },
    66: {
        verdict: 'warning',
        corrected: 'Luciano Spalletti está asociado al Virtus Entella y dirige a la A.S. Roma, equipo que juega en la Serie A, liga de la cual la Juventus F.C. es la campeona.',
        rationale: 'La frase inicial infería "juega para" a partir de una relación genérica de club.'
    },
    76: {
        verdict: 'warning',
        corrected: 'El Museo de Arte de Akita está ubicado en Akita, Akita, que forma parte de la Prefectura de Akita en Japón, país cuyo líder es Akihito y donde uno de los grupos étnicos es el de los brasileños en Japón.',
        rationale: 'Ajuste de concordancia en el sintagma "grupo étnico".'
    },
    77: {
        verdict: 'error',
        corrected: '20 Fenchurch Street se encuentra en el Reino Unido, cuya capital es Londres; Londres tiene como líder a Boris Johnson y como título de liderazgo el Parlamento del Reino Unido, y el gentilicio del Reino Unido es británico.',
        rationale: 'La frase inicial desplazaba el título de liderazgo de Londres al gobierno del Reino Unido.'
    },
    82: {
        verdict: 'warning',
        corrected: 'Ayam penyet es un plato asociado con Java, donde el grupo étnico son los javaneses, y también con la región de Singapur, donde se habla chino estándar y Halimah Yacob es la líder.',
        rationale: 'La frase inicial decía "país de Java", formulación natural y geográficamente problemática.'
    },
    87: {
        verdict: 'warning',
        corrected: 'Ankara es la capital de Turquía, país donde se encuentra el Monumento a Atatürk (İzmir), cuya moneda es la lira turca, que tiene como cargo de liderazgo el de Presidente de Turquía y a Ahmet Davutoğlu como líder.',
        rationale: 'La frase inicial asociaba directamente el título presidencial a Ahmet Davutoğlu.'
    },
    90: {
        verdict: 'warning',
        corrected: 'La misión Apolo 8, operada por la NASA, contó con William Anders, quien pasó 8820 minutos en el espacio y sirvió como jefe de la Oficina de Astronautas en 1976, y con Frank Borman como miembro de la tripulación; Buzz Aldrin fue su piloto de respaldo.',
        rationale: 'Ajuste de concordancia y referencia pronominal.'
    },
    91: {
        verdict: 'warning',
        corrected: 'El Monumento a Atatürk (İzmir), diseñado por Pietro Canonica e inaugurado el 27 de julio de 1932, se encuentra en Turquía, cuya capital es Ankara, que tiene como cargo de liderazgo el de Presidente de Turquía y a Ahmet Davutoğlu como líder.',
        rationale: 'La frase inicial asociaba directamente el título presidencial a Ahmet Davutoğlu.'
    }
};

function wilsonInterval(successes, total, z = 1.959963984540054) {
    if (total <= 0)
        return { low: 0, high: 0 };
    const phat = successes / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const centre = phat + z2 / (2 * total);
    const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
    return {
        low: (centre - margin) / denom,
        high: (centre + margin) / denom
    };
}

function pct(value) {
    return Number((100 * value).toFixed(1));
}

function buildTripleText(entry) {
    return entry.triplesets
        .flatMap((tripleset) => tripleset.triples)
        .map((triple) => `${triple.subject} | ${triple.predicate} | ${triple.object}`);
}

function summarize(rows, metadataByEid) {
    const counts = { ok: 0, warning: 0, error: 0 };
    const perStratum = {};

    for (const row of rows) {
        counts[row.verdict] += 1;
        const stratum = metadataByEid.get(row.eid)?.stratum || 'unknown';
        if (!perStratum[stratum])
            perStratum[stratum] = { total: 0, ok: 0, warning: 0, error: 0 };
        perStratum[stratum].total += 1;
        perStratum[stratum][row.verdict] += 1;
    }

    const total = rows.length;
    const globalWilson = wilsonInterval(counts.ok, total);
    const strata = Object.fromEntries(Object.entries(perStratum).map(([key, value]) => {
        const interval = wilsonInterval(value.ok, value.total);
        return [key, {
            ...value,
            acceptanceRatePct: pct(value.ok / value.total),
            wilson95: { lowPct: pct(interval.low), highPct: pct(interval.high) }
        }];
    }));

    return {
        total,
        counts,
        acceptanceRatePct: pct(counts.ok / total),
        correctionRatePct: pct((counts.warning + counts.error) / total),
        wilson95: { lowPct: pct(globalWilson.low), highPct: pct(globalWilson.high) },
        perStratum: strata
    };
}

async function findDataset() {
    const dataset = await prisma.dataset.findFirst({
        where: { name: DATASET_NAME },
        orderBy: { id: 'desc' },
        select: {
            id: true,
            name: true,
            totalEntries: true,
            permits: { where: { isOwned: true }, select: { userId: true } }
        }
    });

    if (!dataset)
        throw new Error(`Dataset '${DATASET_NAME}' not found.`);
    if (!dataset.permits.length)
        throw new Error(`Dataset '${DATASET_NAME}' has no owner permit.`);
    return { datasetId: dataset.id, userId: dataset.permits[0].userId };
}

async function main() {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    const metadataByEid = new Map(metadata.entries.map((entry) => [entry.eid, entry]));
    const { datasetId, userId } = await findDataset();

    if (!fs.existsSync(ANNOTATED_BACKUP_PATH))
        throw new Error(`Missing original annotated backup: ${path.relative(process.cwd(), ANNOTATED_BACKUP_PATH)}`);

    const entries = await prisma.entry.findMany({
        where: { datasetId },
        orderBy: { eid: 'asc' },
        include: {
            triplesets: {
                where: { type: 'original' },
                orderBy: { position: 'asc' },
                include: { triples: { orderBy: { position: 'asc' } } }
            },
            lexes: { where: { lang: 'en' }, orderBy: { position: 'asc' } },
            annotations: { orderBy: { sentenceIndex: 'asc' } }
        }
    });

    if (entries.length !== 99)
        throw new Error(`Expected 99 entries, found ${entries.length}.`);

    const reviewedRows = [];
    for (const entry of entries) {
        const annotation = entry.annotations[0];
        if (!annotation)
            throw new Error(`Entry ${entry.eid} has no annotation.`);

        const note = REVIEW_NOTES[entry.eid] || null;
        const generated = annotation.sentence;
        const corrected = note ? note.corrected : generated;
        const verdict = note ? note.verdict : 'ok';

        if (corrected !== generated) {
            await prisma.annotation.updateMany({
                where: {
                    entryId: entry.id,
                    datasetId,
                    sentenceIndex: annotation.sentenceIndex
                },
                data: {
                    sentence: corrected,
                    updatedAt: new Date()
                }
            });
        }

        reviewedRows.push({
            eid: entry.eid,
            sourceEid: metadataByEid.get(entry.eid)?.sourceEid || null,
            stratum: metadataByEid.get(entry.eid)?.stratum || null,
            category: entry.category,
            triples: buildTripleText(entry),
            englishReference: entry.lexes.map((lex) => lex.text),
            generated,
            corrected,
            verdict,
            changed: corrected !== generated,
            rationale: note ? note.rationale : 'Aceptable: verbaliza los triples de forma fiel y suficientemente fluida.'
        });
    }

    const summary = summarize(reviewedRows, metadataByEid);
    const output = {
        kind: 'quality-eval-human-review',
        provider: PROVIDER,
        model: MODEL,
        datasetId,
        datasetName: DATASET_NAME,
        inputXml: 'test-datasets/experiment-dataset.xml',
        originalAnnotatedBackup: path.relative(process.cwd(), ANNOTATED_BACKUP_PATH),
        correctedXml: path.relative(process.cwd(), CORRECTED_XML_PATH),
        metadata: {
            seed: metadata.seed,
            seedHex: metadata.seedHex,
            sampling: '33 entries per stratum: short(1-2), medium(3-4), long(5-7)'
        },
        summary,
        perEntry: reviewedRows,
        reviewedAt: new Date().toISOString(),
        reviewer: 'Codex manual review pass'
    };

    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

    const datasetsService = createDatasetsService();
    const xml = await datasetsService.getAccessibleDatasetAnnotatedXmlDownload(userId, datasetId);
    fs.writeFileSync(CORRECTED_XML_PATH, xml.body, 'utf8');

    console.log(JSON.stringify({
        report: path.relative(process.cwd(), REPORT_PATH),
        correctedXml: path.relative(process.cwd(), CORRECTED_XML_PATH),
        summary
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
