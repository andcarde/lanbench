'use strict';

/**
 * @file Live integration tests for the LLM logging pipeline.
 *
 * Drives each credential declared in `api-keys.json` against its real provider
 * through the production `llm-client` (which goes through `llm-http` and
 * `llm-logger`). For every prompt we:
 *
 *   1. Snapshot the daily LLM log size before the call.
 *   2. Invoke `generateText({ providerConfig, prompt })`.
 *   3. Measure wall-clock duration.
 *   4. Read the log delta and verify the model's response text was persisted.
 *
 * Run from the repo root with:
 *   node tests/integration/llm-keys/llm-keys-live-runner.js
 *
 * Writes a Markdown report to `LLM-LOG.md` at the repo root, including a
 * per-model average response time.
 *
 * These are integration tests by definition (external APIs). Calls can take
 * 20+ seconds, so the timeout is generous.
 */

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const llmClient = require('../../../utils/llm-client');
const llmLogger = require('../../../utils/llm-logger');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const API_KEYS_PATH = path.join(REPO_ROOT, 'api-keys.json');
const TEXT_XML_PATH = path.join(REPO_ROOT, 'test-datasets', 'test.xml');
const LOGS_DIR = path.join(REPO_ROOT, 'logs');
const REPORT_PATH = path.join(REPO_ROOT, 'LLM-LOG.md');

const PER_CALL_TIMEOUT_MS = 30000;
/** Min wait between calls per provider (free-tier RPM caps — Gemini = 5 RPM). */
const INTER_CALL_DELAY_MS = {
    'openai-compatible': 13000,
    'groq': 0
};
/** Retries (with backoff) when the upstream returns a transient error. */
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 20000;

/**
 * Builds the list of common test cases — each one is run against every key.
 * The YAML→JSON case is deterministic enough that we also assert on the
 * response content. The rest only assert that *some* response came back and
 * that the same text reached the daily log.
 *
 * The final translation/correction cases are seeded from `test-datasets/test.xml`.
 *
 * @param {{ enLex: string, ruLex: string, rdfTriple: string }} xmlSeeds
 * @returns {Array<{ id: string, title: string, prompt: string, expectedSubstring?: string }>}
 */
