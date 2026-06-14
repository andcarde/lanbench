'use strict';

/**
 * @file Evaluation harness for the AI-generation pipeline quality
 * (multi-provider).
 *
 * For each entry in `test-datasets/generation-50-input.xml` (50 real WebNLG
 * entries, stratified sample from `ru_dev.xml`), the harness:
 *
 *   1. Asks the LLM to verbalise the triples into Spanish sentence(s) using
 *      the SAME system + user prompts the production auto-annotation flow
 *      uses (`services/auto-annotation-service.js`). This guarantees the eval
 *      measures what would actually be persisted in the "Anotar" flow.
 *   2. Runs the produced sentence(s) through the REAL Spanish validator
 *      (`domain/spanish/spanish-service.js#checkBatch`: rule-checker + LLM +
 *      coverage-checker + alert-merger), deriving the verdict severity.
 *   3. Counts ok / warning / error per provider and lists the rejected
 *      sentences (severity != ok) for diagnosis.
 *
 * There is NO absolute ground truth for the 50 real entries (only the English
 * reference), so the harness reports (i) the pipeline acceptance rate per
 * provider, (ii) the breakdown by severity, and (iii) the cross-provider
 * agreement on a per-entry basis.
 *
 * Usage:
 *   node scripts/eval-generation-quality.js [provider]
 *     - provider : groq | gemini | all  (default all)
 *
 * API keys are read from `.env` via `config.js` and never printed.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const llmClient = require('../utils/llm-client');
const { createSpanishService } = require('../domain/spanish/spanish-service');
const ollamaSpanishChecker = require('../domain/spanish/ollama-spanish-checker');
const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../utils/xml-format');
const {
    buildGenerationSystemPrompt,
    buildGenerationUserPrompt,
    extractSentencesFromResponse
} = require('../services/auto-annotation-service');
const { PROVIDERS, deriveVerdict, emptyMatrix, formatConfusionMatrix, resolveProviderList, assertProviderKeysReady } = require('./eval-correction-quality');

const CORPUS_DIR = path.join(__dirname, '..', 'test-datasets');
const REPORT_DIR = path.join(__dirname, '..', 'documentation', 'eval-output');
const INPUT_FILE = 'generation-50-input.xml';
const SEVERITIES = ['ok', 'warning', 'error'];

/**
 * Parses the generation input XML into eval-ready entries.
 * @returns {Array<{ eid:number, sourceEid:number|null, category:string, triples:Array<*>, english:string }>}
 */
function loadInputEntries() {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, INPUT_FILE), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    return toArray(parsed?.benchmark?.entries?.entry).map((/** @type {*} */ entry) => {
        const triples = toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean);
        const english = toArray(entry?.lex)
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'en')
            .map(nodeText)
            .find(Boolean) || '';
        return {
            eid: Number(entry?.['@_eid']),
            sourceEid: entry?.['@_source_eid'] ? Number(entry['@_source_eid']) : null,
            category: String(entry?.['@_category'] || ''),
            triples,
            english
        };
    });
}

/**
 * Sleeps for the given milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates Spanish sentences for one entry, retrying on transient errors.
 * Mirrors `auto-annotation-service.js#generateSentencesForEntry` so the eval
 * measures the production prompt.
 *
 * @param {Record<string, any>} entry
 * @param {Record<string, any>} providerConfig
 * @returns {Promise<{ sentences:string[], failed:boolean, error:string|null }>}
 */
