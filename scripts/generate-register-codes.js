'use strict';

/**
 * @file `node scripts/generate-register-codes.js` — generates unique
 * moderator register codes and persists them in `register_codes`.
 *
 * Reads `N` from stdin, writes the prompt to stderr (to avoid polluting
 * stdout, which is reserved for the generated codes, one per line).
 */

const crypto = require('node:crypto');
const readline = require('node:readline');

const { createRegisterCodesRepository } = require('../repositories/register-codes-repository');

/** Alphabet allowed in the codes. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Length of each code. */
const CODE_LENGTH = 16;

/**
 * Builds a random fixed-length code using the received source.
 *
 * @param {(max: number) => number} random - Uniform random in `[0, max)`.
 * @returns {string} Code of length {@link CODE_LENGTH}.
 */
function generateOneCode(random) {
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++)
        out += ALPHABET[random(ALPHABET.length)];

    return out;
}

/**
 * Generates `count` unique 16-character codes and persists them in
 * `register_codes`. If the insertion fails, no code is printed (the caller
 * propagates the error).
 *
 * @param {{
 *   count?: number,
 *   deps?: { registerCodesRepository?: Record<string, any>, random?: (max:number)=>number }
 * }} [options]
 * @returns {Promise<string[]>}
 * @throws {Error} If `count` is not a positive integer.
 */
async function generateRegisterCodes({ count, deps } = {}) {
    if (!Number.isInteger(count) || count === undefined || count <= 0)
        throw new Error('generate-register-codes: count must be a positive integer.');

    const resolved = {
        registerCodesRepository: (deps && deps.registerCodesRepository) || createRegisterCodesRepository(),
        random: (deps && deps.random) || ((/** @type {number} */ max) => crypto.randomInt(max))
    };

    const seen = new Set();
    /** @type {string[]} */
    const codes = [];
    while (codes.length < count) {
        const candidate = generateOneCode(resolved.random);
        if (!seen.has(candidate)) {
            seen.add(candidate);
            codes.push(candidate);
        }
    }

    await resolved.registerCodesRepository.insertCodes(codes);
    return codes;
}

/**
 * Reads a line from `stdin`, writing the prompt to `stderr` (so `stdout`
 * stays reserved for the generated codes).
 *
 * @param {{ stdin: NodeJS.ReadableStream, stderr: NodeJS.WritableStream }} streams
 * @returns {Promise<string>}
 */
function readCountFromStdin({ stdin, stderr }) {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({ input: stdin });
        let answered = false;

        if (stderr && typeof stderr.write === 'function')
            stderr.write('How many codes to generate? ');

        rl.once('line', line => {
            answered = true;
            rl.close();
            resolve(line);
        });
        rl.once('close', () => {
            if (!answered)
                resolve('');
        });
        rl.on('error', reject);
    });
}

/**
 * CLI entry point. Orchestrates `stdin`/`stdout`/`stderr` and the generation.
 * Prints each code on a line of `stdout` only if persistence succeeded.
 *
 * @param {{
 *   stdin?: NodeJS.ReadableStream,
 *   stdout?: NodeJS.WritableStream,
 *   stderr?: NodeJS.WritableStream,
 *   deps?: { registerCodesRepository?: Record<string, any>, random?: (max:number)=>number }
 * }} [options]
 * @returns {Promise<string[]>}
 */
async function runFromStdin({ stdin, stdout, stderr, deps } = {}) {
    const inStream = stdin || process.stdin;
    const outStream = stdout || process.stdout;
    const errStream = stderr || process.stderr;

    const raw = await readCountFromStdin({ stdin: inStream, stderr: errStream });
    const parsed = Number.parseInt(String(raw).trim(), 10);

    const codes = await generateRegisterCodes({ count: parsed, deps });
    for (const code of codes)
        outStream.write(`${code}\n`);

    return codes;
}

module.exports = {
    generateRegisterCodes,
    runFromStdin,
    ALPHABET,
    CODE_LENGTH
};

if (require.main === module) {
    runFromStdin({})
        .then(() => process.exit(0))
        .catch(error => {
            const message = error && error.message ? error.message : String(error);
            process.stderr.write(`generate-register-codes failed: ${message}\n`);
            process.exit(1);
        });
}
