'use strict';

/**
 * Compares the real database structure against the expected definition
 * derived from prisma/schema.prisma.
 *
 * Verifies bidirectionally:
 *  - The expected exists in the DB (missing tables / columns / indexes).
 *  - The DB contains nothing extra (extra tables / columns not declared in Prisma).
 *
 * Usage: npm run test:db
 */

const mariadb = require('mariadb');
const config = require('../../config');

// ── Expected definition (derived from prisma/schema.prisma) ──────────────────

// Tables managed by other components at runtime (not by Prisma).
// They are excluded from the extras check so as not to flag an object that is
// not meant to be in schema.prisma as a discrepancy.
const IGNORED_TABLES = new Set([
    'sessions' // created and maintained by express-mysql-session
]);

const EXPECTED_TABLES = new Set([
    'datasets',
    'users',
    'sections',
    'permits',
    'entries',
    'triplesets',
    'triples',
    'lexes',
    'dbpedia_links',
    'links',
    'annotations',
    'section_assignments',
    'active_sessions',
    'annotation_alert_decisions',
    'evaluation_criteria',
    'reviews',
    'review_decisions',
    'review_comments',
    'register_codes',
    'dataset_llm_credentials'
]);

// Each column: { name, nullable, default? }
//   - nullable: true if it accepts NULL.
//   - default: exact value to verify (string). If omitted, it is not checked.
const EXPECTED_COLUMNS = {
    datasets: [
        { name: 'id',                     nullable: false },
        { name: 'name',                   nullable: false },
        { name: 'total_entries',          nullable: false },
        { name: 'languages',              nullable: true  },
        { name: 'color_class',            nullable: false, default: 'dataset-purple' },
        { name: 'llm_mode',               nullable: false, default: 'none' },
        { name: 'is_review_enabled',      nullable: false, default: '0' },
        { name: 'has_additional_reviews', nullable: false, default: '0' },
        { name: 'sections_completed',     nullable: false, default: '0' },
        { name: 'sections_in_review',     nullable: false, default: '0' },
        { name: 'sections_pending',       nullable: false, default: '0' },
        { name: 'created_at',             nullable: false },
        { name: 'updated_at',             nullable: false }
    ],
    users: [
        { name: 'id',       nullable: false },
        { name: 'email',    nullable: false },
        { name: 'password', nullable: false },
        { name: 'is_moderator', nullable: false, default: '0' }
    ],
    sections: [
        { name: 'id',         nullable: false },
        { name: 'dataset_id', nullable: false },
        { name: 'block',      nullable: false }
    ],
    permits: [
        { name: 'dataset_id',   nullable: false },
        { name: 'user_id',      nullable: false },
        { name: 'is_owned',     nullable: false, default: '0' },
        { name: 'is_annotator', nullable: false, default: '1' },
        { name: 'is_reviewer',  nullable: false, default: '0' },
        { name: 'is_admin',     nullable: false, default: '0' }
    ],
    entries: [
        { name: 'id',         nullable: false },
        { name: 'dataset_id', nullable: false },
        { name: 'eid',        nullable: false },
        { name: 'category',   nullable: false },
        { name: 'shape',      nullable: true  },
        { name: 'shape_type', nullable: true  },
        { name: 'size',       nullable: false },
        { name: 'position',   nullable: false, default: '0' },
        { name: 'status',     nullable: false, default: 'pending' }
    ],
    triplesets: [
        { name: 'id',       nullable: false },
        { name: 'entry_id', nullable: false },
        { name: 'type',     nullable: false },
        { name: 'position', nullable: false, default: '0' }
    ],
    triples: [
        { name: 'id',           nullable: false },
        { name: 'tripleset_id', nullable: false },
        { name: 'position',     nullable: false, default: '0' },
        { name: 'subject',      nullable: false },
        { name: 'predicate',    nullable: false },
        { name: 'object',       nullable: false }
    ],
    lexes: [
        { name: 'id',       nullable: false },
        { name: 'entry_id', nullable: false },
        { name: 'lid',      nullable: false },
        { name: 'lang',     nullable: false },
        { name: 'comment',  nullable: true  },
        { name: 'text',     nullable: false },
        { name: 'position', nullable: false, default: '0' }
    ],
    dbpedia_links: [
        { name: 'id',        nullable: false },
        { name: 'entry_id',  nullable: false },
        { name: 'direction', nullable: false },
        { name: 'subject',   nullable: false },
        { name: 'predicate', nullable: false },
        { name: 'object',    nullable: false },
        { name: 'position',  nullable: false, default: '0' }
    ],
    links: [
        { name: 'id',        nullable: false },
        { name: 'entry_id',  nullable: false },
        { name: 'direction', nullable: false },
        { name: 'subject',   nullable: false },
        { name: 'predicate', nullable: false },
        { name: 'object',    nullable: false },
        { name: 'position',  nullable: false, default: '0' }
    ],
    annotations: [
        { name: 'entry_id',              nullable: false },
        { name: 'dataset_id',            nullable: false },
        { name: 'user_id',               nullable: false },
        { name: 'sentence_index',        nullable: false, default: '0' },
        { name: 'sentence',              nullable: false },
        { name: 'rejection_reason',      nullable: true  },
        { name: 'origin',                nullable: false, default: 'manual' },
        { name: 'is_accepted_first_try', nullable: false, default: '1' },
        { name: 'created_at',            nullable: false },
        { name: 'updated_at',            nullable: false }
    ],
    section_assignments: [
        { name: 'id',                  nullable: false },
        { name: 'user_id',             nullable: false },
        { name: 'dataset_id',          nullable: false },
        { name: 'section_index',       nullable: false },
        { name: 'assigned_at',         nullable: false },
        { name: 'expires_at',          nullable: false },
        { name: 'status',              nullable: false, default: 'active' },
        { name: 'time_spent_seconds',  nullable: false, default: '0' }
    ],
    active_sessions: [
        { name: 'dataset_id',     nullable: false },
        { name: 'user_id',        nullable: false },
        { name: 'mode',           nullable: false },
        { name: 'section_number', nullable: false },
        { name: 'entry_number',   nullable: false }
    ],
    annotation_alert_decisions: [
        { name: 'id',                nullable: false },
        { name: 'entry_id',          nullable: false },
        { name: 'user_id',           nullable: false },
        { name: 'sentence_index',    nullable: false },
        { name: 'alert_code',        nullable: false },
        { name: 'alert_type',        nullable: false },
        { name: 'decision',          nullable: false },
        { name: 'reason',            nullable: true  },
        { name: 'suggestion',        nullable: true  },
        { name: 'applied_sentence',  nullable: true  },
        { name: 'created_at',        nullable: false }
    ],
    evaluation_criteria: [
        { name: 'id',          nullable: false },
        { name: 'key',         nullable: false },
        { name: 'label',       nullable: false },
        { name: 'description', nullable: true  },
        { name: 'sort_order',  nullable: false, default: '0' },
        { name: 'is_active',   nullable: false, default: '1' },
        { name: 'version',     nullable: false, default: '1' },
        { name: 'created_at',  nullable: false },
        { name: 'updated_at',  nullable: false }
    ],
    reviews: [
        { name: 'id',                        nullable: false },
        { name: 'entry_id',                  nullable: false },
        { name: 'reviewer_id',               nullable: false },
        { name: 'annotator_id',              nullable: false },
        { name: 'status',                    nullable: false, default: 'pending' },
        { name: 'current_criterion_index',   nullable: false, default: '0' },
        { name: 'round_index',               nullable: false, default: '0' },
        { name: 'clean_round',               nullable: false, default: '0' },
        { name: 'assigned_at',               nullable: false },
        { name: 'expires_at',                nullable: false },
        { name: 'time_spent_seconds',        nullable: false, default: '0' },
        { name: 'completed_at',              nullable: true  }
    ],
    review_decisions: [
        { name: 'id',             nullable: false },
        { name: 'review_id',      nullable: false },
        { name: 'criterion_code', nullable: false },
        { name: 'decision',       nullable: false },
        { name: 'comment',        nullable: true  },
        { name: 'decided_at',     nullable: false }
    ],
    review_comments: [
        { name: 'id',                     nullable: false },
        { name: 'review_id',              nullable: false },
        { name: 'sentence_index',         nullable: false },
        { name: 'original_sentence',      nullable: true  },
        { name: 'corrected_sentence',     nullable: false },
        { name: 'comment',                nullable: false },
        { name: 'is_accepted_first_try',  nullable: false, default: '1' },
        { name: 'created_at',             nullable: false }
    ],
    register_codes: [
        { name: 'code',       nullable: false },
        { name: 'created_at', nullable: false }
    ],
    dataset_llm_credentials: [
        { name: 'id',             nullable: false },
        { name: 'dataset_id',     nullable: false },
        { name: 'provider',       nullable: false },
        { name: 'api_base',       nullable: true  },
        { name: 'model',          nullable: false },
        { name: 'api_key_cipher', nullable: false },
        { name: 'key_last4',      nullable: false },
        { name: 'is_active',      nullable: false, default: '0' },
        { name: 'created_at',     nullable: false },
        { name: 'updated_at',     nullable: false }
    ]
};

