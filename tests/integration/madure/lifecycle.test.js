'use strict';

/**
 * "Madure" (maturity) lifecycle suite (P3, T3.3).
 *
 * Drives the full product chain end to end over HTTP against the REAL app and a
 * REAL database — create → download → annotate a full section → review that
 * section — parameterised over **≥2 production-like files** (`ru_dev.xml`,
 * `ru_dev_2.xml`). It proves the behaviour fixed by T4 (declarative section
 * size) and T5 (a fully annotated section becomes reviewable).
 *
 * DB-gated: when MySQL is absent the suite skips cleanly (it never makes the
 * default suite slow or flaky). A small declarative `sectionSize` keeps the run
 * bounded — only the first section is annotated and reviewed, regardless of how
 * many entries the production file carries.
 */

const assert = require('node:assert/strict');
const testApi = require('node:test');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const prisma = require('../../../prisma/client');
const { createApp } = require('../../../app');
const { createPasswordHasher } = require('../../../services/password-hasher');
const { warnIfDatabaseInactive } = require('../../../utils/database-health');
const { TEST_DATA_PATH } = require('../../../constants/paths');
const { normalizeBigInts } = require('../_helpers/bigint');

const app = createApp();

const describe = /** @type {Mocha.SuiteFunction} */ (globalThis.describe || testApi.describe);
const it = /** @type {Mocha.TestFunction} */ (globalThis.it || testApi.it);
const before = /** @type {Mocha.HookFunction} */ (globalThis.before || testApi.before);
const after = /** @type {Mocha.HookFunction} */ (globalThis.after || testApi.after);

/** Production-like corpus files the lifecycle is parameterised over (≥2). */
const PRODUCTION_FILES = ['ru_dev.xml', 'ru_dev_2.xml'];
/** Small declarative section size so only one short section is exercised. */
const SECTION_SIZE = 5;

const passwordHasher = createPasswordHasher();