function buildTestCases(xmlSeeds) {
    const yamlBlock = 'name: Andres\nage: 30\nactive: true';
    const expectedJson = '{"name":"Andres","age":30,"active":true}';

    return [
        {
            id: 'yaml-to-json',
            title: 'YAML→JSON (deterministic)',
            prompt:
                'Convert the following YAML to JSON. ' +
                'Respond ONLY with the JSON object, no markdown, no commentary, ' +
                'no code fences, no extra whitespace. The exact expected output is:\n' +
                expectedJson + '\n\n' +
                'YAML to convert:\n' + yamlBlock,
            expectedJson
        },
        {
            id: 'adivinanza',
            title: 'Adivinanza (riddle, non-deterministic)',
            prompt:
                'Inventa una adivinanza breve en español sobre el agua, en 2 versos rimados. ' +
                'Responde solo con la adivinanza, sin la solución.'
        },
        {
            id: 'math-op',
            title: 'Math operation (semi-deterministic)',
            prompt:
                'What is 17 * 23? Respond with the numeric result only, no words, ' +
                'no punctuation, no explanation.',
            expectedSubstring: '391'
        },
        {
            id: 'concept-microservicios',
            title: 'Brief explanation of "Microservicios" (2–3 lines)',
            prompt:
                'Explica brevemente, en español, qué son los microservicios. ' +
                'Limítate a 2 o 3 líneas. No uses listas ni encabezados.'
        },
        {
            id: 'translation-en-es',
            title: 'Translation EN→ES (from text.xml lex)',
            prompt:
                'Traduce la siguiente frase del inglés al español. ' +
                'Responde solo con la traducción, sin comentarios.\n\n' +
                'Inglés: ' + xmlSeeds.enLex
        },
        {
            id: 'translation-rdf-es',
            title: 'Translation RDF→ES (from text.xml triple)',
            prompt:
                'A continuación tienes un triple RDF con sujeto | predicado | objeto. ' +
                'Genera una oración en español que verbalice ese triple de forma natural. ' +
                'Responde solo con la oración, sin comentarios.\n\n' +
                'Triple: ' + xmlSeeds.rdfTriple
        },
        {
            id: 'correction-en-es-correct',
            title: 'Correction EN→ES (correct translation)',
            prompt:
                'Eres un corrector de traducciones inglés→español. Te doy una oración en ' +
                'inglés y una propuesta en español. Responde EXACTAMENTE con "OK" si la ' +
                'traducción es correcta, o "ERROR: <breve explicación>" si no lo es.\n\n' +
                'Inglés: Austin is the capital of Texas.\n' +
                'Español propuesto: Austin es la capital de Texas.',
            expectedSubstring: 'OK'
        },
        {
            id: 'correction-en-es-typo',
            title: 'Correction EN→ES (orthographic mistake)',
            prompt:
                'Eres un corrector de traducciones inglés→español. Te doy una oración en ' +
                'inglés y una propuesta en español. Responde EXACTAMENTE con "OK" si la ' +
                'traducción es correcta, o "ERROR: <breve explicación>" si no lo es.\n\n' +
                'Inglés: Texas is in the United States.\n' +
                'Español propuesto: Texas esta en los Hestados Hunidos.',
            expectedSubstring: 'ERROR'
        },
        {
            id: 'correction-rdf-es-correct',
            title: 'Correction RDF→ES (correct verbalisation)',
            prompt:
                'Eres un corrector. Te doy un triple RDF y una verbalización en español. ' +
                'Responde EXACTAMENTE con "OK" si la verbalización es fiel al triple, o ' +
                '"ERROR: <breve explicación>" si introduce datos incorrectos.\n\n' +
                'Triple: Texas | capital | Austin\n' +
                'Español: Austin es la capital de Texas.',
            expectedSubstring: 'OK'
        },
        {
            id: 'correction-rdf-es-wrong-entity',
            title: 'Correction RDF→ES (wrong entity, e.g. avión vs avioneta)',
            prompt:
                'Eres un corrector. Te doy un triple RDF y una verbalización en español. ' +
                'Responde EXACTAMENTE con "OK" si la verbalización es fiel al triple, o ' +
                '"ERROR: <breve explicación>" si introduce datos incorrectos.\n\n' +
                'Triple: Turkmenistan_Airlines | headquarters | Ashgabat\n' +
                'Español: La sede de Turkmenistan Airlines está en Moscú.',
            expectedSubstring: 'ERROR'
        }
    ];
}

/**
 * Reads `api-keys.json` and shapes each entry into a `providerConfig` accepted
 * by `llm-client.generateText`.
 *
 * @returns {Promise<Array<{ label: string, providerConfig: Record<string, any> }>>}
 */
async function loadProviderConfigs() {
    const raw = await fsPromises.readFile(API_KEYS_PATH, 'utf8');
    const entries = JSON.parse(raw);
    return entries.map(entry => ({
        label: `${entry.proveedor} / ${entry.modelo}`,
        providerConfig: {
            provider: entry.proveedor,
            apiBase: entry.url_base,
            model: entry.modelo,
            apiKey: entry.api_key,
            timeoutMs: PER_CALL_TIMEOUT_MS
        }
    }));
}

/**
 * Extracts the seed strings for the translation/correction cases from the
 * canonical XML dataset. We pick the first English lex and its triple.
 *
 * @returns {Promise<{ enLex: string, ruLex: string, rdfTriple: string }>}
 */
