'use strict';

/**
 * @file Evaluation harness for the AI-correction pipeline quality
 * (multi-provider).
 *
 * Parses a `correction-N-input.xml` corpus, runs the REAL correction pipeline
 * (`domain/spanish/spanish-service.js#checkBatch`: rule-checker + LLM +
 * coverage-checker + alert-merger) over each entry's Spanish candidate against
 * each requested provider, derives the produced verdict severity (acceptance /
 * warning / error), and scores it against `correction-N-expected.json` (the
 * human ground truth).
 *
 * Output per provider: a per-entry comparison, a confusion matrix and the
 * agreement %. With more than one provider, a comparative table is also
 * printed at the end.
 *
 * Usage:
 *   node scripts/eval-correction-quality.js [size] [provider]
 *     - size     : 10 | 20 | 30 | 40 | 50 (default 10)
 *     - provider : groq | gemini | all  (default all)
 *
 * API keys are read from `.env` via `config.js` (GROQ_API_KEY, GEMINI_API_KEY).
 * The harness NEVER prints keys, only the model id and a coarse "ok|missing"
 * presence flag — required by the test plan.
 */

const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { createSpanishService } = require('../domain/spanish/spanish-service');
const ollamaSpanishChecker = require('../domain/spanish/ollama-spanish-checker');
const { createBenchmarkXmlParser, toArray, nodeText, parsePipeTriple } = require('../utils/xml-format');

const CORPUS_DIR = path.join(__dirname, '..', 'test-datasets');
const SEVERITIES = ['ok', 'warning', 'error'];
const REPORT_DIR = path.join(__dirname, '..', 'documentation', 'eval-output');

/**
 * Provider catalog used by the harness. Adding a new provider here is enough
 * for the CLI to route to it. The apiKey is read from config so it never
 * appears in the script or any log line. `pacing` carries the per-provider
 * throttling parameters used to stay under each free-tier rate limit (Groq
 * ≈ 30 RPM, Gemini 2.5 Flash free ≈ 10 RPM).
 *
 * @type {Record<string, { label:string, build: () => Record<string, any>, env:string, pacing:{ interEntryMs:number, retries:number, backoffBaseMs:number } }>}
 */
const PROVIDERS = {
    groq: {
        label: 'Groq Llama-3.x 70B',
        env: 'GROQ_API_KEY',
        pacing: { interEntryMs: 700, retries: 5, backoffBaseMs: 800 },
        build: () => ({
            provider: 'groq',
            apiBase: config.groq.apiBase,
            model: config.groq.model,
            apiKey: config.groq.apiKey
        })
    },
    gemini: {
        label: 'Google AI Studio Gemini Flash',
        env: 'GEMINI_API_KEY',
        pacing: { interEntryMs: 6500, retries: 6, backoffBaseMs: 4000 },
        build: () => ({
            provider: 'google-ai-studio',
            apiBase: config.gemini.apiBase,
            model: config.gemini.model,
            apiKey: config.gemini.apiKey
        })
    }
};

/**
 * Parses a correction input fixture into evaluatable entries.
 * @param {string} file
 * @returns {Array<{ eid:number, category:string, triples:Array<*>, english:string|null, candidate:string }>}
 */
function loadInputEntries(file) {
    const xml = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8');
    const parsed = createBenchmarkXmlParser().parse(xml);
    const entries = toArray(parsed?.benchmark?.entries?.entry);

    return entries.map((/** @type {*} */ entry) => {
        const triples = toArray(entry?.modifiedtripleset)
            .flatMap((/** @type {*} */ ts) => toArray(ts?.mtriple))
            .map(parsePipeTriple)
            .filter(Boolean);
        const lexes = toArray(entry?.lex);
        const english = lexes
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'en')
            .map(nodeText)
            .find(Boolean) || null;
        const candidate = lexes
            .filter((/** @type {*} */ l) => l && l['@_lang'] === 'es')
            .map(nodeText)
            .find(Boolean) || '';
        return {
            eid: Number(entry?.['@_eid']),
            category: String(entry?.['@_category'] || ''),
            triples,
            english,
            candidate
        };
    });
}

/**
 * Derives the verdict severity (ok/warning/error) from a pipeline result.
 * @param {*} result
 * @returns {{ severity:string, codes:string[], messages:string[] }}
 */
