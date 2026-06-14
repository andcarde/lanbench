'use strict';

/**
 * Unit coverage for dataset naming (creation name + rename):
 *   - the service resolves/validates the name, enforces per-owner uniqueness on
 *     creation, and renames with the same invariant;
 *   - the controller delegates the rename and validates the id;
 *   - the pure frontend helpers (`deriveDatasetNameFromFile`,
 *     `normaliseDatasetName`) that default and trim the name client-side.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createDatasetsService } = require('../../../services/datasets-service');
const { createDatasetsController } = require('../../../controllers/datasets-controller');
const { deriveDatasetNameFromFile } = require('../../../public/js/datasets');
const { normaliseDatasetName } = require('../../../public/js/dataset-admin');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/** Minimal `readDataset`/`parseDatasetImport` stubs for create-flow tests. */
function importStubs() {
    return {
        readDataset() {
            return { entries: [{ eid: 1 }] };
        },
        readFileAsBuffer() {
            return Buffer.from('<benchmark />');
        },
        parseDatasetImport() {
            return { entries: [] };
        }
    };
}

/**
 * Builds a `createOwnedDataset` stub that captures the persisted `datasetData`.
 * @param {{ value:any }} capture - Holder updated with the persisted data.
 * @returns {(payload:any)=>Promise<any>} Stub.
 */
function captureCreate(capture) {
    return async function createOwnedDataset(/** @type {any} */ payload) {
        capture.value = payload.datasetData;
        return {
            id: 5,
            name: payload.datasetData.name,
            totalEntries: payload.datasetData.totalEntries,
            languages: payload.datasetData.languages,
            sectionsCompleted: 0,
            sectionsInReview: 0,
            sectionsPending: payload.datasetData.sectionsPending,
            llmMode: payload.datasetData.llmMode,
            isReviewEnabled: payload.datasetData.isReviewEnabled,
            hasAdditionalReviews: payload.datasetData.hasAdditionalReviews,
            colorClass: 'dataset-purple'
        };
    };
}

describe('dataset naming — createDataset', () => {
    it('usa el nombre proporcionado por el usuario (recortado)', async () => {
        /** @type {{ value: any }} */
        const capture = { value: null };
        const service = createDatasetsService(/** @type {any} */ ({
            ...importStubs(),
            datasetsRepository: {
                async findOwnedDatasetWithSameName() { return null; },
                createOwnedDataset: captureCreate(capture)
            }
        }));

        const payload = await service.createDataset(
            7,
            { filename: 'tmp.xml', originalname: 'Fichero original.xml' },
            { name: '  Mi nombre  ' }
        );

        assert.equal(capture.value.name, 'Mi nombre');
        assert.equal(payload.dataset.name, 'Mi nombre');
    });

    it('cae al nombre del fichero cuando no se proporciona nombre', async () => {
        /** @type {{ value: any }} */
        const capture = { value: null };
        const service = createDatasetsService(/** @type {any} */ ({
            ...importStubs(),
            datasetsRepository: {
                async findOwnedDatasetWithSameName() { return null; },
                createOwnedDataset: captureCreate(capture)
            }
        }));

        await service.createDataset(7, { filename: 'tmp.xml', originalname: 'Fichero original.xml' }, {});

        assert.equal(capture.value.name, 'Fichero original');
    });

    it('rechaza con 409 cuando el usuario ya posee un dataset con ese nombre', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            ...importStubs(),
            datasetsRepository: {
                async findOwnedDatasetWithSameName(/** @type {any} */ input) {
                    assert.equal(input.userId, 7);
                    assert.equal(input.name, 'Repetido');
                    return { id: 99, name: 'Repetido' };
                },
                async createOwnedDataset() {
                    throw new Error('No debería crearse un dataset duplicado.');
                }
            }
        }));

        await assert.rejects(
            service.createDataset(7, { filename: 'tmp.xml', originalname: 'x.xml' }, { name: 'Repetido' }),
            (/** @type {any} */ err) => err?.status === 409 && err?.code === 'duplicate_dataset_name'
        );
    });

    it('rechaza con 400 cuando el nombre supera el máximo de caracteres', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            ...importStubs(),
            datasetsRepository: {
                async findOwnedDatasetWithSameName() { return null; },
                async createOwnedDataset() {
                    throw new Error('No debería crearse con un nombre inválido.');
                }
            }
        }));

        await assert.rejects(
            service.createDataset(7, { filename: 'tmp.xml', originalname: 'x.xml' }, { name: 'a'.repeat(129) }),
            (/** @type {any} */ err) => err?.status === 400 && err?.code === 'dataset_name_too_long'
        );
    });
});