async function loadXmlSeeds() {
    const xml = await fsPromises.readFile(TEXT_XML_PATH, 'utf8');
    const enMatch = xml.match(/<lex[^>]*lang="en"[^>]*>([^<]+)<\/lex>/);
    const ruMatch = xml.match(/<lex[^>]*lang="ru"[^>]*>([^<]+)<\/lex>/);
    const tripleMatch = xml.match(/<otriple>([^<]+)<\/otriple>/);
    return {
        enLex: enMatch ? enMatch[1].trim() : 'Texas is in the United States.',
        ruLex: ruMatch ? ruMatch[1].trim() : '',
        rdfTriple: tripleMatch
            ? tripleMatch[1].trim()
            : 'Texas | capital | Austin'
    };
}

/**
 * Resolves the path of the daily LLM log file (mirrors `llm-logger`).
 *
 * @param {Date} date
 * @returns {string}
 */
function dailyLogPath(date) {
    const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
    const name = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-llm.txt`;
    return path.join(LOGS_DIR, name);
}

/**
 * Returns the byte length of a file or 0 when it does not exist yet.
 *
 * @param {string} filePath
 * @returns {number}
 */
function fileSizeOrZero(filePath) {
    try {
        return fs.statSync(filePath).size;
    } catch {
        return 0;
    }
}

/**
 * Reads the slice of a file written since `previousSize`.
 *
 * @param {string} filePath
 * @param {number} previousSize
 * @returns {string}
 */
function readLogDelta(filePath, previousSize) {
    if (!fs.existsSync(filePath))
        return '';

    const buffer = fs.readFileSync(filePath, 'utf8');
    return buffer.slice(previousSize);
}

/**
 * Picks a short slice from the response text that should appear verbatim in
 * the log. We use up to the first 60 chars (avoiding leading whitespace) so
 * that minor truncation/escaping in the log doesn't trip the check.
 *
 * @param {string} response
 * @returns {string}
 */
function takeSignature(response) {
    const trimmed = (response || '').trim();
    const firstLine = trimmed.split(/\r?\n/)[0] || '';
    return firstLine.slice(0, Math.min(60, firstLine.length));
}

/**
 * Sleeps for the given number of milliseconds. Skipped when `ms <= 0`.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
    if (ms <= 0)
        return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects rate-limit / transient upstream failures so we can retry them.
 *
 * @param {string} message
 * @returns {boolean}
 */
function isTransientError(message) {
    return /respondió con (429|500|502|503|504)/.test(String(message || ''));
}

/**
 * Executes a single test case against a single provider config and returns a
 * structured outcome describing what happened.
 *
 * @param {{ label: string, providerConfig: Record<string, any> }} provider
 * @param {{ id: string, title: string, prompt: string, expectedJson?: string, expectedSubstring?: string }} testCase
 * @returns {Promise<Record<string, any>>}
 */
async function runOneTest(provider, testCase) {
    const logFile = dailyLogPath(new Date());
    const sizeBefore = fileSizeOrZero(logFile);
    const startedAt = Date.now();
    /** @type {Record<string, any>} */
    const outcome = {
        provider: provider.label,
        model: provider.providerConfig.model,
        id: testCase.id,
        title: testCase.title,
        prompt: testCase.prompt,
        response: null,
        durationMs: null,
        loggedFound: false,
        contentCheck: null,
        error: null
    };

    let attempt = 0;
    /** @type {string|null} */
    let lastError = null;
    while (attempt <= MAX_RETRIES) {
        attempt += 1;
        try {
            const response = await llmClient.generateText({
                providerConfig: provider.providerConfig,
                prompt: testCase.prompt
            });
            outcome.durationMs = Date.now() - startedAt;
            outcome.response = response;
            outcome.attempts = attempt;

            await llmLogger.flush();
            const delta = readLogDelta(logFile, sizeBefore);
            const signature = takeSignature(response);
            outcome.loggedFound = Boolean(signature) && delta.includes(signature);

            outcome.contentCheck = evaluateContent(testCase, response);
            return outcome;
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            lastError = error?.message || String(error);
            if (attempt <= MAX_RETRIES && isTransientError(lastError)) {
                await sleep(RETRY_BACKOFF_MS);
                continue;
            }
            outcome.durationMs = Date.now() - startedAt;
            outcome.error = lastError;
            outcome.attempts = attempt;
            return outcome;
        }
    }
    outcome.durationMs = Date.now() - startedAt;
    outcome.error = lastError;
    return outcome;

    return outcome;
}

/**
 * Optional correctness check for cases that have a known expected output.
 *
 * @param {Record<string, any>} testCase
 * @param {string} response
 * @returns {{ ok: boolean, reason: string }|null}
 */
function evaluateContent(testCase, response) {
    if (testCase.expectedJson) {
        const ok = matchesExpectedJson(response, testCase.expectedJson);
        return {
            ok,
            reason: ok ? 'response parses to the expected JSON' : 'response did not match expected JSON'
        };
    }
    if (testCase.expectedSubstring) {
        const ok = (response || '').includes(testCase.expectedSubstring);
        return {
            ok,
            reason: ok ? `contains "${testCase.expectedSubstring}"` : `missing "${testCase.expectedSubstring}"`
        };
    }
    return null;
}

/**
 * Compares the response to an expected JSON shape regardless of formatting.
 *
 * @param {string} response
 * @param {string} expectedJson
 * @returns {boolean}
 */
function matchesExpectedJson(response, expectedJson) {
    const stripped = stripFences(response).trim();
    try {
        const parsed = JSON.parse(stripped);
        const expected = JSON.parse(expectedJson);
        return JSON.stringify(parsed) === JSON.stringify(expected);
    } catch {
        return false;
    }
}

/**
 * Removes markdown code fences when a model insists on wrapping JSON.
 *
 * @param {string} value
 * @returns {string}
 */
function stripFences(value) {
    if (typeof value !== 'string')
        return '';
    return value
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .replace(/^```/, '');
}