async function generateForEntry(entry, providerConfig, pacing) {
    const expectedCount = Math.max(1, entry.triples.length);
    const promptEntry = {
        entryId: entry.eid,
        category: entry.category,
        triples: entry.triples,
        englishSentences: entry.english ? [entry.english] : []
    };

    const system = buildGenerationSystemPrompt(expectedCount);
    const prompt = buildGenerationUserPrompt(promptEntry, expectedCount);

    const retries = pacing?.retries ?? 4;
    const backoff = pacing?.backoffBaseMs ?? 800;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await llmClient.generateJson({ system, prompt, providerConfig });
            const sentences = extractSentencesFromResponse(response, expectedCount);
            if (sentences.length === 0)
                throw new Error('Model returned no usable sentences.');
            return { sentences, failed: false, error: null };
        } catch (caughtError) {
            if (attempt === retries) {
                const err = /** @type {any} */ (caughtError);
                return { sentences: [], failed: true, error: err && err.message ? err.message : String(err) };
            }
            await sleep(backoff * (attempt + 1));
        }
    }
    return { sentences: [], failed: true, error: 'unreachable' };
}

/**
 * Runs the validator over the generated sentences and aggregates severities.
 * @param {Record<string, any>} service
 * @param {Record<string, any>} entry
 * @param {string[]} sentences
 * @param {Record<string, any>} providerConfig
 * @returns {Promise<{ severity:string, perSentence:Array<{ sentence:string, severity:string, codes:string[], messages:string[] }> }>}
 */
async function validateGenerated(service, entry, sentences, providerConfig) {
    const context = {
        triples: entry.triples,
        englishSentences: entry.english ? [entry.english] : [],
        category: entry.category,
        entryId: entry.eid,
        providerConfig
    };
    const results = await service.checkBatch(sentences, context);
    const perSentence = results.map((/** @type {*} */ result, /** @type {*} */ index) => {
        const verdict = deriveVerdict(result);
        return {
            sentence: sentences[index],
            severity: verdict.severity,
            codes: verdict.codes,
            messages: verdict.messages
        };
    });
    // Worst severity wins for the entry-level verdict.
    let entrySeverity = 'ok';
    for (const item of perSentence) {
        if (item.severity === 'error') { entrySeverity = 'error'; break; }
        if (item.severity === 'warning') entrySeverity = 'warning';
    }
    return { severity: entrySeverity, perSentence };
}

/**
 * Runs the full generation eval for one provider.
 * @param {{ providerKey:string, providerConfig:Record<string, any>, label:string, inputEntries:Array<*> }} options
 * @returns {Promise<{ providerKey:string, label:string, model:string, perEntry:Array<*>, severityCounts:Record<string, number>, generationFailures:number, validationFailures:number, total:number }>}
 */
async function evalForProvider({ providerKey, providerConfig, label, inputEntries }) {
    const pacing = PROVIDERS[providerKey].pacing;
    const semanticChecker = {
        check: ollamaSpanishChecker.check,
        checkBatch: ollamaSpanishChecker.checkBatch
    };
    const service = createSpanishService({ semanticChecker });

    console.log(`\n=== AI-generation quality eval — ${label} — ${INPUT_FILE} (model: ${providerConfig.model}) ===\n`);
    console.log(`${'eid'.padEnd(4)}${'cat'.padEnd(18)}${'severity'.padEnd(10)}generated`);

    /** @type {Array<{ entry:*, generated:string[], severity:string, perSentence:*, generationError:string|null, validationError:string|null }>} */
    const perEntry = [];
    /** @type {Record<string, number>} */
    const severityCounts = { ok: 0, warning: 0, error: 0, GEN_FAIL: 0, VAL_FAIL: 0 };
    let generationFailures = 0;
    let validationFailures = 0;

    for (const entry of inputEntries) {
        let severity = 'GEN_FAIL';
        /** @type {Array<*>} */
        let perSentence = [];
        let generationError = null;
        let validationError = null;
        /** @type {string[]} */
        let generated = [];

        const gen = await generateForEntry(entry, providerConfig, pacing);
        if (gen.failed) {
            generationFailures += 1;
            generationError = gen.error;
        } else {
            generated = gen.sentences;
            try {
                const verdict = await validateGenerated(service, entry, gen.sentences, providerConfig);
                severity = verdict.severity;
                perSentence = verdict.perSentence;
            } catch (caughtError) {
                validationFailures += 1;
                validationError = /** @type {any} */ (caughtError).message;
                severity = 'VAL_FAIL';
            }
        }

        severityCounts[severity] = (severityCounts[severity] || 0) + 1;

        const summarySentence = generated.length > 0 ? generated.join(' / ') : (generationError ? `(GEN_FAIL: ${generationError})` : '(no output)');
        console.log(`${String(entry.eid).padEnd(4)}${(entry.category || '').padEnd(18)}${severity.padEnd(10)}${summarySentence}`);

        perEntry.push({ entry, generated, severity, perSentence, generationError, validationError });

        // Two LLM calls per entry (generation + validation) — wait the
        // per-provider inter-entry gap to stay under free-tier rate limits.
        await sleep(pacing.interEntryMs);
    }

    const total = inputEntries.length;
    const pctOk = (100 * severityCounts.ok / total).toFixed(1);
    const pctWarn = (100 * severityCounts.warning / total).toFixed(1);
    const pctErr = (100 * severityCounts.error / total).toFixed(1);
    console.log(`\nSeverity proportion: ok=${severityCounts.ok}/${total} (${pctOk}%), warning=${severityCounts.warning} (${pctWarn}%), error=${severityCounts.error} (${pctErr}%)`);
    console.log(`Failures: generation=${generationFailures}, validation=${validationFailures}`);

    return {
        providerKey,
        label,
        model: providerConfig.model,
        perEntry,
        severityCounts,
        generationFailures,
        validationFailures,
        total
    };
}