describe('dataset naming — renameDataset (service)', () => {
    it('exige admin, comprueba duplicados del propietario y renombra', async () => {
        /** @type {any} */
        const calls = {};
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findDatasetOwnerUserId(/** @type {any} */ input) {
                    calls.owner = input.datasetId;
                    return 7;
                },
                async findOwnedDatasetWithSameName(/** @type {any} */ input) {
                    calls.dup = input;
                    return null;
                },
                async renameDataset(/** @type {any} */ input) {
                    calls.rename = input;
                    return { id: input.datasetId, name: input.name };
                }
            },
            datasetsPermissionsRepository: {
                async findPermitForUser(/** @type {any} */ payload) {
                    assert.deepEqual(payload, { datasetId: 12, userId: 3 });
                    return { isAdmin: true, isOwned: false, dataset: { id: 12, name: 'Viejo' } };
                }
            },
            usersRepository: {}
        }));

        const result = await service.renameDataset(3, 12, '  Nuevo  ');

        assert.equal(calls.owner, 12);
        assert.deepEqual(calls.dup, { userId: 7, name: 'Nuevo', excludeDatasetId: 12 });
        assert.deepEqual(calls.rename, { datasetId: 12, name: 'Nuevo' });
        assert.deepEqual(result, {
            ok: true,
            datasetId: 12,
            dataset: { datasetId: 12, name: 'Nuevo' }
        });
    });

    it('rechaza con 409 cuando el propietario ya tiene otro dataset con ese nombre', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async findDatasetOwnerUserId() { return 7; },
                async findOwnedDatasetWithSameName() { return { id: 50, name: 'Repetido' }; },
                async renameDataset() {
                    throw new Error('No debería renombrar a un nombre duplicado.');
                }
            },
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return { isAdmin: true, isOwned: false, dataset: { id: 12, name: 'Viejo' } };
                }
            },
            usersRepository: {}
        }));

        await assert.rejects(
            service.renameDataset(3, 12, 'Repetido'),
            (/** @type {any} */ err) => err?.status === 409 && err?.code === 'duplicate_dataset_name'
        );
    });

    it('propaga 403 cuando el actor no es administrador del dataset', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async renameDataset() {
                    throw new Error('No debería renombrar sin permisos.');
                }
            },
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return { isAdmin: false, isOwned: false, dataset: { id: 12, name: 'Viejo' } };
                }
            },
            usersRepository: {}
        }));

        await assert.rejects(
            service.renameDataset(3, 12, 'Nuevo'),
            (/** @type {any} */ err) => err?.status === 403 && err?.code === 'dataset_admin_required'
        );
    });

    it('rechaza con 400 cuando el nombre nuevo está vacío', async () => {
        const service = createDatasetsService(/** @type {any} */ ({
            datasetsRepository: {
                async renameDataset() {
                    throw new Error('No debería renombrar con un nombre vacío.');
                }
            },
            datasetsPermissionsRepository: {
                async findPermitForUser() {
                    return { isAdmin: true, isOwned: true, dataset: { id: 12, name: 'Viejo' } };
                }
            },
            usersRepository: {}
        }));

        await assert.rejects(
            service.renameDataset(3, 12, '   '),
            (/** @type {any} */ err) => err?.status === 400 && err?.code === 'invalid_dataset_name'
        );
    });
});

