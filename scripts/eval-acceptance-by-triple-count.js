'use strict';

/**
 * @file Acceptance rate of the human reviewer by RDF triple count (k = 1..7).
 *
 * Single source of truth: documentation/experiment-dataset/corrected.json
 * (the snapshot of the experiment-2-user dataset after the human review pass,
 * as declared in memory/secciones/05_Experimento.tex and produced by
 * scripts/backup-experiment-2-user.js).
 *
 * Definition of "accepted" per entry (operational projection of the binary
 * rubric described in §"Revisión humana" of 05_Experimento.tex):
 *   - every annotation has wasCorrected === false, AND
 *   - every decisions[].decision === 'accepted'.
 *
 * Output is a deterministic table by triple count from k=1 to k=7 with the
 * count of entries, the count of accepted entries, and the acceptance rate
 * expressed as a percentage (mean over entries).
 *
 * Usage:
 *   node scripts/eval-acceptance-by-triple-count.js
 *     [--input <path>]
 *     [--json]
 *
 * The script never touches the database nor the network.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INPUT = path.join(
    __dirname,
    '..',
    'documentation',
    'experiment-dataset',
    'corrected.json'
);

/**
 * Parses CLI arguments into a plain options object.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ input: string, json: boolean }}
 */
function parseArgs(argv) {
    const options = { input: DEFAULT_INPUT, json: false };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--input') {
            const next = argv[i + 1];
            if (!next) throw new Error('Missing value for --input');
            options.input = path.resolve(next);
            i += 1;
        } else if (token === '--json') {
            options.json = true;
        } else {
            throw new Error(`Unknown argument: ${token}`);
        }
    }
    return options;
}

/**
 * Returns true when every annotation of the entry was accepted by the reviewer
 * without rewriting, i.e. wasCorrected === false and all decision verdicts
 * are 'accepted'.
 * @param {{ annotations?: Array<{ wasCorrected?: boolean, decisions?: Array<{ decision?: string }> }> }} entry
 * @returns {boolean}
 */
function isEntryAccepted(entry) {
    const annotations = Array.isArray(entry.annotations) ? entry.annotations : [];
    if (annotations.length === 0) return false;
    return annotations.every((annotation) => {
        if (annotation.wasCorrected !== false) return false;
        const decisions = Array.isArray(annotation.decisions) ? annotation.decisions : [];
        if (decisions.length === 0) return false;
        return decisions.every((decision) => decision.decision === 'accepted');
    });
}

/**
 * Computes the acceptance breakdown by triple count k ∈ {1..7}.
 * @param {{ entries: Array<{ size: number }> }} snapshot
 * @returns {{
 *   rows: Array<{ k: number, n: number, accepted: number, ratePercent: number }>,
 *   total: { n: number, accepted: number, ratePercent: number }
 * }}
 */
function computeAcceptanceByTripleCount(snapshot) {
    const buckets = new Map();
    for (let k = 1; k <= 7; k += 1) buckets.set(k, { n: 0, accepted: 0 });

    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    for (const entry of entries) {
        const k = Number(entry.size);
        if (!Number.isInteger(k) || k < 1 || k > 7) continue;
        const bucket = buckets.get(k);
        bucket.n += 1;
        if (isEntryAccepted(entry)) bucket.accepted += 1;
    }

    const rows = [];
    let totalN = 0;
    let totalAccepted = 0;
    for (let k = 1; k <= 7; k += 1) {
        const bucket = buckets.get(k);
        const ratePercent = bucket.n === 0 ? 0 : (bucket.accepted / bucket.n) * 100;
        rows.push({
            k,
            n: bucket.n,
            accepted: bucket.accepted,
            ratePercent: roundOneDecimal(ratePercent)
        });
        totalN += bucket.n;
        totalAccepted += bucket.accepted;
    }

    return {
        rows,
        total: {
            n: totalN,
            accepted: totalAccepted,
            ratePercent: totalN === 0 ? 0 : roundOneDecimal((totalAccepted / totalN) * 100)
        }
    };
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundOneDecimal(value) {
    return Math.round(value * 10) / 10;
}

/**
 * Renders the breakdown as a plain-text table.
 * @param {ReturnType<typeof computeAcceptanceByTripleCount>} result
 * @returns {string}
 */
function renderTable(result) {
    const lines = [];
    lines.push('Acceptance rate by RDF triple count (corrected.json)');
    lines.push('-----------------------------------------------------');
    lines.push('  k | entries | accepted | acceptance % ');
    lines.push('----+---------+----------+--------------');
    for (const row of result.rows) {
        lines.push(
            `  ${row.k} | ${String(row.n).padStart(7)} | ${String(row.accepted).padStart(8)} | ${row.ratePercent.toFixed(1).padStart(10)} %`
        );
    }
    lines.push('----+---------+----------+--------------');
    lines.push(
        `tot | ${String(result.total.n).padStart(7)} | ${String(result.total.accepted).padStart(8)} | ${result.total.ratePercent.toFixed(1).padStart(10)} %`
    );
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const raw = fs.readFileSync(options.input, 'utf8');
    const snapshot = JSON.parse(raw);
    const result = computeAcceptanceByTripleCount(snapshot);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${renderTable(result)}\n`);
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
    }
}

module.exports = {
    computeAcceptanceByTripleCount,
    isEntryAccepted,
    renderTable
};