/**
 * Cross-provider per-entry comparison: how often the two providers produce
 * the same severity for the same entry.
 * @param {Array<*>} runs
 * @returns {{ agreement:number, total:number, conflicts:Array<{ eid:number, severities:Record<string, string> }> }|null}
 */
function crossProviderAgreement(runs) {
    if (runs.length !== 2)
        return null;
    const [a, b] = runs;
    const byEidA = new Map(a.perEntry.map((/** @type {*} */ row) => [row.entry.eid, row.severity]));
    const byEidB = new Map(b.perEntry.map((/** @type {*} */ row) => [row.entry.eid, row.severity]));
    let agreement = 0;
    let total = 0;
    /** @type {Array<*>} */
    const conflicts = [];
    for (const [eid, sevA] of byEidA) {
        const sevB = byEidB.get(eid);
        if (!sevB) continue;
        total += 1;
        if (sevA === sevB) {
            agreement += 1;
        } else {
            conflicts.push({ eid, severities: { [a.providerKey]: sevA, [b.providerKey]: sevB } });
        }
    }
    return { agreement, total, conflicts };
}

/**
 * Prints comparative tables.
 * @param {Array<*>} runs
 * @returns {void}
 */
function printComparative(runs) {
    if (runs.length < 1)
        return;
    console.log('\n=== Generation comparative summary ===\n');
    console.log(`${'provider'.padEnd(36)}${'model'.padEnd(32)}${'ok'.padStart(8)}${'warn'.padStart(8)}${'err'.padStart(8)}${'GEN_FAIL'.padStart(10)}`);
    for (const run of runs) {
        console.log(
            `${run.label.padEnd(36)}${run.model.padEnd(32)}` +
            `${String(run.severityCounts.ok).padStart(8)}${String(run.severityCounts.warning).padStart(8)}` +
            `${String(run.severityCounts.error).padStart(8)}${String(run.generationFailures).padStart(10)}`
        );
    }
    const cross = crossProviderAgreement(runs);
    if (cross) {
        const pct = (100 * cross.agreement / cross.total).toFixed(1);
        console.log(`\nCross-provider per-entry agreement: ${cross.agreement}/${cross.total} = ${pct}%`);
        if (cross.conflicts.length > 0) {
            console.log('Conflicts (first 10):');
            for (const c of cross.conflicts.slice(0, 10))
                console.log(`  eid ${String(c.eid).padStart(3)}: ${JSON.stringify(c.severities)}`);
        }
    }
}