function deriveVerdict(result) {
    const alerts = Array.isArray(result?.alerts) ? result.alerts : [];
    const codes = alerts.map((/** @type {*} */ a) => a.code);
    const messages = alerts.map((/** @type {*} */ a) => `${a.severity}:${a.code}:${a.message}`);

    if (result?.valid === true && alerts.length === 0)
        return { severity: 'ok', codes, messages };

    if (alerts.some((/** @type {*} */ a) => a.severity === 'error'))
        return { severity: 'error', codes, messages };
    if (alerts.some((/** @type {*} */ a) => a.severity === 'warning'))
        return { severity: 'warning', codes, messages };

    return { severity: result?.valid === false ? 'error' : 'ok', codes, messages };
}

/**
 * Runs the pipeline over one entry and returns its produced verdict.
 * @param {Record<string, any>} service
 * @param {Record<string, any>} entry
 * @param {Record<string, any>} providerConfig
 * @returns {Promise<{ severity:string, codes:string[], messages:string[] }>}
 */
async function evaluateEntry(service, entry, providerConfig) {
    const context = {
        triples: entry.triples,
        englishSentences: entry.english ? [entry.english] : [],
        category: entry.category,
        entryId: entry.eid,
        providerConfig
    };
    const results = await service.checkBatch([entry.candidate], context);
    return deriveVerdict(results[0]);
}

/**
 * Pretty-prints a 3x3 confusion matrix (expected rows × produced columns).
 * @param {Record<string, Record<string, number>>} matrix
 * @returns {string}
 */
function formatConfusionMatrix(matrix) {
    const lines = [];
    lines.push('Confusion matrix (rows = expected, cols = produced):');
    lines.push(`${''.padEnd(10)}${SEVERITIES.map(s => s.padStart(9)).join('')}`);
    for (const expected of SEVERITIES) {
        const row = SEVERITIES.map(produced => String(matrix[expected][produced]).padStart(9)).join('');
        lines.push(`${expected.padEnd(10)}${row}`);
    }
    return lines.join('\n');
}

/**
 * Builds an empty 3x3 confusion matrix.
 * @returns {Record<string, Record<string, number>>}
 */