describe('madure lifecycle (create → download → annotate section → review)', function () {
    if (this && typeof this.timeout === 'function')
        this.timeout(180000);

    /** @type {any} */
    let httpServer = null;
    let baseUrl = '';
    let dbActive = false;
    /** @type {Array<{ id:number, email:string }>} */
    const createdUsers = [];
    /** @type {number[]} */
    const createdDatasetIds = [];

    before(async function () {
        dbActive = await warnIfDatabaseInactive({ logger: console });
        if (!dbActive)
            return this.skip();

        const freePort = await getFreePort();
        baseUrl = `http://127.0.0.1:${freePort}`;
        await new Promise((resolve, reject) => {
            httpServer = app.listen(freePort, error => error ? reject(error) : resolve(undefined));
        });
    });

    after(async () => {
        // Best-effort cleanup of datasets (cascades) and users.
        const ownerCookie = createdUsers[0] ? await loginCookie(createdUsers[0].email) : '';
        for (const datasetId of createdDatasetIds) {
            try {
                if (ownerCookie)
                    await fetch(`${baseUrl}/api/datasets/${datasetId}`, { method: 'DELETE', headers: { cookie: ownerCookie } });
            } catch { /* ignore */ }
        }
        if (httpServer)
            await new Promise(resolve => httpServer.close(() => resolve(undefined)));
        for (const user of createdUsers) {
            await dbQuery('DELETE FROM `active_sessions` WHERE `user_id` = ?', [user.id]).catch(() => {});
            await dbQuery('DELETE FROM `section_assignments` WHERE `user_id` = ?', [user.id]).catch(() => {});
            await dbQuery('DELETE FROM `permits` WHERE `user_id` = ?', [user.id]).catch(() => {});
            await dbQuery('DELETE FROM `users` WHERE `id` = ?', [user.id]).catch(() => {});
        }
    });

    for (const file of PRODUCTION_FILES) {
        it(`lifecycle over ${file}`, async function () {
            if (!dbActive)
                return this.skip();
            this.timeout(180000);

            const xmlPath = path.join(TEST_DATA_PATH, file);
            assert.ok(fs.existsSync(xmlPath), `Falta el fichero de corpus ${xmlPath}`);

            // ── Users: an owner/annotator and a separate reviewer (both moderators). ──
            const annotator = await createModerator('madure_annot');
            const reviewer = await createModerator('madure_rev');
            const annotatorCookie = await loginCookie(annotator.email);
            const reviewerCookie = await loginCookie(reviewer.email);
            assert.ok(annotatorCookie && reviewerCookie, 'ambos usuarios deberían iniciar sesión');

            // ── Create the dataset (review enabled, declarative section size). ──
            const xmlContent = fs.readFileSync(xmlPath);
            const form = new FormData();
            form.append('xmlFile', new Blob([xmlContent], { type: 'application/xml' }), file);
            form.append('llmMode', 'none');
            form.append('isReviewEnabled', 'true');
            form.append('hasAdditionalReviews', 'false');
            form.append('sectionSize', String(SECTION_SIZE));

            const createRes = await fetch(`${baseUrl}/api/datasets`, { method: 'POST', headers: { cookie: annotatorCookie }, body: form });
            const createText = await createRes.text();
            assert.equal(createRes.status, 201, `creación 201. Body: ${createText}`);
            const datasetId = JSON.parse(createText).datasetId;
            assert.ok(Number.isInteger(datasetId) && datasetId > 0);
            createdDatasetIds.push(datasetId);

            await dbQuery(
                'INSERT INTO `permits` (`dataset_id`, `user_id`, `is_owned`, `is_annotator`, `is_reviewer`, `is_admin`) VALUES (?, ?, 0, 0, 1, 0)',
                [datasetId, reviewer.id]
            );

            const [datasetRow] = await dbQuery(
                'SELECT `section_size` AS sectionSize, `is_review_enabled` AS isReviewEnabled, `total_entries` AS totalEntries FROM `datasets` WHERE `id` = ?',
                [datasetId]
            );
            assert.equal(Number(datasetRow.sectionSize), SECTION_SIZE, 'la sección declarativa se persiste');
            assert.equal(Number(datasetRow.isReviewEnabled), 1);
            assert.ok(Number(datasetRow.totalEntries) >= 100, 'fichero production-like');

            // ── Download round-trips to a WebNLG benchmark. ──
            const downloadRes = await fetch(`${baseUrl}/api/datasets/${datasetId}/download`, { headers: { cookie: annotatorCookie } });
            assert.equal(downloadRes.status, 200);
            const downloaded = await downloadRes.text();
            assert.match(downloaded, /<benchmark>/);
            assert.match(downloaded, /<entry /);

            // ── Section 1 has exactly SECTION_SIZE entries. ──
            const section = await (await fetch(`${baseUrl}/api/datasets/${datasetId}/sections/1`, { headers: { cookie: annotatorCookie } })).json();
            assert.equal(section.sectionSize, SECTION_SIZE);
            assert.equal(section.entries.length, SECTION_SIZE);

            // ── Annotate every entry of section 1. ──
            await fetch(`${baseUrl}/api/annotations/${datasetId}/continue`, { method: 'POST', headers: { cookie: annotatorCookie } });
            for (let guard = 0; guard < SECTION_SIZE + 2; guard += 1) {
                const next = await (await fetch(`${baseUrl}/api/annotations/${datasetId}/next`, { headers: { cookie: annotatorCookie } })).json();
                const sendRes = await fetch(`${baseUrl}/api/annotations/send`, {
                    method: 'POST',
                    headers: { cookie: annotatorCookie, 'content-type': 'application/json' },
                    body: JSON.stringify({
                        datasetId,
                        entryId: next.entry.entryId,
                        sentences: [{ sentence: `Frase anotada para la entry ${next.entry.entryId}.`, rejectionReason: null }],
                        sectionNumber: next.sectionNumber
                    })
                });
                assert.equal(sendRes.status, 200, await sendRes.text());
                if (next.isLastEntryInSection)
                    break;
                await fetch(`${baseUrl}/api/annotations/${datasetId}/continue`, { method: 'POST', headers: { cookie: annotatorCookie } });
            }

            // The whole section reached the review-pending counter (T5).
            const [counters] = await dbQuery(
                'SELECT `sections_in_review` AS inReview FROM `datasets` WHERE `id` = ?',
                [datasetId]
            );
            assert.ok(Number(counters.inReview) >= 1, 'la sección completada pasa a "en revisión"');

            // ── The reviewer is served a candidate from the completed section. ──
            const reviewRes = await fetch(`${baseUrl}/api/reviews/request`, {
                method: 'POST',
                headers: { cookie: reviewerCookie, 'content-type': 'application/json' },
                body: JSON.stringify({ datasetId })
            });
            const reviewText = await reviewRes.text();
            assert.equal(reviewRes.status, 200, `el revisor debería recibir un candidato. Body: ${reviewText}`);
            const review = JSON.parse(reviewText);
            assert.ok(review.reviewId > 0, 'se creó una revisión');
            assert.equal(review.annotatorId, annotator.id, 'la revisión apunta al anotador original');
        });
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /**
     * Creates a moderator user directly in the DB and tracks it for cleanup.
     * @param {string} prefix
     * @returns {Promise<{ id:number, email:string }>}
     */
    async function createModerator(prefix) {
        const email = `${prefix}_${Date.now()}_${crypto.randomInt(100000)}@example.com`;
        const id = 2000000 + crypto.randomInt(900000);
        const passwordHash = await passwordHasher.hashPassword('MadurePass99!');
        await dbQuery('DELETE FROM `users` WHERE `email` = ? OR `id` = ?', [email, id]);
        await dbQuery('INSERT INTO `users` (`id`, `email`, `password`, `is_moderator`) VALUES (?, ?, ?, ?)', [id, email, passwordHash, 1]);
        const user = { id, email };
        createdUsers.push(user);
        return user;
    }

    /**
     * Logs a user in and returns its session cookie.
     * @param {string} email
     * @returns {Promise<string>}
     */
    async function loginCookie(email) {
        const res = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password: 'MadurePass99!' })
        });
        if (res.status !== 200)
            return '';
        return extractSessionCookie(res) || '';
    }
});