// Explicitly named indexes declared in prisma/schema.prisma (excludes PRIMARY)
const EXPECTED_INDEXES = {
    sections:                   ['idx_sections_dataset'],
    permits:                    ['idx_permits_user'],
    entries:                    ['uq_entries_dataset_eid', 'uq_entries_dataset_position', 'idx_entries_dataset', 'idx_entries_dataset_status'],
    triplesets:                 ['uq_triplesets_entry_type_position', 'idx_triplesets_entry'],
    triples:                    ['uq_triples_tripleset_position', 'idx_triples_tripleset'],
    lexes:                      ['uq_lexes_entry_lid_lang', 'idx_lexes_entry', 'idx_lexes_entry_position'],
    dbpedia_links:              ['uq_dbpedia_links_entry_position', 'idx_dbpedia_links_entry'],
    links:                      ['uq_links_entry_position', 'idx_links_entry'],
    annotations:                ['idx_annotations_user', 'idx_annotations_entry', 'idx_annotations_dataset'],
    section_assignments:        ['idx_section_assignments_user', 'idx_section_assignments_dataset', 'idx_section_assignments_section_status'],
    active_sessions:            ['idx_active_sessions_user'],
    annotation_alert_decisions: ['idx_annotation_alert_decisions_entry', 'idx_annotation_alert_decisions_user'],
    evaluation_criteria:        ['idx_evaluation_criteria_active_order'],
    reviews:                    ['idx_reviews_entry', 'idx_reviews_reviewer', 'idx_reviews_annotator', 'idx_reviews_status', 'idx_reviews_entry_round'],
    review_decisions:           ['uq_review_decisions_review_criterion', 'idx_review_decisions_review'],
    review_comments:            ['idx_review_comments_review'],
    dataset_llm_credentials:    ['uq_dataset_llm_credentials_dataset_provider', 'idx_dataset_llm_credentials_dataset']
};