function emptyMatrix() {
    /** @type {Record<string, Record<string, number>>} */
    const matrix = {};
    for (const e of SEVERITIES) {
        matrix[e] = {};
        for (const p of SEVERITIES)
            matrix[e][p] = 0;
    }
    return matrix;
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
 * Wraps the semantic checker's checkBatch with retry+back-off and a shared
 * flag that records the LAST call's failure. Without this, transient 429s
 * masquerade as "acceptance" because `spanish-service.checkBatch` silently
 * degrades to the rule-only result.
 *
 * @param {Record<string, any>} checker
 * @param {{ failed: boolean }} flag
 * @param {number} retries
 * @returns {{ check: Function, checkBatch: Function }}
 */
function retryingChecker(checker, flag, retries, backoffBaseMs = 800) {
    return {
        check: checker.check,
        async checkBatch(/** @type {*} */ sentences, /** @type {*} */ context) {
            for (let attempt = 0; attempt <= retries; attempt += 1) {
                try {
                    const result = await checker.checkBatch(sentences, context);
                    flag.failed = false;
                    return result;
                } catch (caughtError) {
                    if (attempt === retries) {
                        flag.failed = true;
                        throw caughtError;
                    }
                    await sleep(backoffBaseMs * (attempt + 1));
                }
            }
            return [];
        }
    };
}

/**
 * Runs the full eval for one provider and returns the structured result.
 *
 * @param {{ providerKey:string, providerConfig:Record<string, any>, label:string, size:number, inputEntries:Array<*>, expectedByEid:Map<number, *> }} options
 * @returns {Promise<{ providerKey:string, label:string, model:string, size:number, matches:number, total:number, matrix:Record<string, Record<string, number>>, perEntry:Array<*>, mismatches:Array<*>, llmFailures:number }>}
 */
async function evalForProvider({ providerKey, providerConfig, label, size, inputEntries, expectedByEid }) {
    const pacing = PROVIDERS[providerKey].pacing;
    const llmFlag = { failed: false };
    const semanticChecker = retryingChecker(
        { check: ollamaSpanishChecker.check, checkBatch: ollamaSpanishChecker.checkBatch },
        llmFlag,
        pacing.retries,
        pacing.backoffBaseMs
    );
    const service = createSpanishService({ semanticChecker });

    console.log(`\n=== AI-correction quality eval — ${label} — correction-${size}-input.xml (model: ${providerConfig.model}) ===\n`);

    const matrix = emptyMatrix();
    /** @type {Array<{ entry:Record<string, any>, exp:Record<string, any>, produced:Record<string, any>, match:boolean }>} */
    const perEntry = [];
    /** @type {Array<{ entry:Record<string, any>, exp:Record<string, any>, produced:Record<string, any> }>} */
    const mismatches = [];
    let matches = 0;
    let llmFailures = 0;

    console.log(`${'eid'.padEnd(4)}${'expected'.padEnd(10)}${'produced'.padEnd(10)}match  candidate`);
    for (const entry of inputEntries) {
        llmFlag.failed = false;
        let produced;
        try {
            const verdict = await evaluateEntry(service, entry, providerConfig);
            produced = llmFlag.failed
                ? { severity: 'LLM_FAIL', codes: [], messages: ['LLM call failed after retries; pipeline fell back to rule-only.'] }
                : verdict;
        } catch (caughtError) {
            const err = /** @type {any} */ (caughtError);
            produced = { severity: 'LLM_FAIL', codes: [], messages: [`exception: ${err && err.message}`] };
        }
        if (produced.severity === 'LLM_FAIL')
            llmFailures += 1;

        const exp = expectedByEid.get(entry.eid);
        const isMatch = exp && exp.expectedSeverity === produced.severity;
        if (isMatch) matches += 1;
        if (matrix[exp?.expectedSeverity] && matrix[exp?.expectedSeverity][produced.severity] !== undefined)
            matrix[exp.expectedSeverity][produced.severity] += 1;

        console.log(`${String(entry.eid).padEnd(4)}${String(exp?.expectedSeverity).padEnd(10)}${produced.severity.padEnd(10)}${isMatch ? ' ok ' : ' XX '}  ${entry.candidate}`);
        perEntry.push({ entry, exp, produced, match: !!isMatch });
        if (!isMatch && exp)
            mismatches.push({ entry, exp, produced });

        await sleep(pacing.interEntryMs);
    }

    console.log(`\n${formatConfusionMatrix(matrix)}`);
    console.log(`\nAgreement: ${matches}/${inputEntries.length} = ${(100 * matches / inputEntries.length).toFixed(1)}%   |   LLM_FAIL: ${llmFailures}`);

    if (mismatches.length) {
        console.log('\n--- Mismatches (for tuning) ---');
        for (const m of mismatches) {
            console.log(`\n[eid ${m.entry.eid}] expected=${m.exp.expectedSeverity} (${(m.exp.expectedCodes || []).join('|') || 'none'}) produced=${m.produced.severity}`);
            console.log(`  candidate : ${m.entry.candidate}`);
            console.log(`  triples   : ${m.entry.triples.map((/** @type {*} */ t) => `${t.subject}|${t.predicate}|${t.object}`).join(' ; ')}`);
            console.log(`  rationale : ${m.exp.rationale}`);
            console.log(`  alerts    : ${m.produced.messages.join(' || ') || '(none)'}`);
        }
    }

    return {
        providerKey,
        label,
        model: providerConfig.model,
        size,
        matches,
        total: inputEntries.length,
        matrix,
        perEntry,
        mismatches,
        llmFailures
    };
}

/**
 * Prints a comparative table of provider agreements.
 * @param {Array<*>} runs
 * @returns {void}
 */
function printComparative(runs) {
    if (runs.length < 2)
        return;
    console.log('\n=== Comparative summary ===\n');
    console.log(`${'provider'.padEnd(36)}${'model'.padEnd(32)}${'agreement'.padStart(12)}${'LLM_FAIL'.padStart(10)}`);
    for (const run of runs) {
        const pct = (100 * run.matches / run.total).toFixed(1);
        console.log(`${run.label.padEnd(36)}${run.model.padEnd(32)}${`${run.matches}/${run.total} (${pct}%)`.padStart(12)}${String(run.llmFailures).padStart(10)}`);
    }
}

/**
 * Resolves the provider list from the CLI flag.
 * @param {string|undefined} value
 * @returns {string[]}
 */
function resolveProviderList(value) {
    const normalized = (value || 'all').trim().toLowerCase();
    if (normalized === 'all')
        return ['groq', 'gemini'];
    if (!PROVIDERS[normalized])
        throw new Error(`Unknown provider: ${value}. Choose one of: groq, gemini, all.`);
    return [normalized];
}

/**
 * Asserts every requested provider has a key configured. Does NOT log the key.
 * @param {string[]} providerKeys
 * @returns {void}
 */
function assertProviderKeysReady(providerKeys) {
    /** @type {string[]} */
    const missing = [];
    for (const key of providerKeys) {
        const provider = PROVIDERS[key];
        const cfg = provider.build();
        if (!cfg.apiKey || cfg.apiKey.length === 0)
            missing.push(`${provider.env} (for ${provider.label})`);
    }
    if (missing.length > 0)
        throw new Error(`Missing required env var(s): ${missing.join(', ')}. Set them in .env (they are never printed).`);
}

/**
 * Writes a JSON summary of the run to documentation/eval-output/ so the report
 * can be rebuilt without re-running the eval.
 * @param {number} size
 * @param {Array<*>} runs
 * @returns {string}
 */
function writeJsonSummary(size, runs) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const filePath = path.join(REPORT_DIR, `correction-${size}-results.json`);

    // Merge with any existing file so a single-provider run preserves the
    // other provider's data. Same provider replaces the existing entry.
    /** @type {Array<*>} */
    let priorRuns = [];
    if (fs.existsSync(filePath)) {
        try {
            const prior = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (prior && prior.kind === 'correction-quality' && Array.isArray(prior.runs))
                priorRuns = prior.runs;
        } catch { /* corrupt file → overwrite */ }
    }

    const newProviderKeys = new Set(runs.map((r) => r.providerKey));
    const mergedRuns = [
        ...priorRuns.filter((r) => !newProviderKeys.has(r.providerKey)),
        ...runs.map((run) => ({
            providerKey: run.providerKey,
            label: run.label,
            model: run.model,
            size: run.size,
            matches: run.matches,
            total: run.total,
            agreementPct: Number((100 * run.matches / run.total).toFixed(1)),
            llmFailures: run.llmFailures,
            confusionMatrix: run.matrix,
            mismatches: run.mismatches.map((m) => ({
                eid: m.entry.eid,
                expectedSeverity: m.exp.expectedSeverity,
                expectedCodes: m.exp.expectedCodes,
                producedSeverity: m.produced.severity,
                candidate: m.entry.candidate,
                rationale: m.exp.rationale,
                alerts: m.produced.messages
            }))
        }))
    ];

    const out = {
        kind: 'correction-quality',
        size,
        runs: mergedRuns,
        generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`\n📄 wrote ${path.relative(process.cwd(), filePath)}`);
    return filePath;
}

