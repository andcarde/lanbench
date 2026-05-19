'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');
const { Readable, Writable } = require('node:stream');

const {
    generateRegisterCodes,
    runFromStdin,
    ALPHABET,
    CODE_LENGTH
} = require('../../../scripts/generate-register-codes');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * Construye un repositorio falso que captura las llamadas a insertCodes.
 * @returns {*} Stub con array `calls` y metodo `insertCodes`.
 */
function makeRepo() {
    /** @type {string[][]} */
    const calls = [];
    return {
        calls,
        async insertCodes(/** @type {*} */ codes) {
            calls.push(codes.slice());
            return codes.slice();
        }
    };
}

/**
 * Construye un repositorio falso cuyo insertCodes siempre lanza el error dado.
 * @param {Error} error - Error a lanzar.
 * @returns {*} Stub con insertCodes rechazado.
 */
function makeFailingRepo(error) {
    return {
        async insertCodes() {
            throw error;
        }
    };
}

/**
 * Construye un Writable en memoria que captura chunks como string.
 * @returns {*} Objeto con `stream`, `chunks` y `text()`.
 */
function captureStream() {
    /** @type {string[]} */
    const chunks = [];
    const stream = new Writable({
        write(chunk, _encoding, cb) {
            chunks.push(chunk.toString());
            cb();
        }
    });
    return { stream, chunks, text: () => chunks.join('') };
}

/**
 * Construye un Readable que emite el texto dado y luego termina.
 * @param {string} text - Texto a entregar como stdin.
 * @returns {Readable} Stream listo para readline.
 */
function readableFromText(text) {
    const stream = new Readable({ read() {} });
    stream.push(text);
    stream.push(null);
    return stream;
}

describe('generate-register-codes', () => {
    describe('generateRegisterCodes', () => {
        it('genera N codigos con longitud 16 y charset [A-Za-z0-9]', async () => {
            const repo = makeRepo();

            const codes = await generateRegisterCodes({
                count: 25,
                deps: { registerCodesRepository: repo }
            });

            assert.equal(codes.length, 25);
            const pattern = /^[A-Za-z0-9]{16}$/;
            for (const code of codes) {
                assert.equal(code.length, CODE_LENGTH);
                assert.ok(pattern.test(code), `code does not match charset: ${code}`);
            }
        });

        it('todos los codigos dentro del batch son unicos', async () => {
            const repo = makeRepo();

            const codes = await generateRegisterCodes({
                count: 100,
                deps: { registerCodesRepository: repo }
            });

            assert.equal(new Set(codes).size, codes.length);
        });

        it('llama insertCodes exactamente una vez con el mismo array devuelto', async () => {
            const repo = makeRepo();

            const codes = await generateRegisterCodes({
                count: 10,
                deps: { registerCodesRepository: repo }
            });

            assert.equal(repo.calls.length, 1);
            assert.deepEqual(repo.calls[0], codes);
        });

        it('respeta la fuente de aleatoriedad inyectada (determinismo)', async () => {
            const repo = makeRepo();
            let i = 0;
            const random = (/** @type {*} */ max) => i++ % max;

            const codes = await generateRegisterCodes({
                count: 2,
                deps: { registerCodesRepository: repo, random }
            });

            assert.equal(codes[0], ALPHABET.substring(0, 16));
            assert.equal(codes[1], ALPHABET.substring(16, 32));
        });

        it('rechaza count invalido sin llamar al repositorio', async () => {
            const repo = makeRepo();
            const deps = { registerCodesRepository: repo };

            const invalidCounts = [0, -1, -10, 1.5, NaN, '5', null, undefined];
            for (const bad of invalidCounts) {
                await assert.rejects(
                    () => generateRegisterCodes({ count: /** @type {*} */ (bad), deps }),
                    /positive integer/,
                    `should reject count=${String(bad)}`
                );
            }
            assert.equal(repo.calls.length, 0);
        });

        it('propaga errores del repositorio (no hay salida parcial)', async () => {
            const dbError = new Error('boom');
            const repo = makeFailingRepo(dbError);

            await assert.rejects(
                () => generateRegisterCodes({
                    count: 3,
                    deps: { registerCodesRepository: repo }
                }),
                /boom/
            );
        });
    });

    describe('runFromStdin', () => {
        it('imprime cada codigo en una linea propia en stdout', async () => {
            const repo = makeRepo();
            const stdin = readableFromText('4\n');
            const out = captureStream();
            const err = captureStream();

            const codes = await runFromStdin({
                stdin,
                stdout: out.stream,
                stderr: err.stream,
                deps: { registerCodesRepository: repo }
            });

            assert.equal(codes.length, 4);
            const lines = out.text().split('\n').filter((/** @type {*} */ line) => line.length > 0);
            assert.deepEqual(lines, codes);
            assert.equal(repo.calls.length, 1);
        });

        it('rechaza count no entero sin escribir en stdout', async () => {
            const repo = makeRepo();
            const stdin = readableFromText('abc\n');
            const out = captureStream();
            const err = captureStream();

            await assert.rejects(
                () => runFromStdin({
                    stdin,
                    stdout: out.stream,
                    stderr: err.stream,
                    deps: { registerCodesRepository: repo }
                }),
                /positive integer/
            );
            assert.equal(out.text(), '');
            assert.equal(repo.calls.length, 0);
        });
    });
});