// ── Output helpers ───────────────────────────────────────────────────────────

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function ok(/** @type {*} */ msg)    { console.log(`  ${GREEN}✔${RESET}  ${msg}`); }
function warn(/** @type {*} */ msg)  { console.log(`  ${YELLOW}⚠${RESET}  ${msg}`); }
function fail(/** @type {*} */ msg)  { console.log(`  ${RED}✖${RESET}  ${msg}`); }
function section(/** @type {*} */ title) { console.log(`\n${BOLD}${title}${RESET}`); }

// ── Checks ───────────────────────────────────────────────────────────────────

/**
 * Verifies the set of tables bidirectionally:
 *  - Counts as an issue every expected table missing from the DB.
 *  - Counts as an issue every table present in the DB not declared in Prisma.
 * @param {Set<string>} actualTables - Real (lowercase) table names in the DB.
 * @returns {number} Number of discrepancies.
 */
function checkTables(actualTables) {
    section('Tablas');
    let issues = 0;

    const expectedLower = new Set([...EXPECTED_TABLES].map(t => t.toLowerCase()));

    for (const table of EXPECTED_TABLES) {
        if (actualTables.has(table.toLowerCase())) {
            ok(table);
        } else {
            fail(`${table}  ← tabla ausente en la BD`);
            issues++;
        }
    }

    for (const actualTable of actualTables) {
        if (expectedLower.has(actualTable) || IGNORED_TABLES.has(actualTable))
            continue;

        fail(`${actualTable}  ← tabla en la BD no declarada en prisma/schema.prisma`);
        issues++;
    }

    return issues;
}