/**
 * Main entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const size = Number(process.argv[2] || 10);
    if (![10, 20, 30, 40, 50].includes(size))
        throw new Error(`size must be one of 10|20|30|40|50 (got ${size}).`);

    const providerKeys = resolveProviderList(process.argv[3]);
    assertProviderKeysReady(providerKeys);

    const inputEntries = loadInputEntries(`correction-${size}-input.xml`);
    const expected = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, `correction-${size}-expected.json`), 'utf8'));
    /** @type {Map<number, *>} */
    const expectedByEid = new Map(expected.entries.map((/** @type {*} */ e) => [e.eid, e]));

    /** @type {Array<*>} */
    const runs = [];
    for (const key of providerKeys) {
        const provider = PROVIDERS[key];
        const providerConfig = provider.build();
        const run = await evalForProvider({
            providerKey: key,
            providerConfig,
            label: provider.label,
            size,
            inputEntries,
            expectedByEid
        });
        runs.push(run);
    }

    printComparative(runs);
    writeJsonSummary(size, runs);
}

if (require.main === module) {
    main().catch((/** @type {*} */ e) => {
        console.error('FATAL', e && e.message ? e.message : e);
        process.exit(1);
    });
}

module.exports = {
    PROVIDERS,
    loadInputEntries,
    deriveVerdict,
    emptyMatrix,
    formatConfusionMatrix,
    resolveProviderList,
    assertProviderKeysReady
};
