'use strict';

const assert = require('node:assert/strict');
const testApi = require('node:test');

const { createContinueDatasetService } = require('../../../services/continue-dataset-service');

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);

/**
 * @param {*} [overrides]
 */
function buildService(overrides = {}) {
    /** @type {{ upserts: any[]; deletes: any[]; }} */
    const activeSessionCalls = {
        upserts: [],
        deletes: []
    };
    /** @type {{ creates: any[]; expired: boolean; }} */
    const assignmentCalls = {
        creates: [],
        expired: false
    };

    const activeSessionsRepository = {
        async findSession() { return null; },
        async upsertSession(/** @type {*} */ payload) {
            activeSessionCalls.upserts.push(payload);
            return payload;
        },
        async deleteSession(/** @type {*} */ payload) {
            activeSessionCalls.deletes.push(payload);
            return payload;
        },
        ...overrides.activeSessionsRepository
    };

    const sectionAssignmentsRepository = {
        async expireStaleAssignments() { assignmentCalls.expired = true; },
        async findActiveAssignment() { return null; },
        async findMaxSectionIndex() { return 0; },
        async createAssignment(/** @type {*} */ payload) {
            assignmentCalls.creates.push(payload);
            return { id: 1, ...payload };
        },
        ...overrides.sectionAssignmentsRepository
    };

    const datasetsRepository = {
        async findAccessibleById() {
            return {
                id: 5,
                totalEntries: 25,
                sectionsPending: 3,
                sectionsInReview: 0
            };
        },
        async findEntryByPosition(/** @type {*} */ { position }) {
            return { eid: position + 100, position };
        },
        ...overrides.datasetsRepository
    };

    return {
        service: createContinueDatasetService({
            activeSessionsRepository,
            sectionAssignmentsRepository,
            datasetsRepository,
            assignmentDurationMs: 1000
        }),
        activeSessionCalls,
        assignmentCalls
    };
}

describe('continue-dataset-service', () => {
    it('caso 4 reanuda una sesion activa existente', async () => {
        const { service } = buildService({
            activeSessionsRepository: {
                async findSession() {
                    return { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 2, entryNumber: 11 };
                }
            }
        });

        const result = await service.continueDataset(7, 5);

        assert.equal(result.caseNumber, 4);
        assert.equal(result.sectionNumber, 2);
        assert.equal(result.entryPosition, 11);
        assert.equal(result.entryId, 111);
        assert.equal(result.entryIndexInSection, 1);
    });

    it('caso 4 crea sesion si ya existe una seccion activa asignada al usuario', async () => {
        const { service, activeSessionCalls } = buildService({
            sectionAssignmentsRepository: {
                async findActiveAssignment() {
                    return { id: 9, sectionIndex: 3 };
                }
            }
        });

        const result = await service.continueDataset(7, 5);

        assert.equal(result.caseNumber, 4);
        assert.equal(result.sectionNumber, 3);
        assert.equal(result.entryPosition, 20);
        assert.equal(activeSessionCalls.upserts.length, 1);
        assert.equal(activeSessionCalls.upserts[0].entryNumber, 20);
    });

    it('caso 5 asigna la siguiente seccion secuencial usando max sectionIndex + 1', async () => {
        const { service, activeSessionCalls, assignmentCalls } = buildService({
            sectionAssignmentsRepository: {
                async findMaxSectionIndex() { return 1; }
            }
        });

        const result = await service.continueDataset(7, 5);

        assert.equal(result.caseNumber, 5);
        assert.equal(result.sectionNumber, 2);
        assert.equal(result.entryPosition, 10);
        assert.equal(assignmentCalls.creates.length, 1);
        assert.equal(assignmentCalls.creates[0].sectionIndex, 2);
        assert.equal(activeSessionCalls.upserts[0].sectionNumber, 2);
    });

    it('caso 3 avisa si no quedan secciones sin asignar', async () => {
        const { service, assignmentCalls } = buildService({
            sectionAssignmentsRepository: {
                async findMaxSectionIndex() { return 3; }
            }
        });

        const result = await service.continueDataset(7, 5);

        assert.equal(result.caseNumber, 3);
        assert.equal(assignmentCalls.creates.length, 0);
    });

    it('advanceSession avanza la entry dentro de la seccion', async () => {
        const { service, activeSessionCalls } = buildService({
            activeSessionsRepository: {
                async findSession() {
                    return { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 1, entryNumber: 2 };
                }
            }
        });

        const result = await service.advanceSession(7, 5);

        assert.equal(result.sectionDone, false);
        assert.equal(result.entryPosition, 3);
        assert.equal(result.entryId, 103);
        assert.equal(activeSessionCalls.upserts[0].entryNumber, 3);
    });

    it('advanceSession borra la sesion al terminar la seccion e indica si se puede seguir', async () => {
        const { service, activeSessionCalls } = buildService({
            activeSessionsRepository: {
                async findSession() {
                    return { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 1, entryNumber: 9 };
                }
            },
            sectionAssignmentsRepository: {
                async findMaxSectionIndex() { return 1; }
            }
        });

        const result = await service.advanceSession(7, 5);

        assert.equal(result.sectionDone, true);
        assert.equal(result.moreSectionsAvailable, true);
        assert.equal(activeSessionCalls.deletes.length, 1);
    });
});