/**
 * Verifies columns per table in both directions:
 *  - Each expected column exists with the declared nullability and default.
 *  - There are no extra columns in the DB beyond those declared in Prisma.
 * @param {*} conn - MariaDB connection.
 * @param {string} db - Database.
 * @param {Set<string>} actualTables - Real tables.
 * @returns {Promise<number>} Number of discrepancies.
 */
async function checkColumns(conn, db, actualTables) {
    let issues = 0;

    for (const [table, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
        section(`Columnas · ${table}`);

        if (!actualTables.has(table.toLowerCase())) {
            fail('Tabla ausente — columnas no comprobadas');
            continue;
        }

        const rows = await conn.query(
            `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION`,
            [db, table.toLowerCase()]
        );

        const actual = new Map(rows.map((/** @type {*} */ r) => [r.COLUMN_NAME, r]));
        const expectedColumnNames = new Set(expectedCols.map(col => col.name));

        for (const expected of /** @type {Array<{name: string, nullable: boolean, default?: string}>} */ (expectedCols)) {
            const col = actual.get(expected.name);

            if (!col) {
                fail(`${expected.name}  ← columna ausente`);
                issues++;
                continue;
            }

            const colNullable = col.IS_NULLABLE === 'YES';
            let colIssues = 0;
            /** @type {any[]} */
            const notes = [];

            if (colNullable !== expected.nullable) {
                notes.push(`nullable: esperado ${expected.nullable}, actual ${colNullable}`);
                colIssues++;
            }

            if (expected.default !== undefined) {
                const rawDefault = col.COLUMN_DEFAULT === null ? null : String(col.COLUMN_DEFAULT);
                // MariaDB wraps string defaults with single quotes in INFORMATION_SCHEMA.
                const actualDefault = rawDefault === null ? null : rawDefault.replace(/^'(.*)'$/, '$1');
                if (actualDefault !== String(expected.default)) {
                    notes.push(`default: esperado '${expected.default}', actual '${actualDefault}'`);
                    colIssues++;
                }
            }

            if (colIssues > 0) {
                warn(`${expected.name}  ← ${notes.join(' | ')}`);
                issues += colIssues;
            } else {
                ok(expected.name);
            }
        }

        for (const actualColumnName of actual.keys()) {
            if (!expectedColumnNames.has(actualColumnName)) {
                fail(`${actualColumnName}  ← columna en la BD no declarada en prisma/schema.prisma`);
                issues++;
            }
        }
    }

    return issues;
}

/**
 * Verifies that all named indexes declared in Prisma exist in the DB.
 * (It does not report extra indexes: Prisma generates auxiliary indexes for
 * FKs whose name is not under explicit control in schema.prisma.)
 * @param {*} conn - MariaDB connection.
 * @param {string} db - Database.
 * @param {Set<string>} actualTables - Real tables.
 * @returns {Promise<number>} Number of discrepancies.
 */
async function checkIndexes(conn, db, actualTables) {
    let issues = 0;

    for (const [table, expectedIdxs] of Object.entries(EXPECTED_INDEXES)) {
        section(`Indices · ${table}`);

        if (!actualTables.has(table.toLowerCase())) {
            warn('Tabla ausente — indices no comprobados');
            continue;
        }

        const rows = await conn.query(
            `SELECT DISTINCT INDEX_NAME
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME <> 'PRIMARY'`,
            [db, table.toLowerCase()]
        );

        const actual = new Set(rows.map((/** @type {*} */ r) => r.INDEX_NAME));

        for (const idx of expectedIdxs) {
            if (actual.has(idx)) {
                ok(idx);
            } else {
                fail(`${idx}  ← indice ausente`);
                issues++;
            }
        }
    }

    return issues;
}

// ── Data invariants ──────────────────────────────────────────────────────────
// Covers what the structure declared in Prisma cannot guarantee on its own:
//  - Domains over VarChar columns (real enums like TriplesetType are already
//    enforced by MySQL and are not repeated here).
//  - Empty strings in NOT NULL columns (NOT NULL does not prevent TRIM='').
//  - Multi-row business rules (single owner per dataset, etc.).

/**
 * Counts the rows returned by a COUNT(*) query.
 * @param {*} conn - MariaDB connection.
 * @param {string} sql - Query returning a single COUNT(*).
 * @returns {Promise<number>} Number of rows.
 */
async function countRows(conn, sql) {
    const rows = await conn.query(sql);
    return Number(rows[0][Object.keys(rows[0])[0]] ?? 0);
}

/**
 * Verifies data invariants that cannot be expressed in the schema.
 * Warnings (warn) do not count as issues.
 * @param {*} conn - MariaDB connection.
 * @param {Set<string>} actualTables - Real (lowercase) tables.
 * @returns {Promise<number>} Number of violations.
 */
async function checkDataInvariants(conn, actualTables) {
    let issues = 0;

    const domainChecks = [
        { table: 'datasets',            label: "datasets.llm_mode ∈ {'generation','correction','none'}",                       sql: "SELECT COUNT(*) FROM `datasets` WHERE llm_mode NOT IN ('generation','correction','none')" },
        { table: 'entries',             label: "entries.status ∈ {'pending','annotated','completed'}",                          sql: "SELECT COUNT(*) FROM `entries` WHERE status NOT IN ('pending','annotated','completed')" },
        { table: 'section_assignments', label: "section_assignments.status ∈ {'active','completed','expired'}",                 sql: "SELECT COUNT(*) FROM `section_assignments` WHERE status NOT IN ('active','completed','expired')" },
        { table: 'users',               label: "users.is_moderator ∈ {0,1}",                                                     sql: "SELECT COUNT(*) FROM `users` WHERE is_moderator NOT IN (0,1)" },
        { table: 'annotations',         label: "annotations.origin ∈ {'manual','ai'}",                                          sql: "SELECT COUNT(*) FROM `annotations` WHERE origin NOT IN ('manual','ai')" },
        { table: 'reviews',             label: "reviews.status ∈ {'pending','in_progress','completed','disputed','cancelled'}", sql: "SELECT COUNT(*) FROM `reviews` WHERE status NOT IN ('pending','in_progress','completed','disputed','cancelled')" }
    ];

    section('Invariantes · dominios');
    for (const c of domainChecks) {
        if (!actualTables.has(c.table)) {
            warn(`${c.label}  ← tabla '${c.table}' ausente, omitido`);
            continue;
        }
        const count = await countRows(conn, c.sql);
        if (count > 0) {
            fail(`${c.label}  ← ${count} fila(s) con violacion`);
            issues++;
        } else {
            ok(c.label);
        }
    }

    const emptyChecks = [
        { table: 'users',    label: 'users.email no vacio',   sql: "SELECT COUNT(*) FROM `users` WHERE TRIM(email) = ''" },
        { table: 'datasets', label: 'datasets.name no vacio', sql: "SELECT COUNT(*) FROM `datasets` WHERE TRIM(name) = ''" }
    ];

    section('Invariantes · cadenas no vacias');
    for (const c of emptyChecks) {
        if (!actualTables.has(c.table)) {
            warn(`${c.label}  ← tabla '${c.table}' ausente, omitido`);
            continue;
        }
        const count = await countRows(conn, c.sql);
        if (count > 0) {
            fail(`${c.label}  ← ${count} fila(s) con violacion`);
            issues++;
        } else {
            ok(c.label);
        }
    }

    section('Invariantes · reglas de negocio');

    if (actualTables.has('datasets') && actualTables.has('permits')) {
        const orphanDatasets = await countRows(
            conn,
            'SELECT COUNT(*) FROM `datasets` WHERE id NOT IN (SELECT dataset_id FROM `permits` WHERE is_owned = 1)'
        );
        if (orphanDatasets > 0) {
            fail(`Datasets sin propietario  ← ${orphanDatasets} dataset(s)`);
            issues++;
        } else {
            ok('Todos los datasets tienen al menos un propietario');
        }

        const multiOwner = await countRows(
            conn,
            'SELECT COUNT(*) FROM (SELECT dataset_id FROM `permits` WHERE is_owned = 1 GROUP BY dataset_id HAVING COUNT(*) > 1) t'
        );
        if (multiOwner > 0) {
            warn(`Datasets con mas de un propietario  ← ${multiOwner} dataset(s)`);
        } else {
            ok('Ningun dataset tiene mas de un propietario');
        }
    } else {
        warn("Propietario unico por dataset  ← tabla 'datasets' o 'permits' ausente, omitido");
    }

    if (actualTables.has('permits')) {
        const count = await countRows(
            conn,
            'SELECT COUNT(*) FROM `permits` WHERE is_owned = 0 AND is_annotator = 0 AND is_reviewer = 0 AND is_admin = 0'
        );
        if (count > 0) {
            fail(`Permits sin ningun rol activo  ← ${count} fila(s)`);
            issues++;
        } else {
            ok('Toda fila de permits tiene al menos un rol activo');
        }
    } else {
        warn("Roles activos en permits  ← tabla 'permits' ausente, omitido");
    }

    if (actualTables.has('entries') && actualTables.has('lexes')) {
        const entriesWithoutEnLex = await countRows(
            conn,
            "SELECT COUNT(*) FROM `entries` e WHERE e.id NOT IN (SELECT entry_id FROM `lexes` WHERE lang = 'en')"
        );
        if (entriesWithoutEnLex > 0) {
            warn(`Entries sin lexicalizacion en ingles  ← ${entriesWithoutEnLex} entry(s)`);
        } else {
            ok('Todas las entries tienen al menos una lexicalizacion en ingles');
        }
    } else {
        warn("Lexicalizacion en ingles por entry  ← tabla 'entries' o 'lexes' ausente, omitido");
    }

    return issues;
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n${BOLD}=== Comprobacion de schema: ${config.mysql.database}@${config.mysql.host}:${config.mysql.port} ===${RESET}`);

    /** @type {any} */
    /** @type {any} */
    let conn;
    try {
        conn = await mariadb.createConnection(config.mysql);
    } catch (err) {
        console.error(`\n${RED}No se pudo conectar a la base de datos: ${/** @type {any} */ (err).message}${RESET}\n`);
        process.exit(1);
    }

    try {
        const tableRows = await conn.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [config.mysql.database]
        );
        // MariaDB with lower_case_table_names=1 (Windows) returns names in lowercase.
        const actualTables = new Set(tableRows.map((/** @type {*} */ r) => r.TABLE_NAME.toLowerCase()));

        const tables = checkTables(actualTables);
        const columns = await checkColumns(conn, config.mysql.database, actualTables);
        const indexes = await checkIndexes(conn, config.mysql.database, actualTables);
        const invariants = await checkDataInvariants(conn, actualTables);

        const total = tables + columns + indexes + invariants;

        console.log('\n' + '─'.repeat(60));
        if (total === 0) {
            console.log(`${GREEN}${BOLD}✔ Sin discrepancias. Schema OK.${RESET}\n`);
        } else {
            console.log(`${RED}${BOLD}✖ ${total} discrepancia(s) encontrada(s).${RESET}\n`);
            process.exit(1);
        }
    } finally {
        await conn.end();
    }
}

main();