/**
 * Groups outcomes by model and computes the mean response time across the
 * successful calls only.
 *
 * @param {Array<Record<string, any>>} outcomes
 * @returns {Array<{ model: string, count: number, avgMs: number, succeeded: number }>}
 */
function summariseAverages(outcomes) {
    /** @type {Map<string, { totalMs: number, count: number, succeeded: number }>} */
    const buckets = new Map();
    for (const o of outcomes) {
        const key = o.model;
        const bucket = buckets.get(key) || { totalMs: 0, count: 0, succeeded: 0 };
        if (typeof o.durationMs === 'number') {
            bucket.totalMs += o.durationMs;
            bucket.count += 1;
        }
        if (!o.error)
            bucket.succeeded += 1;
        buckets.set(key, bucket);
    }
    return Array.from(buckets.entries()).map(([model, b]) => ({
        model,
        count: b.count,
        avgMs: b.count > 0 ? Math.round(b.totalMs / b.count) : 0,
        succeeded: b.succeeded
    }));
}

/**
 * Renders the Markdown report.
 *
 * @param {Array<Record<string, any>>} outcomes
 * @param {Array<{ model: string, count: number, avgMs: number, succeeded: number }>} averages
 * @returns {string}
 */
function renderReport(outcomes, averages) {
    const now = new Date().toISOString();
    const lines = [];
    lines.push('# LLM logging — live integration test report');
    lines.push('');
    lines.push(`> Generated at ${now} by \`tests/integration/llm-keys/llm-keys-live-runner.js\``);
    lines.push('');
    lines.push('## Scope');
    lines.push('');
    lines.push('Each credential listed in `api-keys.json` is exercised through the production');
    lines.push('`llm-client` pipeline (which writes a REQUEST/RESPONSE pair to');
    lines.push('`logs/YYYY-MM-DD-llm.txt`). For every call we capture the response text and');
    lines.push('verify it shows up in the daily log delta written during the call.');
    lines.push('');
    lines.push('## Average response time per model');
    lines.push('');
    lines.push('| Model | Calls | Avg duration (ms) | Successful calls |');
    lines.push('|-------|-------|-------------------|------------------|');
    for (const row of averages)
        lines.push(`| ${row.model} | ${row.count} | ${row.avgMs} | ${row.succeeded} |`);
    lines.push('');
    lines.push('## Detailed results');
    lines.push('');

    let lastProvider = '';
    for (const o of outcomes) {
        if (o.provider !== lastProvider) {
            lines.push(`### ${o.provider}`);
            lines.push('');
            lastProvider = o.provider;
        }

        lines.push(`#### ${o.id} — ${o.title}`);
        lines.push('');
        lines.push(`- **Duration**: ${o.durationMs ?? '-'} ms`);
        lines.push(`- **Logged in daily file**: ${o.loggedFound ? 'yes' : 'no'}`);
        if (o.contentCheck)
            lines.push(`- **Content check**: ${o.contentCheck.ok ? 'pass' : 'fail'} — ${o.contentCheck.reason}`);
        if (o.error)
            lines.push(`- **Error**: ${codeQuote(o.error)}`);
        lines.push('');
        lines.push('Prompt:');
        lines.push('');
        lines.push(fencedBlock(o.prompt));
        lines.push('');
        if (o.response !== null) {
            lines.push('Response:');
            lines.push('');
            lines.push(fencedBlock(String(o.response)));
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Wraps content into a fenced block, escaping any pre-existing fences.
 *
 * @param {string} value
 * @returns {string}
 */
function fencedBlock(value) {
    const safe = String(value).replace(/```/g, "''' ");
    return ['```', safe, '```'].join('\n');
}

/**
 * Inline-codes a single-line value.
 *
 * @param {string} value
 * @returns {string}
 */
function codeQuote(value) {
    return '`' + String(value).replace(/`/g, "'") + '`';
}

/**
 * Driver — runs every test case against every provider, prints a one-line
 * status per call, and writes the Markdown report at the end.
 */
async function main() {
    await fsPromises.mkdir(LOGS_DIR, { recursive: true });
    const providers = await loadProviderConfigs();
    const seeds = await loadXmlSeeds();
    const testCases = buildTestCases(seeds);

    /** @type {Array<Record<string, any>>} */
    const outcomes = [];

    for (const provider of providers) {
        const providerKey = String(provider.providerConfig.provider || '').toLowerCase();
        const interCallDelay = INTER_CALL_DELAY_MS[providerKey] ?? 0;
        console.log(`\n=== Provider: ${provider.label} (inter-call delay: ${interCallDelay} ms) ===`);
        let firstInProvider = true;
        for (const testCase of testCases) {
            if (!firstInProvider && interCallDelay > 0) {
                process.stdout.write(`  (waiting ${interCallDelay} ms for RPM budget) ...\n`);
                // eslint-disable-next-line no-await-in-loop
                await sleep(interCallDelay);
            }
            firstInProvider = false;
            process.stdout.write(`  ${testCase.id} ... `);
            // eslint-disable-next-line no-await-in-loop
            const outcome = await runOneTest(provider, testCase);
            outcomes.push(outcome);
            const status = outcome.error
                ? `ERROR (${outcome.durationMs} ms)`
                : `OK (${outcome.durationMs} ms, logged=${outcome.loggedFound})`;
            console.log(status);
            if (outcome.error)
                console.log(`    -> ${outcome.error}`);
        }
    }

    const averages = summariseAverages(outcomes);
    const report = renderReport(outcomes, averages);
    await fsPromises.writeFile(REPORT_PATH, report, 'utf8');
    console.log(`\nReport written to ${path.relative(REPO_ROOT, REPORT_PATH)}`);

    const failed = outcomes.filter(o => o.error || (o.contentCheck && !o.contentCheck.ok) || !o.loggedFound);
    if (failed.length > 0) {
        console.log(`\nFailures or warnings: ${failed.length}`);
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('Runner crashed:', error);
    process.exit(2);
});