describe('continue-dataset-service.getNextEntry', () => {
    const sectionPayload = {
        datasetId: 5,
        datasetName: 'demo',
        totalSections: 3,
        sectionIndex: 2,
        sectionSize: 10,
        totalEntries: 10,
        entries: [
            { entryId: 11, sectionIndex: 2, category: 'Airport', triples: [], englishSentences: [] },
            { entryId: 12, sectionIndex: 2, category: 'Astronaut', triples: [], englishSentences: [] }
        ]
    };

    function buildNextService(/** @type {*} */ { session, datasetsService } = {}) {
        const activeSessionsRepository = {
            async findSession() { return session === undefined ? null : session; },
            async upsertSession() {},
            async deleteSession() {}
        };
        return createContinueDatasetService({
            activeSessionsRepository,
            sectionAssignmentsRepository: {
                async expireStaleAssignments() {},
                async findActiveAssignment() { return null; },
                async findMaxSectionIndex() { return 0; },
                async createAssignment(/** @type {*} */ payload) { return { id: 1, ...payload }; }
            },
            datasetsRepository: {
                async findAccessibleById() { return { id: 5, totalEntries: 30, sectionsPending: 1, sectionsInReview: 0 }; }
            },
            datasetsService,
            assignmentDurationMs: 1000
        });
    }

    it('devuelve la entry apuntada por la sesion activa con su contexto de seccion', async () => {
        const datasetsService = {
            async getAccessibleDatasetSection(/** @type {*} */ userId, /** @type {*} */ datasetId, /** @type {*} */ sectionNumber) {
                assert.equal(userId, 7);
                assert.equal(datasetId, 5);
                assert.equal(sectionNumber, 2);
                return sectionPayload;
            }
        };

        const service = buildNextService({
            session: { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 2, entryNumber: 11 },
            datasetsService
        });

        const result = await service.getNextEntry(7, 5);

        assert.equal(result.datasetId, 5);
        assert.equal(result.sectionNumber, 2);
        assert.equal(result.entryIndexInSection, 1);
        assert.equal(result.totalEntriesInSection, 2);
        assert.equal(result.isLastEntryInSection, true);
        assert.equal(result.entry.entryId, 12);
        assert.equal(result.entry.category, 'Astronaut');
    });

    it('marca isLastEntryInSection=false cuando la entry no es la ultima', async () => {
        const datasetsService = {
            async getAccessibleDatasetSection() { return sectionPayload; }
        };
        const service = buildNextService({
            session: { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 2, entryNumber: 10 },
            datasetsService
        });

        const result = await service.getNextEntry(7, 5);

        assert.equal(result.entryIndexInSection, 0);
        assert.equal(result.isLastEntryInSection, false);
        assert.equal(result.entry.entryId, 11);
    });

    it('lanza 409 no_active_session si no hay sesion activa', async () => {
        const service = buildNextService({
            session: null,
            datasetsService: {
                async getAccessibleDatasetSection() { throw new Error('should not be called'); }
            }
        });

        await assert.rejects(
            () => service.getNextEntry(7, 5),
            (/** @type {any} */ error) => error.code === 'no_active_session' && error.status === 409
        );
    });

    it('lanza 404 entry_not_found si la posicion no existe en la seccion', async () => {
        const datasetsService = {
            async getAccessibleDatasetSection() { return { ...sectionPayload, entries: [] }; }
        };
        const service = buildNextService({
            session: { datasetId: 5, userId: 7, mode: 'annotation', sectionNumber: 2, entryNumber: 11 },
            datasetsService
        });

        await assert.rejects(
            () => service.getNextEntry(7, 5),
            (/** @type {any} */ error) => error.code === 'entry_not_found' && error.status === 404
        );
    });
});