/**
 * Writes a JSON summary of the run.
 * @param {Array<*>} runs
 * @returns {string}
 */
function writeJsonSummary(runs) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const filePath = path.join(REPORT_DIR, 'generation-50-results.json');

    /** @type {Array<*>} */
    let priorRuns = [];
    if (fs.existsSync(filePath)) {
        try {
            const prior = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (prior && prior.kind === 'generation-quality' && Array.isArray(prior.runs))
                priorRuns = prior.runs;
        } catch { /* corrupt file → overwrite */ }
    }
    const newKeys = new Set(runs.map((r) => r.providerKey));
    const mergedRuns = [
        ...priorRuns.filter((r) => !newKeys.has(r.providerKey)),
        ...runs.map((run) => ({
            providerKey: run.providerKey,
            label: run.label,
            model: run.model,
            total: run.total,
            severityCounts: run.severityCounts,
            generationFailures: run.generationFailures,
            validationFailures: run.validationFailures,
            acceptanceRatePct: Number((100 * run.severityCounts.ok / run.total).toFixed(1)),
            warningRatePct: Number((100 * run.severityCounts.warning / run.total).toFixed(1)),
            errorRatePct: Number((100 * run.severityCounts.error / run.total).toFixed(1)),
            perEntry: run.perEntry.map((/** @type {*} */ row) => ({
                eid: row.entry.eid,
                sourceEid: row.entry.sourceEid,
                category: row.entry.category,
                generated: row.generated,
                severity: row.severity,
                perSentence: row.perSentence,
                generationError: row.generationError,
                validationError: row.validationError
            }))
        }))
    ];

    // Recompute cross-provider stats from the merged set so the persisted
    // value reflects every provider currently in the file, not only the runs
    // executed in this invocation.
    const cross = crossProviderAgreement(mergedRuns);
    const out = {
        kind: 'generation-quality',
        inputFile: INPUT_FILE,
        runs: mergedRuns,
        crossProvider: cross,
        generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`\n📄 wrote ${path.relative(process.cwd(), filePath)}`);
    return filePath;
}

/**
 * Builds a confusion-style matrix counting severities per provider (for the
 * shared report).
 * @param {Array<*>} runs
 * @returns {void}
 */
function printSeverityMatrix(runs) {
    if (runs.length < 1)
        return;
    console.log('\nSeverity counts (rows = provider, cols = produced severity):');
    console.log(`${''.padEnd(36)}${SEVERITIES.map(s => s.padStart(9)).join('')}${'GEN_FAIL'.padStart(10)}`);
    for (const run of runs) {
        const row = SEVERITIES.map(s => String(run.severityCounts[s] || 0).padStart(9)).join('') +
            String(run.generationFailures).padStart(10);
        console.log(`${run.label.padEnd(36)}${row}`);
    }
}

/**
 * Main entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const providerKeys = resolveProviderList(process.argv[2]);
    assertProviderKeysReady(providerKeys);

    const inputEntries = loadInputEntries();
    if (inputEntries.length !== 50)
        throw new Error(`Expected 50 entries in ${INPUT_FILE}, got ${inputEntries.length}.`);

    /** @type {Array<*>} */
    const runs = [];
    for (const key of providerKeys) {
        const provider = PROVIDERS[key];
        const providerConfig = provider.build();
        const run = await evalForProvider({
            providerKey: key,
            providerConfig,
            label: provider.label,
            inputEntries
        });
        runs.push(run);
    }

    printComparative(runs);
    printSeverityMatrix(runs);
    writeJsonSummary(runs);
    // Silence noisy unused imports for typed lint.
    void emptyMatrix; void formatConfusionMatrix;
}

if (require.main === module) {
    main().catch((/** @type {*} */ e) => {
        console.error('FATAL', e && e.message ? e.message : e);
        process.exit(1);
    });
}

module.exports = {
    loadInputEntries,
    generateForEntry,
    validateGenerated,
    crossProviderAgreement
};