/**
 * Extracts the `connect.sid` cookie from a response.
 * @param {Response} response
 * @returns {string|null}
 */
function extractSessionCookie(response) {
    if (typeof response.headers.getSetCookie === 'function') {
        const session = response.headers.getSetCookie().find(c => c.startsWith('connect.sid='));
        return session ? session.split(';')[0] : null;
    }
    const setCookie = response.headers.get('set-cookie');
    const match = setCookie ? setCookie.match(/connect\.sid=[^;]+/) : null;
    return match ? match[0] : null;
}

/**
 * Runs a SQL query through Prisma; SELECT returns rows, others a summary.
 * @param {string} sql
 * @param {Array<*>} [params]
 * @returns {Promise<*>}
 */
async function dbQuery(sql, params = []) {
    if (/^\s*SELECT\b/i.test(sql)) {
        const rows = await prisma.$queryRawUnsafe(sql, ...params);
        return normalizeBigInts(rows);
    }
    const affected = await prisma.$executeRawUnsafe(sql, ...params);
    return { affectedRows: Number(affected) };
}

/**
 * Returns a free TCP port.
 * @returns {Promise<number>}
 */
function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error) return reject(error);
                if (!address || typeof address !== 'object')
                    return reject(new Error('No se pudo resolver un puerto libre.'));
                return resolve(address.port);
            });
        });
        server.on('error', reject);
    });
}
