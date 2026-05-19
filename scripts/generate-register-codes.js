'use strict';

/**
 * @file `node scripts/generate-register-codes.js` — genera codigos de
 * registro de moderador unicos y los persiste en `register_codes`.
 *
 * Lee `N` de stdin, escribe el prompt en stderr (para no contaminar
 * stdout, que se reserva a los codigos generados, uno por linea).
 */

const crypto = require('node:crypto');
const readline = require('node:readline');

const { createRegisterCodesRepository } = require('../repositories/register-codes-repository');

/** Alfabeto admitido en los codigos. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Longitud de cada codigo. */
const CODE_LENGTH = 16;

/**
 * Construye un codigo aleatorio de longitud fija usando la fuente recibida.
 *
 * @param {(max: number) => number} random - Aleatorio uniforme en `[0, max)`.
 * @returns {string} Codigo de longitud {@link CODE_LENGTH}.
 */
function generateOneCode(random) {
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++)
        out += ALPHABET[random(ALPHABET.length)];

    return out;
}

/**
 * Genera `count` codigos unicos de 16 caracteres y los persiste en
 * `register_codes`. Si la insercion falla, no se imprime ningun codigo
 * (el llamador propaga el error).
 *
 * @param {{
 *   count?: number,
 *   deps?: { registerCodesRepository?: Record<string, any>, random?: (max:number)=>number }
 * }} [options]
 * @returns {Promise<string[]>}
 * @throws {Error} Si `count` no es entero positivo.
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
 * Lee una linea de `stdin` escribiendo el prompt en `stderr` (asi `stdout`
 * queda reservado a los codigos generados).
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
 * Punto de entrada CLI. Orquesta `stdin`/`stdout`/`stderr` y la generacion.
 * Imprime cada codigo en una linea de `stdout` solo si la persistencia ha
 * tenido exito.
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
