# Session handoff — AUDITORY-6 epic, mid-execution

## Where we are
- We are working through `doc-planning/AUDITORY-6-LEGACY.md`, executing each open audit row in §2 as a task.
- **27 of 30 tasks are done.** Remaining: **Task 28** (AUDIT-5 §4.9, mappers), **Task 29** (AUDIT-1 §10 / §4.7, decompose `spanish-service.js`), **Task 30** (AUDIT-3 §2 / AUDIT-4 §4 / AUDIT-4 §17, section-close transaction).
- Current state: **442 unit tests passing**. Working tree has substantial changes; nothing committed yet.

## First thing to do in this window
1. Read this file (you're doing it).
2. Read the three remaining audit rows in `doc-planning/AUDITORY-6-LEGACY.md` §2 (search for `§4.9`, `§4.7`, `§17`).
3. Begin Task 28: plan it, ask the user for any architecture/functional decisions, then wait for confirmation before touching code.

## Operating methodology (locked in, do not re-litigate)
- **Plan → confirm → execute → run tests → grep `documentation/` for stale refs.** One task at a time.
- The user verifies every task plan before I implement. Each plan calls out *weak points* explicitly.
- **AskUserQuestion** is the way to surface functional/architectural decisions during planning. Recommendations always go first in the options.
- Default is non-cautious mode: once the user confirms the plan, do all subtasks in one pass.
- I have autonomy to run `npm run test:unit` whenever I need (overrides CLAUDE.md restriction). Integration tests are flagged as broken (see below) — don't try to run them.
- Touch the dataset schema or `USER-STORIES.md`? Requires **explicit user acceptance** at planning time, not "yes" to the overall plan.

## Architectural conventions established this session
- **Strict semantics over permissive.** Examples: boolean tokens are `{'true','1','false','0'}` only (no `yes`/`no`/`on`/`si`); email lookup dropped its case-preserving OR fallback; tests adapted accordingly.
- **Full hard cutovers over backwards-compat layers.** Wire-format changes break the old shape immediately; frontend migrated in the same commit.
- **Flavor A (external split) for service decomposition**, not façades. Each service is independently instantiable and the composition root wires them explicitly. Controllers accept multiple services and route methods. This is committed for future growth (~2× ahead).
- **Helpers with sensible defaults over named variants.** `trimmedOr(value, fallback=null)` instead of `trimmedOrNull` + `trimmedOrEmpty` + `trimmedOrFallback`. Same for `normalizeEmail`, `toBoolean`.
- **Tests migrated alongside code.** When a stub key changes (e.g., `datasetsRepository:` → `datasetsPermissionsRepository:`), update the test in the same task.
- **Capability checks vs. test-ergonomics duck-types.** Real optional capabilities (e.g., `checkBatch`) keep their `typeof === 'function'` check with an explanatory comment. Test-ergonomics duck-types were removed and tests adapted.
- **Single source of truth for canonical helpers in `utils/validators.js`** — see "File layout" below.

## File layout after Tasks 1–27 (the load-bearing facts)

### `utils/validators.js` — canonical helpers
- `toPositiveInteger(value)` — returns `int > 0` or `null`.
- `toIntegerNormalized(value)` — non-negative integer, `0` on garbage. Replaces all old `normalizeNonNegativeInteger` / `normalizePositiveCount` / `toNonNegativeInteger`.
- `trimmedOr(value, fallback=null)` — replaces `normalizeOptionalString`, `normalizeRequiredString`, `normalizeOptionalText`, `normalizeString`, `toTrimmedString`.
- `normalizeEmail(value, fallback=null)` — `trim().toLowerCase()` or fallback. Replaces `normalizeUserEmail`, `normalizeExactEmail`, entity's `normalizeEmail`.
- `toBoolean(value, fallback=null)` — strict tokens only. Replaces `normalizeBoolean` and `normalizeBooleanOption`.
- `normalizePercent`, `isStringArray`, `getErrorMessage`.

### `constants/`
- `constants/users.js` (new) — exports `REGISTER_CODE_PATTERN` (was duplicated in controller + service).
- `constants/datasets.js` — adds `DEFAULT_DATASET_COLOR = 'dataset-purple'` (decoupled from `DATASET_COLORS` rotation).

### `services/` — dataset bounded context split (Task 26, Flavor A)
- `services/datasets-service.js` (~700 lines) — listing, sections, downloads, create/delete.
- `services/datasets-permissions-service.js` (new, 241 lines) — `listDatasetPermissions`, `addDatasetPermissionByEmail`, `updateDatasetPermission`. Also exports standalone `assertDatasetAdminPermission(repo, actorId, datasetId)` for cross-service admin gating (used by `deleteDataset`).
- `services/datasets-statistics-service.js` (new, 248 lines) — `getDatasetStatistics` + stats helpers.

### `repositories/` — matching split (Task 27)
- `repositories/datasets-repository.js` (~835 lines) — reads + lifecycle.
- `repositories/datasets-permissions-repository.js` (new, 169 lines) — `findPermitForUser`, `findPermissionRowsByDataset`, `upsertDatasetPermission`, `deleteDatasetPermission`.
- `repositories/datasets-statistics-repository.js` (new, 94 lines) — `findDatasetStatisticsGraph`.

### Controller and composition root
- `controllers/datasets-controller.js` accepts 3 services: `datasetsService`, `datasetsPermissionsService`, `datasetsStatisticsService`.
- `app.js` instantiates 3 repos + 3 services and wires them.

### Other notable extractions
- `domain/spanish/lexicon.js` (Task 23) — `ENTITY_ALIASES`, `PREDICATE_RELATION_PATTERNS`, `COMPLETE_SENTENCE_MARKERS` extracted from `spanish-service.js`. Spanish service still mixes orchestration + coverage scorer + LLM alert post-processor + persistence — **Task 29 will further decompose it.**
- `utils/xml-format.js` exports `renderAttrs(attrs)` (Task 20). `escapeAttr` is gone (consolidated on `escapeXml`).
- `services/service-error.js` exposes `ServiceError.datasetNotFound()` and `ServiceError.emailTaken()` factories.
- `tests/integration/_helpers/bigint.js` (new) — `normalizeBigInts` lifted from 6 integration suites.

### Wire-format changes
- `POST /api/annotations/send` payload (Task 21): `sentences: [{ sentence, rejectionReason? }]` instead of two parallel arrays. Documented in `documentation/TECHNICAL-DESIGN.md` §4.1.1. Frontend (`public/js/actions/annotations-actions.js`) sends the new shape.

### `domain/spanish/ollama-spanish-checker.js` (Task 25)
- Exports only the 3 contract methods: `check`, `checkBatch`, `proposeCorrectionsBatch`. 10 internal helpers no longer exported.
- Tests mock at the `llm-client` boundary (proxyquire + testdouble) instead of poking internals.
- `tests/unit/spanish/spanish-controller.test.js` (zombie file) deleted.

### Dead code removed
- `controllers/datasets-controller.listDatasets` (unrouted).
- `services/datasets-service.listAccessibleDatasets` from the module.exports.
- `utils/api-error-payload.buildApiErrorPayloadFromError` from module.exports.
- `utils/llm-http.safeReadText` from module.exports.
- `constants/paths.PROJECT_ROOT_DIR` and `fromProjectRoot`.
- `services/section-assignment-service.requestSection`/`releaseSection`/`resumeSection` + `sectionMatchesComplexity` (~250 lines + 15 tests). Audit-4 §5 deferred US-04 complexity feature is now intentionally unbuilt; US-04 title in `USER-STORIES.md` updated to drop "complexity".
- `repositories/datasets-repository.findEntrySizesByDataset`, `findActiveSectionIndexes`, `findCompletedSectionIndexes`.

## Pre-existing issues to flag but NOT fix
- **Integration tests don't run.** Both `tests/integration/datasets/*.test.js` and `tests/integration/annotations/annotation-workflow.test.js` use `POST /create-session` which was deleted (now `POST /api/session/`). Out of scope for this epic. Don't try to run integration tests during plans.
- **Knip config is misaligned with the project layout.** `npm run lint:dead` produces false-positive "unused" reports for `express-session`, `multer`, `fast-xml-parser`, `@types/mocha`, etc. Don't trust knip output for this codebase. AUDIT-5 §4.10 row in `AUDITORY-6-LEGACY.md` was annotated with this finding.
- **`TESTS.md` is stale.** It catalogs tests by number; many were deleted/renamed in Tasks 22, 25. Out of scope; the user knows.

## Memory rules (in addition to auto-memory `MEMORY.md`)
- **No `git stash`** — linter reformats files and stash/pop loses changes. Use `git diff` for inspection.
- **No arbitrary git commands** — only `git diff` when truly needed.
- **Chat in English.** Don't translate project files (most identifiers are in Spanish).
- Today's date: 2026-05-20 (verify via the system reminder, can drift).

## Gotchas per remaining task

### Task 28 — AUDIT-5 §4.9: collapse alias-rich mappers
- File: `contracts/dto-mappers.js` (~570 lines after this session's changes).
- Audit's complaint: every outbound mapper accepts 6–10 aliases per field (`id`/`datasetId`, `triplesRDF`/`totalEntries`/`metrics.rdfTriples`, etc.) — the mapper papers over upstream-shape divergence.
- **Now feasible because Tasks 26+27 split the upstream layers.** Each sub-service produces a canonical shape; the mapper can stop being the de-facto contract layer.
- Open question for the user: are *any* of the aliases still needed for backward-compat with raw Prisma rows? Or can each upstream caller commit to one shape?
- Don't migrate everything at once. Suggest splitting by DTO (one mapper at a time) and asking the user to confirm dropping aliases per DTO.

### Task 29 — AUDIT-1 §10 / §4.7: decompose `domain/spanish/spanish-service.js`
- 841 lines. Lexicon already extracted (Task 23).
- Recommended split per audit: orchestrator (`spanish-service`) + coverage scorer (`coverage-checker`) + alert post-processor (`alert-merger`). Persistence already isolated via `annotationsRepository`.
- This is a Cohesion/SRP task. Similar shape to Task 26 (service split). Apply the same Flavor A pattern: external sub-modules, the orchestrator composes them.
- Risk: `check`/`checkBatch` are the public surface; the split must not break their contract. The contract tests in `tests/unit/ollama/ollama-spanish-checker.test.js` are at the LLM boundary; the spanish-service contract tests are in `tests/unit/spanish/`.

### Task 30 — AUDIT-3 §2 / AUDIT-4 §4 / AUDIT-4 §17: section-close atomicity
- **The hardest item.** `services/annotations-service.saveSentences` chains 4 writes (annotations, session, section assignment, dataset counters) without a transactional boundary.
- The audit explicitly says: **denormalised counters stay** per `TECHNICAL-DESIGN.md §3.5`. The fix is to wrap `completeAssignmentIfSectionDone` + `markSectionAsAnnotated` in a single `prisma.$transaction`, NOT to recompute the counters.
- Touches: `services/annotations-service.js`, `services/section-assignment-service.js`, `repositories/datasets-repository.js` (or wherever `markSectionAsAnnotated` lives now).
- The transaction must accept an injectable Prisma client (some tests stub it). `completeAssignmentIfSectionDone` already accepts `prismaClient` override.
- The error-handling change: today `completeAssignmentIfSectionDone` is called with `.catch(() => false)` — swallows errors. Inside a transaction this would suppress rollback. Need to surface the error.
- This is the "AUDIT-Opus 4.7 Very High" complexity item per the audit. Plan carefully, propose `prisma.$transaction` shape to the user, get explicit acceptance.

## How to handle test stubs after the splits
- When a test stubs a repo method, check which repo it now belongs to:
  - `findPermitForUser`, `findPermissionRowsByDataset`, `upsertDatasetPermission`, `deleteDatasetPermission` → `datasetsPermissionsRepository:` key.
  - `findDatasetStatisticsGraph` → `datasetsStatisticsRepository:` key.
  - Everything else → `datasetsRepository:` key.

## Suggested first response in this window
> "Read `.claude/NEXT_PROMPT.md` — got it. Starting Task 28 (AUDIT-5 §4.9, collapse alias-rich mappers). Let me re-read the audit row and inspect `contracts/dto-mappers.js` before proposing the plan."

Then read both, present the plan with weak points, ask the architecture decision questions, wait for confirmation.
