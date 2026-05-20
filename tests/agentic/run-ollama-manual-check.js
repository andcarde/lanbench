'use strict';

/**
 * @file Manual smoke test against a real Ollama installation.
 *
 * Iterates the cases defined in `ollama-check-cases.js`, runs validation
 * via `annotationsService.checkSentences` and dumps the result into
 * `tests/agentic/results/`. It is not part of the automated suite — it is run
 * by hand when the prompt or the model changes.
 */

process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
process.env.OLLAMA_TIMEOUT_MS = process.env.OLLAMA_TIMEOUT_MS || '180000';

const fs = require('node:fs/promises');
const path = require('node:path');

const cases = require('./ollama-check-cases');
const { createAnnotationsService } = require('../../services/annotations-service');

const OUTPUT_DIR = path.join(__dirname, 'results');

/**
 * Runs the manual bench against the real validation flow.
 * @returns {Promise<void>} Completion promise.
 */
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const selectedCases = Number.isInteger(args.limit)
        ? cases.slice(0, args.limit)
        : cases;
    const service = createAnnotationsService();
    const runStartedAt = new Date();
    /** @type {any[]} */
    const results = [];

    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    for (const testCase of selectedCases) {
        const startedAt = Date.now();
        /** @type {any} */
        const result = {
            id: testCase.id,
            title: testCase.title,
            expectedReview: testCase.expectedReview,
            request: testCase.request,
            output: null,
            error: null,
            durationMs: null
        };

        try {
            result.output = await service.checkSentences(
                testCase.request.sentences,
                testCase.request.entryContext
            );
        } catch (caughtError) {
            const error = /** @type {any} */ (caughtError);
            result.error = {
                name: error && error.name,
                message: error && error.message
            };
        }

        result.durationMs = Date.now() - startedAt;
        results.push(result);
        process.stdout.write(`${result.error ? 'ERR' : 'OK '} ${testCase.id} (${result.durationMs} ms)\n`);
    }

    const stamp = toFileStamp(runStartedAt);
    const payload = {
        generatedAt: runStartedAt.toISOString(),
        mode: 'annotations-service.checkSentences',
        model: process.env.OLLAMA_MODEL,
        caseCount: selectedCases.length,
        results
    };

    const jsonPath = path.join(OUTPUT_DIR, `${stamp}-ollama-manual-results.json`);
    const markdownPath = path.join(OUTPUT_DIR, `${stamp}-ollama-manual-review.md`);

    await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.writeFile(markdownPath, renderMarkdown(payload), 'utf8');

    process.stdout.write(`\nJSON: ${jsonPath}\nReview: ${markdownPath}\n`);
}

/**
 * Parses simple CLI arguments.
 * @param {Array<string>} args - Received arguments.
 * @returns {*} Normalized arguments.
 */
function parseArgs(args) {
    /** @type {Record<string, any>} */
    const parsed = {};

    for (const arg of args) {
        if (arg.startsWith('--limit=')) {
            const limit = Number(arg.slice('--limit='.length));
            if (Number.isInteger(limit) && limit > 0)
                parsed.limit = limit;
        }
    }

    return parsed;
}

/**
 * Renders the human-readable summary for manual review.
 * @param {*} payload - Full result.
 * @returns {string} Markdown.
 */
function renderMarkdown(payload) {
    const lines = [
        '# Ollama Manual Review',
        '',
        `Generated at: ${payload.generatedAt}`,
        `Mode: ${payload.mode}`,
        `Model: ${payload.model}`,
        `Cases: ${payload.caseCount}`,
        ''
    ];

    for (const result of payload.results) {
        lines.push(`## ${result.id}`);
        lines.push('');
        lines.push(result.title);
        lines.push('');
        lines.push('Expected manual review:');
        for (const note of result.expectedReview)
            lines.push(`- ${note}`);
        lines.push('');
        lines.push('Output:');
        lines.push('```json');
        lines.push(JSON.stringify(result.error || result.output, null, 2));
        lines.push('```');
        lines.push('');
    }

    return `${lines.join('\n')}\n`;
}

/**
 * Converts a date to a file-name timestamp.
 * @param {Date} date - Fecha.
 * @returns {string} File-name timestamp.
 */
function toFileStamp(date) {
    return date.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '-')
        .replace('Z', '');
}

main().catch(error => {
    process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
});