describe('dataset naming — renameDataset (controller)', () => {
    it('delega en datasetsService y responde 200', async () => {
        const controller = createDatasetsController(/** @type {any} */ ({
            datasetsService: {
                async renameDataset(/** @type {any} */ actorId, /** @type {any} */ datasetId, /** @type {any} */ name) {
                    assert.equal(actorId, 7);
                    assert.equal(datasetId, 8);
                    assert.equal(name, 'Nuevo');
                    return { ok: true, datasetId: 8, dataset: { datasetId: 8, name: 'Nuevo' } };
                }
            }
        }));

        const { response, recorder } = createResponseRecorder();
        await controller.renameDataset({
            params: { id: '8' },
            body: { name: 'Nuevo' },
            session: { user: { id: 7, email: 'u@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 200);
        assert.deepEqual(recorder.payload, { ok: true, datasetId: 8, dataset: { datasetId: 8, name: 'Nuevo' } });
    });

    it('devuelve 400 cuando el id no es un entero positivo', async () => {
        const controller = createDatasetsController(/** @type {any} */ ({
            datasetsService: {
                async renameDataset() {
                    throw new Error('renameDataset should not be called');
                }
            }
        }));

        const { response, recorder } = createResponseRecorder();
        await controller.renameDataset({
            params: { id: 'x' },
            body: { name: 'Nuevo' },
            session: { user: { id: 7, email: 'u@example.com' } }
        }, response);

        assert.equal(recorder.statusCode, 400);
        assert.equal(recorder.payload?.code, 'invalid_payload');
    });

    it('devuelve 401 sin sesión válida', async () => {
        const controller = createDatasetsController(/** @type {any} */ ({
            datasetsService: {
                async renameDataset() {
                    throw new Error('renameDataset should not be called');
                }
            }
        }));

        const { response, recorder } = createResponseRecorder();
        await controller.renameDataset({ params: { id: '8' }, body: { name: 'Nuevo' } }, response);

        assert.equal(recorder.statusCode, 401);
        assert.equal(recorder.payload?.code, 'unauthenticated');
    });
});

describe('dataset naming — frontend pure helpers', () => {
    it('deriveDatasetNameFromFile quita la extensión .xml y recorta', () => {
        assert.equal(deriveDatasetNameFromFile('ru_dev.xml'), 'ru_dev');
        assert.equal(deriveDatasetNameFromFile('  Mi Dataset.XML  '), 'Mi Dataset');
        assert.equal(deriveDatasetNameFromFile('sin-extension'), 'sin-extension');
        assert.equal(deriveDatasetNameFromFile(''), '');
        assert.equal(deriveDatasetNameFromFile(null), '');
    });

    it('normaliseDatasetName recorta cadenas y degrada valores no string a ""', () => {
        assert.equal(normaliseDatasetName('  Nuevo nombre  '), 'Nuevo nombre');
        assert.equal(normaliseDatasetName(''), '');
        assert.equal(normaliseDatasetName(null), '');
        assert.equal(normaliseDatasetName(undefined), '');
        assert.equal(normaliseDatasetName(42), '');
    });
});

/**
 * Creates a minimal Express response double capturing status, payload and code.
 * @returns {*} `{ response, recorder }`.
 */
function createResponseRecorder() {
    /** @type {any} */
    const recorder = { statusCode: null, payload: null, contentType: null, headers: {} };

    /** @type {any} */
    const response = {
        locals: {},
        status(/** @type {any} */ code) { recorder.statusCode = code; return this; },
        type(/** @type {any} */ value) { recorder.contentType = value; return this; },
        set(/** @type {any} */ name, /** @type {any} */ value) { recorder.headers[name] = value; return this; },
        send(/** @type {any} */ payload) { recorder.payload = payload; return this; },
        json(/** @type {any} */ payload) { recorder.payload = payload; return this; }
    };

    return { response, recorder };
}
