'use strict';

/**
 * @file Smoke-test manual contra una instalacion real de Ollama.
 *
 * Itera los casos definidos en `ollama-check-cases.js`, lanza la validacion
 * via `annotationsService.checkSentences` y vuelca el resultado en
 * `tests/agentic/results/`. No es parte de la suite automatica — se ejecuta
 * a mano cuando se cambia el prompt o el modelo.
 */

process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
process.env.OLLAMA_TIMEOUT_MS = process.env.OLLAMA_TIMEOUT_MS || '180000';

const fs = require('node:fs/promises');
const path = require('node:path');

const cases = require('./ollama-check-cases');
const { createAnnotationsService } = require('../../services/annotations-service');

const OUTPUT_DIR = path.join(__dirname, 'results');

/**
 * Ejecuta el banco manual contra el flujo real de validacion.
 * @returns {Promise<void>} Promesa de finalizacion.
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
 * Convierte argumentos CLI sencillos.
 * @param {Array<string>} args - Argumentos recibidos.
 * @returns {*} Argumentos normalizados.
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
 * Renderiza el resumen humano para revision manual.
 * @param {*} payload - Resultado completo.
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
 * Convierte fecha a sello de fichero.
 * @param {Date} date - Fecha.
 * @returns {string} Sello.
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
