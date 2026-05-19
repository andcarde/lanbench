# Duplications & Dead-Code Audit — AUDITORY-5

**Date:** 2026-05-19
**Auditor:** Claude Opus 4.7
**Scope:** application source code of `lanbench` (excluding `node_modules/`, `public/`, `views/`, `logs/`, `uploads/`, `test_datasets/`, `front-mocks/`, and the `tests/` tree itself — tests *are* consulted as consumers when judging unused exports).
**Focus (per request):** (1) duplicate code, (2) unused code, (3) unused exports, (4) unused imports, (5) bad programming smells. Architectural commentary outside these five axes is intentionally out of scope (see [AUDITORY-4](AUDITORY-4.md) for that).
**Previous baseline:** [AUDITORY-4](AUDITORY-4.md). Items already mitigated since then are noted as such; items still open are re-stated only when the symptom this audit found is duplication/dead-code-shaped.
**Tooling:** `npx knip` with a widened entry/project glob (the project's checked-in `knip.json` only covers root-level `.js`, so it misses ~95% of the source tree); plus manual cross-cutting `Grep`/`Read` passes for normalizers, XML emitters, LLM clients, session/section selection, and error envelopes.

---

## 0. Stale AUDITORY-4 items already mitigated (not duplications anymore)

These are recorded so future audits don't re-report them:

- `pinoHttp` / `request.log` dual logging pipeline (AUDIT-4 §1.2, §1.4 DRY): `pinoHttp` is no longer imported from [app.js](../app.js); only [middlewares/request-log-middleware.js](../middlewares/request-log-middleware.js) remains. **No duplication today.**
- `spanish-service.save` legacy positional `(rdfId, sentence, rejectionReason)` branch (AUDIT-4 §1.2): only the object-payload form remains ([spanish-service.js:105-128](../domain/spanish/spanish-service.js#L105-L128)). The dual export `{ ...defaultSpanishService, createSpanishService }` is also gone — module now exports `{ createSpanishService }` only ([spanish-service.js:839-841](../domain/spanish/spanish-service.js#L839-L841)).
- `entities/dataset.js` exporting two unrelated classes (AUDIT-4 §1.1, §1.4): only `DatasetDTO` is exported now ([entities/dataset.js:58-60](../entities/dataset.js#L58-L60)); `DatasetListItemDTO` is gone.
- `users-controller.legacyMessageError` envelope (AUDIT-4 §1.2, §1.4): [controllers/users-controller.js](../controllers/users-controller.js) imports and uses `respondWithApiError` / `respondInvalidPayload` like the rest of the controllers. Success bodies still carry `{ title, message }` on `/register*`, which is an inconsistency but not an error-envelope split.

---

## 1. Duplicate code

### 1.1 `normalizeNonNegativeInteger` ≡ `normalizePositiveCount` (same file, byte-identical body)

[services/datasets-service.js:778-794](../services/datasets-service.js#L778-L794):

```js
function normalizeNonNegativeInteger(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.floor(parsed);
}

function normalizePositiveCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return 0;
    return Math.floor(parsed);
}
```

The two functions are character-for-character identical except for the name. **Action:** delete `normalizePositiveCount`, repoint its 1 caller. The name is also a lie — for `value <= 0` it returns `0`, so it produces *non-negative* counts, not *positive* ones.

### 1.2 Four parallel "coerce to non-negative integer" implementations

Beyond §1.1, the same `Number(x) → integer ≥ 0` coercion exists in four files:

| File | Symbol | Returns on garbage |
|---|---|---|
| [utils/validators.js:31](../utils/validators.js#L31) | `toIntegerNormalized` | `0` |
| [services/datasets-service.js:778](../services/datasets-service.js#L778) | `normalizeNonNegativeInteger` | `0` |
| [services/datasets-service.js:790](../services/datasets-service.js#L790) | `normalizePositiveCount` (duplicate of above) | `0` |
| [services/admin-service.js:496](../services/admin-service.js#L496) | `toNonNegativeInteger` | `0` |

`toIntegerNormalized` uses `Math.trunc`; the others use `Math.floor`. For non-negative finite inputs they coincide — there is no semantic reason to keep four versions. The util in `utils/validators.js` is already imported by `contracts/dto-mappers.js`; the two services should consume it too.

### 1.3 `normalizeOptionalString` defined in three places, identical body

The "return trimmed string or `null`" helper exists in:

- [contracts/dto-mappers.js:428-434](../contracts/dto-mappers.js#L428-L434) — `normalizeOptionalString`
- [utils/validation-alert.js:132-138](../utils/validation-alert.js#L132-L138) — `normalizeOptionalString` (byte-identical body)
- [domain/spanish/spanish-service.js:831-837](../domain/spanish/spanish-service.js#L831-L837) — `normalizeOptionalText` (same body, different name)

```js
if (typeof value !== 'string') return null; // or fallback in the *Required variant
const trimmed = value.trim();
return trimmed.length > 0 ? trimmed : null;
```

Pair this with the "trimmed string or fallback" sibling, which also has three near-identical implementations:

- [contracts/dto-mappers.js:413](../contracts/dto-mappers.js#L413) — `normalizeRequiredString(value, fallback)`
- [utils/validation-alert.js:119](../utils/validation-alert.js#L119) — `normalizeString(value, fallback)`
- [config.js:123](../config.js#L123) — `normalizeString(value, fallback)`

And the no-fallback `→ ''` variant:

- [services/admin-service.js:390](../services/admin-service.js#L390) — `normalizeString(value)`
- [controllers/users-controller.js:250](../controllers/users-controller.js#L250) — `toTrimmedString(value)` (`returns ''`)

Seven implementations of the same two-line idiom. **Action:** lift `normalizeOptionalString` / `normalizeRequiredString` into `utils/validators.js` (where the related `normalizePercent`/`toPositiveInteger` already live) and import from there.

### 1.4 `normalizeUserEmail` ≡ `normalizeExactEmail` (cross-module duplicate)

Both functions take a value, return `value.trim().toLowerCase()` or `null`:

- [services/datasets-service.js:802-808](../services/datasets-service.js#L802-L808) — `normalizeUserEmail`
- [repositories/users-repository.js:138-144](../repositories/users-repository.js#L138-L144) — `normalizeExactEmail`

Same shape, same intent. The repository's `findByExactEmail` *also* defensively re-tries with the raw-trimmed casing ([users-repository.js:65-68](../repositories/users-repository.js#L65-L68)) — that retry only makes sense if a caller might bypass normalization, which centralising the helper would eliminate.

[entities/user.js:127-131](../entities/user.js#L127-L131) has a third variant (`normalizeEmail`) that diverges only by returning `''` instead of `null` for invalid input — same canonical operation in three places, three return contracts.

### 1.5 `normalizeBoolean` ≡ `normalizeBooleanOption` (different files, ≈identical truth tables)

- [config.js:151-162](../config.js#L151-L162) — `normalizeBoolean(value, fallback)` accepts `true/1/yes` / `false/0/no` strings.
- [services/datasets-service.js:998-1008](../services/datasets-service.js#L998-L1008) — `normalizeBooleanOption(value)` accepts `true/1/yes/on/si/sí` strings; otherwise `value === 1`.

The body of each is a 5-line string lookup over the same lexicon. Same intent, lightly different vocabularies — should be one helper that takes the accepted-true / accepted-false sets, or one helper with an extended set used by both.

### 1.6 `REGISTER_CODE_PATTERN` defined twice, identical regex

- [controllers/users-controller.js:32](../controllers/users-controller.js#L32) — `/^[A-Za-z0-9]{16}$/`
- [services/users-service.js:26](../services/users-service.js#L26) — `/^[A-Za-z0-9]{16}$/`

Same regex, same docstring intent ("Patron de los codigos de registro de moderador"). The controller validates and rejects with `respondInvalidPayload`; the service validates and throws `ServiceError`. The double validation is itself defensible at a layer boundary, but the regex literal must live in one place — `constants/` is the obvious home.

### 1.7 Two hand-rolled XML emitters

Still open from [AUDITORY-4 §1.2](AUDITORY-4.md). The split is:

- [utils/dataset-xml.js:20-37](../utils/dataset-xml.js#L20-L37) — `buildDatasetXml(entries)` emits `<benchmark><entries>…` using `xml-format.escapeAttr` / `toArray`.
- [services/admin-service.js:423-453](../services/admin-service.js#L423-L453) — `buildExportXml(payload)` emits `<lanbenchExport>…<annotation>…<alertDecision>` using `xml-format.escapeXml`.

Both walk a graph of dataset → entries → children, both interpolate attributes with manual escaping, and both rely on `xml-format` but pick different escapers. The shapes they emit are different, but the *machinery* (open-tag helper, attribute escaping, line list accumulator) is duplicated. **Action:** extract a tiny `renderElement({ tag, attrs, children })` helper into [utils/xml-format.js](../utils/xml-format.js) and consume it from both writers.

### 1.8 `filterPersistedTriplesets` vs `flattenPersistedTriplesets`

[services/datasets-service.js:905-931](../services/datasets-service.js#L905-L931). The two functions differ by a single operator (`.map` vs `.flatMap`) and an extra wrapping object:

```js
function filterPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter(ts => ts.type === type)
        .map(ts => ({ triples: ts.triples.map(t => ({ subject: t.subject, predicate: t.predicate, object: t.object })) }));
}

function flattenPersistedTriplesets(triplesets, type) {
    return triplesets
        .filter(ts => ts.type === type)
        .flatMap(ts => ts.triples.map(t => ({ subject: t.subject, predicate: t.predicate, object: t.object })));
}
```

The inner `t → { subject, predicate, object }` mapper is also duplicated in [mapPersistedEntryToXmlEntry](../services/datasets-service.js#L884-L895) (twice, once for `dbpediaLinks`, once for `links`). Extract a `pickTripleFields(t)` (or just `(t) => ({ subject: t.subject, predicate: t.predicate, object: t.object })`) helper.

### 1.9 `mapPersistedEntryToAnnotationEntry` vs `mapPersistedEntryToXmlEntry`

[services/datasets-service.js:848-897](../services/datasets-service.js#L848-L897). Same input shape, same head (`eid`, `category`, `shape`, `shapeType`, `size`), divergent tail — one emits `originalTriples`/`modifiedTriples`/`sourceSentences` for the UI, the other emits `originalTriplesets`/`modifiedTriplesets`/`lexes`/`dbpediaLinks`/`links` for the XML writer. The head (50% of each function) is duplicated; the divergent tail is the actual interesting part. Pull out an `extractEntryHead(record)` helper.

### 1.10 Default-color literal `'dataset-purple'` duplicated outside the constants module

[constants/datasets.js:12](../constants/datasets.js#L12) declares `DATASET_COLORS = ['dataset-purple', 'dataset-violet', 'dataset-green-progress']`, and [contracts/dto-mappers.js:31](../contracts/dto-mappers.js#L31) declares its own `DEFAULT_COLOR_CLASS = 'dataset-purple'`. [services/datasets-service.js:968](../services/datasets-service.js#L968) inlines the same literal as a third copy. Three sources of truth for the same default; if the palette is ever rebranded, two of them silently drift. Promote `DEFAULT_COLOR_CLASS` into `constants/datasets.js` and import from there.

### 1.11 `'Dataset no encontrado.' / 'dataset_not_found'` ServiceError thrown identically in five places

[services/datasets-service.js](../services/datasets-service.js) lines 175, 200/203 (variant), 464, 481, 533. Each site is:

```js
throw new ServiceError('Dataset no encontrado.', { status: 404, code: 'dataset_not_found' });
```

Same message, same status, same code, sometimes inside an immediate `if (!datasetRow)` guard. **Action:** small factory in `services/service-error.js` — `ServiceError.datasetNotFound()` — or a `assertDatasetExists(row)` helper.

The same pattern recurs in `services/users-service.js` at lines 69 and 94 for `'Email already registered.' / 'email_taken'`.

### 1.12 Test helper `normalizeBigInts` copy-pasted across 5 integration suites

Out of strict scope (tests folder), but worth flagging as a duplication smell because it leaks into PR diffs every time:

- [tests/integration/users/users-database.test.js:173](../tests/integration/users/users-database.test.js#L173)
- [tests/integration/annotations/annotation-workflow.test.js:347](../tests/integration/annotations/annotation-workflow.test.js#L347)
- [tests/integration/users/register-moderator.test.js:150](../tests/integration/users/register-moderator.test.js#L150)
- [tests/integration/datasets/dataset-lifecycle.test.js:318](../tests/integration/datasets/dataset-lifecycle.test.js#L318)
- [tests/integration/users/login-session.test.js:192](../tests/integration/users/login-session.test.js#L192)

Extract into `tests/integration/_helpers/bigint.js`.

---

## 2. Unused / dead code (production)

### 2.1 `controllers/datasets-controller.listDatasets` is exported but never routed

[controllers/datasets-controller.js:45-56](../controllers/datasets-controller.js#L45-L56) defines `listDatasets`, and the controller's returned bag includes it ([line 305](../controllers/datasets-controller.js#L305)). No router mounts it (only `listAllDatasets` is wired via [routes/datasets-api.js:34](../routes/datasets-api.js#L34)). The method is a near-duplicate of `listAllDatasets` — same auth check, same error handler, but it calls `service.listAccessibleDatasets` then maps, whereas `listAllDatasets` calls `service.listAccessibleDatasetItems` (which already mapped) and then maps again. **Two near-identical methods, neither path is wholly correct.** Recommended: delete `listDatasets`, audit the double-map in `listAllDatasets` (see §4.3).

### 2.2 `utils/api-error-payload.buildApiErrorPayloadFromError` only used inside its own file

[utils/api-error-payload.js:61, 83, 89, 115](../utils/api-error-payload.js#L61). The function is called only by `respondWithApiError` (same module). Knip flags the export; the symbol is fine internally, but the public surface can be reduced to `{ buildApiErrorPayload, respondWithApiError, respondUnauthenticated, respondInvalidPayload }`.

### 2.3 `utils/llm-http.safeReadText` only used inside its own file

[utils/llm-http.js:28, 70, 87](../utils/llm-http.js#L28). Called by `fetchWithTimeout`; never imported elsewhere. Drop from `module.exports`.

### 2.4 `constants/paths.PROJECT_ROOT_DIR` and `fromProjectRoot` are never imported

[constants/paths.js:17, 31, 36, 38](../constants/paths.js#L17). The module exports three symbols but only `TEST_DATA_PATH` is consumed by `utils/temp-storage.js`. `PROJECT_ROOT_DIR` and `fromProjectRoot` have no consumers in `app/`, `tests/`, or `scripts/`. Either delete or have callers (e.g. `request-log-middleware`'s own `path.join(__dirname, '..', 'logs')`) consume them.

### 2.5 `types/typedefs.js` exports `{}`

[types/typedefs.js:264](../types/typedefs.js#L264). The file is consumed only via JSDoc `@typedef {import('../types/typedefs').X}` imports — never as a runtime value. The terminal `module.exports = {};` is dead but harmless. Acceptable as-is; could be removed for tidiness.

### 2.6 `prisma/client.js` `default` export shape

Knip flags the `module.exports = globalRef.__lanbenchPrismaClient;` as an "unused default" — false positive in the strict sense (every repository imports it as `defaultPrisma`), but worth noting the import sites all use it as a plain value rather than a named property, so the singleton can't easily be re-tested. Out of scope for this audit's "unused" axis, but it interacts with the duck-typing smells in §4.

### 2.7 `services/datasets-service.requireDatasetAdminPermission` is a one-line indirection

[services/datasets-service.js:492-494](../services/datasets-service.js#L492-L494):

```js
async function requireDatasetAdminPermission(actorId, datasetId) {
    return requireDatasetAdminPermissionFactory(deps, actorId, datasetId);
}
```

The closure exists only to capture `deps`. Either inline its body, or rename `Factory` away and make `requireDatasetAdminPermission` the only function. Dead level of indirection, not dead code per se.

### 2.8 Knip false-positive cluster: `domain/spanish/ollama-spanish-checker.js` and `domain/spanish/rule-checker.js` exports

Knip reports 15 exports from `ollama-spanish-checker.js` and 5 from `rule-checker.js` as unused. **These are NOT dead** — [tests/unit/ollama/ollama-spanish-checker.test.js](../tests/unit/ollama/ollama-spanish-checker.test.js) and [tests/unit/spanish/rule-checker.test.js](../tests/unit/spanish/rule-checker.test.js) consume them via `proxyquire`/`require`, which knip can't statically resolve when the module itself only exposes the helpers for testability. The smell here is that the modules *only* expose so many helpers *for the tests* (`getSystemPrompt`, `buildCheckPrompt`, `normalizeBatchOllamaResult`, ...) — see §4.5.

---

## 3. Unused imports

`grep` for `require(` callers vs the symbols they destructure didn't surface any unused-named-import case in the production tree — every destructured name is consumed within its file. The knip pass also reports zero unused imports.

(`@types/mocha` in `devDependencies` is reported as unused by knip — that's a packages-level finding, not source code, but worth fixing in `package.json`.)

---

## 4. Bad programming smells

### 4.1 Duck-typed optional-method checks (`typeof repo.X === 'function'`)

Still present, same shape as [AUDITORY-4 §1.2](AUDITORY-4.md#1.2) — duplicate-flavoured because the pattern itself is copy-pasted at every call site:

- [services/datasets-service.js:143](../services/datasets-service.js#L143) — `findActiveReviewDatasetIdsForReviewer`
- [services/datasets-service.js:476](../services/datasets-service.js#L476) — `findAccessibleDatasetGraphById`
- [services/section-assignment-service.js:88](../services/section-assignment-service.js#L88) — `findCompletedSectionIndexes`
- [services/continue-dataset-service.js:72](../services/continue-dataset-service.js#L72) — `expireStaleAssignments`
- [services/continue-dataset-service.js:316](../services/continue-dataset-service.js#L316) — `findEntryByPosition`
- [services/annotations-service.js:67, 231](../services/annotations-service.js#L67) — `checkBatch`, `completeAssignmentIfSectionDone`
- [services/reviews-service.js:298](../services/reviews-service.js#L298) — `tx.annotation.updateMany`
- [domain/spanish/spanish-service.js:77](../domain/spanish/spanish-service.js#L77) — `semanticChecker.checkBatch`

Eight production call sites repeat the same `if (typeof repo.X === 'function')` shape, each silently falling back to a different default behaviour (return `null`, skip the call, treat result as empty). The duplicate is the *pattern*; the smell is that no test can prove which fallback path is taken because the contract is implicit.

### 4.2 `'use strict';` directives are duplicated in every file

Every source file opens with `'use strict';`. CommonJS modules are not strict by default, so this is necessary in legacy contexts — but Node's CJS modules are evaluated in strict mode automatically since Node 12 for any function that uses `class`/`const`/`let` (and the project targets Node 22). The directive is dead weight. Not strictly *wrong*, but every file has the same dead line. Either keep it as a stylistic choice (and document so) or rip them all out.

### 4.3 `controllers/datasets-controller.listAllDatasets` double-maps DTOs

[controllers/datasets-controller.js:67-69](../controllers/datasets-controller.js#L67-L69):

```js
const datasetList = await service.listAccessibleDatasetItems(userId);
return response.status(200).json(mapDatasetListDTOs(datasetList));
```

`service.listAccessibleDatasetItems` ([datasets-service.js:161-164](../services/datasets-service.js#L161-L164)) already calls `mapDatasetListDTOs(datasets)` internally. The controller then re-maps the result. `mapDatasetListDTO` is roughly idempotent on already-mapped data, but it walks all alias keys for every record on every call. Pick one site of normalisation.

### 4.4 `getSectionStartPosition` helper is bypassed in one of three call sites

[services/continue-dataset-service.js:293-295](../services/continue-dataset-service.js#L293-L295) defines `getSectionStartPosition(n)` as `(n - 1) * SECTION_SIZE`. Two call sites use it ([line 112, 133](../services/continue-dataset-service.js#L112)). The third ([line 196](../services/continue-dataset-service.js#L196)) inlines `maxSectionIndex * SECTION_SIZE` — same arithmetic, different naming, missed indirection. Either it's a bug (off-by-one between "section index" and "section number") or it's a missed call to the helper.

### 4.5 `domain/spanish/ollama-spanish-checker.js` exports 15 internal helpers for testability

[domain/spanish/ollama-spanish-checker.js:695-707](../domain/spanish/ollama-spanish-checker.js#L695-L707): the file's `module.exports` enumerates 15 functions — `check`, `checkBatch`, `proposeCorrectionsBatch`, plus 12 helpers that exist purely as test seams (`getSystemPrompt`, `buildCheckPrompt`, `normalizeOllamaResult`, `parseRawResponse`, ...). Production callers go through `spanish-service`'s injected `semanticChecker`, which only needs `check` / `checkBatch` / `proposeCorrectionsBatch`. The other 12 are a public surface kept alive by tests asserting on the prompt strings and normalisers. Same shape applies to [domain/spanish/rule-checker.js:148-152](../domain/spanish/rule-checker.js#L148-L152) which exports 5 helpers, 2 of which (`isImmediateFailure`, `EMPTY_SENTENCE_REASON`) have no production consumer.

This is a real smell: the test suite is coupled to the module's internal layout rather than to the contract `spanish-service` expects. It also means refactoring the prompts requires editing the tests, which encourages skipping the refactor.

### 4.6 Hardcoded Spanish-NLP data in the domain orchestrator

Still open from [AUDITORY-4 §1.3 OCP](AUDITORY-4.md). Mentioned here as a *duplication-adjacent smell* because each hardcoded constant is one place to change instead of the centralised vocabulary the file pretends to be:

- [domain/spanish/spanish-service.js:260-273](../domain/spanish/spanish-service.js#L260-L273) — `ENTITY_ALIASES` (12 hand-crafted entries).
- [domain/spanish/spanish-service.js:275-290](../domain/spanish/spanish-service.js#L275-L290) — `PREDICATE_RELATION_PATTERNS` (14 hand-crafted regexes).
- [domain/spanish/spanish-service.js:292-onwards](../domain/spanish/spanish-service.js#L292) — `COMPLETE_SENTENCE_MARKERS`.

Adding one alias or one verb requires editing the orchestrator. The duplication risk is that the same word lives implicitly in multiple regexes and in the alias map — a true rename misses sites silently.

### 4.7 `spanish-service.js` is still 841 lines / mixes 5 responsibilities

Same as [AUDITORY-4](AUDITORY-4.md). Not duplication, but it forces local copies of helpers (`normalizeOptionalText` in §1.3, `normalizeProposal`, `normalizeSentence`, `normalizeEntityName`, `normalizeForMatching`, `normalizeLanguageAlerts`) inside the same file that won't be shared anywhere else until the file is split.

### 4.8 `datasets-service.js` is 1103 lines / 34 functions

[wc -l](../services/datasets-service.js): 1103. The file holds the entire dataset use case set plus 10+ private normalisers (§1.1-1.5, 1.8, 1.9, 1.10, 1.11) and the `requireDatasetAdminPermissionFactory` indirection (§2.7). Same SRP violation as `spanish-service`. Splitting into `datasets-service`, `datasets-permissions-service`, `datasets-section-service` would let §1.3 / §1.4 helpers move into `utils/validators.js` rather than living three times in three sub-services.

### 4.9 Alias-soup contracts (still present)

Same DRY anti-pattern as [AUDITORY-4 §1.1 contracts row](AUDITORY-4.md) — keeping for the record because it's the *source* of the duplicate normalizers in §1: every mapper accepts ~8 aliases per field (`id`/`datasetId`, `englishSentences`/`sourceSentences`, `permissions.annotator`/`permissions.isAnnotator`/`isAdmin`/`canAdmin`/`owner`/`isOwned`, ...). Each alias spawns a `?? ` chain that must be repeated in every consumer ([dto-mappers.js:51-74](../contracts/dto-mappers.js#L51-L74), [datasets-service.js:939-970](../services/datasets-service.js#L939-L970), [spanish-service.js:805-823](../domain/spanish/spanish-service.js#L805-L823) all repeat variants of the same fan-in). Until the contracts are locked, the normalize-helper count will keep growing.

### 4.10 Outdated dependencies in `package.json`

`@types/mocha` declared in devDeps but no `.d.ts` consumption (knip §4 finding). `dotenv/config` imported by `prisma.config.ts` but `dotenv` not listed (unlisted dependency). These are configuration smells, not source smells, but they will surface in any `npm ci --include=dev` audit.

---

## 5. Summary

| Finding type | Count | Critical |
|---|---|---|
| Byte-identical function duplicates | 2 (§1.1, §1.3 *Optional*) | Yes |
| Cross-module logical duplicates | 8 (§1.2, §1.3 *Required*, §1.4–§1.11) | Yes |
| Dead production exports | 4 (§2.1, §2.2, §2.3, §2.4) | §2.1 yes (whole endpoint), rest minor |
| Dead/empty modules | 1 (§2.5 typedefs) | No |
| Dead indirection | 1 (§2.7) | No |
| Knip false positives (tests via `proxyquire`) | 1 cluster, 20 symbols (§2.8) | No, but coupling smell §4.5 |
| Unused imports | 0 | — |
| Smells (duck-typing, hardcoded data, long files, double-mapping) | 8 (§4.1–§4.9) | §4.1 and §4.3 are wiring-correctness, rest are maintainability |
| Package-manifest issues | 2 (§4.10) | No |

**Minimal high-impact mitigation set** (would close ≈70% of the duplicate-code volume with low risk):

1. Move `normalizeOptionalString`, `normalizeRequiredString`, `normalizeBoolean`, `normalizeEmail`, `toNonNegativeInteger` into `utils/validators.js`; import from there in every caller listed in §1.2–§1.6.
2. Delete `services/datasets-service.normalizePositiveCount` (§1.1) and `controllers/datasets-controller.listDatasets` (§2.1).
3. Promote `DEFAULT_COLOR_CLASS` to `constants/datasets.js` (§1.10) and `REGISTER_CODE_PATTERN` to `constants/` (§1.6).
4. Add `ServiceError.datasetNotFound()` / `.emailTaken()` factories (§1.11).
5. Drop the re-exports flagged in §2.2, §2.3, §2.4 from their respective `module.exports`.

Steps 1–5 are pure refactors — same tests pass unchanged.

The structural smells (§4.5 test seams, §4.6 hardcoded NLP data, §4.7–4.8 long files, §4.9 alias soup) require contract decisions and are not safe to bundle into the same mitigation PR.
