# TECHNICAL DESIGN

## 1. Document purpose

This document captures the technical design of `lanbench`: data model, keys, constraints and internal procedures. It complements [USER-STORIES.md](USER-STORIES.md), which describes functionality. The rule applied is:

- **What** the system does and for **whom**: USER-STORIES.md.
- **How** it is implemented internally (tables, keys, algorithms): this document.

The canonical source of truth for the data model is [prisma/schema.prisma](../prisma/schema.prisma). This document mirrors that schema and adds the procedural logic that surrounds it (active sessions, section assignment, annotation/review flows).

## 2. Data model

### 2.1 Catalogue of entities

| Group | Models |
|---|---|
| Identity & access | `User`, `Permit` |
| Dataset structure | `Dataset`, `Section`, `Entry`, `Tripleset`, `Triple`, `Lex`, `DbpediaLink`, `Link` |
| Work orchestration | `SectionAssignment`, `ActiveSession` |
| Annotation | `Annotation`, `AnnotationAlertDecision` |
| Review | `EvaluationCriterion`, `Review`, `ReviewDecision`, `ReviewComment` |
| AI credentials | `DatasetLlmCredential` |

All table names in the database use `snake_case` (e.g. `section_assignments`); model names in this document follow the Prisma PascalCase form.

### 2.2 Identity and access

#### Two-tier role model

`lanbench` distinguishes two independent role concepts:

1. **Server roles** — global capability across the whole application. Stored as the boolean `isModerator` on `User`. There are exactly two server roles: `normal` (`isModerator = false`) and `moderator` (`isModerator = true`).
2. **Dataset roles** — per-dataset capability held by a specific user on a specific dataset. Stored as the boolean flags on `Permit` (`isOwned`, `isAnnotator`, `isReviewer`, `isAdmin`).

A user's effective capability on any screen is the *combination* of their server role and the dataset role that applies to the resource being acted on. The two dimensions never collapse into a single role string. A user with `isModerator = true` does **not** automatically gain any dataset role: they still need an entry in `Permit` to act on a specific dataset. Server-level moderator-only actions (e.g. listing all datasets in the admin API, creating datasets, managing evaluation criteria) do not require a `Permit` entry.

#### User

```
User {
    id          INT          [PK, AUTOINCREMENT]
    email       VARCHAR(255) [UNIQUE]
    password    VARCHAR(255)
    isModerator BOOLEAN      [DEFAULT false, MAPPED TO is_moderator]
}
```

`isModerator` is the single source of truth for server-level gating (admin API, dataset creation, evaluation criteria, etc.). The default on registration is `false` (normal user). A visitor may register directly as a moderator by supplying a valid single-use **moderator register code** (see section 5). Outside of that path, promotion is operational (DB or bootstrap script).

#### Permit

```
Permit {
    datasetId   INT     [FK -> Dataset.id]
    userId      INT     [FK -> User.id]
    isOwned     BOOLEAN [DEFAULT false]
    isAnnotator BOOLEAN [DEFAULT true]
    isReviewer  BOOLEAN [DEFAULT false]
    isAdmin     BOOLEAN [DEFAULT false]
    [PRIMARY KEY (datasetId, userId)]
}
```

Resolves the many-to-many between `User` and `Dataset`, and is the **dataset-role** layer of the two-tier model described above. The boolean flags grant capabilities on that specific dataset: ownership, annotation, review and admin actions. `onDelete: Restrict` on both FKs prevents deleting a user or a dataset while permits still exist.

#### RegisterCode

```
RegisterCode {
    code      VARCHAR(16) [PK]
    createdAt DATETIME    [DEFAULT now()]
}
```

Single-use code that lets a visitor register straight into a moderator account via `POST /register/moderator`. The code is case-sensitive `[a-zA-Z0-9]{16}`. Rows are generated offline by an operator-run CLI (`scripts/generate-register-codes.js`) and consumed (deleted) on successful registration. `createdAt` is informational; codes do not expire and are valid until consumed. See section 5 for the full flow.

### 2.3 Dataset structure

#### Dataset

```
Dataset {
    id                   INT           [PK, AUTOINCREMENT]
    name                 VARCHAR(128)
    description          VARCHAR(512)?
    totalEntries         INT
    languages            TEXT?
    colorClass           VARCHAR(64)   [DEFAULT 'dataset-purple']
    llmMode              VARCHAR(20)   [DEFAULT 'none']
    isReviewEnabled      BOOLEAN       [DEFAULT false]
    hasAdditionalReviews BOOLEAN       [DEFAULT false]
    sectionsCompleted    UNSIGNED INT  [DEFAULT 0]
    sectionsInReview     UNSIGNED INT  [DEFAULT 0]
    sectionsPending      UNSIGNED INT  [DEFAULT 0]
    sectionSize          INT           [DEFAULT 10]
    createdAt            DATETIME      [DEFAULT now()]
    updatedAt            DATETIME      [@updatedAt]
}
```

Notes:

- `totalEntries` is the number of entries belonging to this dataset.
- `description` is an **optional**, free-text caption captured on creation (US-34). Trimmed; persisted as `NULL` when empty. The 512-character cap is enforced both on the client (HTML `maxlength` + `input`/`paste` listeners that truncate any overflow) and on the server (`assertValidDatasetDescription`, which throws `400 dataset_description_too_long` when the trimmed value exceeds the limit). Surfaced in the visualization view (`/datasets/:id/view`) immediately under the dataset name; the subtitle node is hidden when `description` is `NULL`/empty.
- The raw XML payload is **not** persisted on `Dataset`. The dataset XML is reconstructed on demand from the persisted graph (`Entry` + `Tripleset` + `Triple` + `Lex` + `DbpediaLink` + `Link`) by `utils/dataset-xml.js#buildDatasetXml`. The original uploaded filename is also not stored: the download endpoints derive it as `<Dataset.name>.xml` (see section 8).
- `llmMode` selects how the LLM is used for this dataset (e.g. `none`, suggestion, validation — values defined at the application level).
- `isReviewEnabled` toggles the review workflow for this dataset; `hasAdditionalReviews` enables the **multi-round consensus review** described in §4.6 (rounds keep opening on the entry until two consecutive reviewers agree). `llmMode`, `isReviewEnabled` and `hasAdditionalReviews` are **coupled by two creation invariants** (US-19): R1 — `isReviewEnabled = false ⇒ hasAdditionalReviews = false`; R2 — `llmMode = 'correction' ⇒ isReviewEnabled = true ∧ hasAdditionalReviews = true`. They are enforced in the *Nuevo dataset* UI and **defensively normalised** server-side in `normalizeDatasetCreationOptions` (policy: normalise, never reject), so a crafted request cannot persist an illegal combination. The flag is **fixed at creation** and read by `reviews-service.finalizeReview` to decide between single-round termination and the consensus loop.
- `sectionsCompleted`, `sectionsInReview`, `sectionsPending` are **persisted progress counters** maintained by the application; they are not derived on the fly.
- `sectionSize` is the **declarative, per-dataset section size** (number of entries per work block), chosen at creation time on the *Nuevo dataset* form and defaulting to `10`. Every partitioning/progress computation resolves it through `constants/datasets.js#resolveSectionSize(datasetRow)`, which falls back to `10` for legacy rows (or any non-positive value). It replaces the former global `SECTION_SIZE` constant as the source of truth for `ceil(totalEntries / sectionSize)`, section windows (`[(n-1)·size, n·size)`) and entry-based progress.

#### Section

```
Section {
    id        INT [PK]
    datasetId INT [FK -> Dataset.id, onDelete: Restrict, onUpdate: Cascade]
    block     INT
}
```

Each section belongs to exactly one dataset. `block` represents the block index within the dataset.

#### Entry

```
Entry {
    id        UNSIGNED INT      [PK, AUTOINCREMENT]
    datasetId INT               [FK -> Dataset.id, onDelete: Cascade, onUpdate: Cascade]
    eid       UNSIGNED INT
    category  VARCHAR(100)
    shape     VARCHAR(50)?
    shapeType VARCHAR(50)?
    size      UNSIGNED TINYINT
    position  UNSIGNED INT      [DEFAULT 0]
    status    VARCHAR(20)       [DEFAULT 'pending']
    [UNIQUE (datasetId, eid)]
    [UNIQUE (datasetId, position)]
}
```

Notes:

- `id` is the internal surrogate primary key.
- `eid` is the entry identifier from the WebNLG source; it is unique only within a dataset.
- `position` defines the entry's stable order inside the dataset and is unique per dataset.
- `status` tracks the entry's lifecycle (e.g. `pending`, in progress, annotated, reviewed — values defined at the application level).
- Deleting a `Dataset` cascades to its entries.

#### Tripleset

```
Tripleset {
    id       UNSIGNED INT          [PK, AUTOINCREMENT]
    entryId  UNSIGNED INT          [FK -> Entry.id, onDelete: Cascade]
    type     ENUM('original','modified')
    position UNSIGNED INT          [DEFAULT 0]
    [UNIQUE (entryId, type, position)]
}
```

An entry can have several triplesets of each `type`. `position` orders triplesets of the same `(entry, type)`.

#### Triple

```
Triple {
    id          UNSIGNED INT [PK, AUTOINCREMENT]
    triplesetId UNSIGNED INT [FK -> Tripleset.id, onDelete: Cascade]
    position    UNSIGNED INT [DEFAULT 0]
    subject     VARCHAR(500)
    predicate   VARCHAR(500)
    object      VARCHAR(500)
    [UNIQUE (triplesetId, position)]
}
```

`position` orders the triples inside a tripleset.

#### Lex

```
Lex {
    id       UNSIGNED INT [PK, AUTOINCREMENT]
    entryId  UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    lid      VARCHAR(20)
    lang     CHAR(5)
    comment  VARCHAR(500)?
    text     TEXT
    position UNSIGNED INT [DEFAULT 0]
    [UNIQUE (entryId, lid, lang)]
}
```

Stores reference sentences (lexicalizations). `lid` groups translations of the same base sentence; `lang` is the ISO language code; `position` orders the lexes of an entry.

#### DbpediaLink / Link

```
DbpediaLink {
    id        UNSIGNED INT [PK, AUTOINCREMENT]
    entryId   UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    direction VARCHAR(20)
    subject   VARCHAR(500)
    predicate VARCHAR(100)
    object    VARCHAR(500)
    position  UNSIGNED INT [DEFAULT 0]
    [UNIQUE (entryId, position)]
}

Link {
    id        UNSIGNED INT [PK, AUTOINCREMENT]
    entryId   UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    direction VARCHAR(20)
    subject   VARCHAR(500)
    predicate VARCHAR(100)
    object    VARCHAR(500)
    position  UNSIGNED INT [DEFAULT 0]
    [UNIQUE (entryId, position)]
}
```

`DbpediaLink` stores `sameAs` links between language versions of DBpedia entities. `Link` has the same structure but covers entities that are not in DBpedia. `direction` encodes the link sense (e.g. `"en2ru"`).

### 2.4 Work orchestration

#### SectionAssignment

```
SectionAssignment {
    id               INT          [PK, AUTOINCREMENT]
    userId           INT          [FK -> User.id, onDelete: Cascade]
    datasetId        INT          [FK -> Dataset.id, onDelete: Cascade]
    sectionIndex     INT
    assignedAt       DATETIME     [DEFAULT now()]
    expiresAt        DATETIME
    status           VARCHAR(20)  [DEFAULT 'active']
    timeSpentSeconds UNSIGNED INT [DEFAULT 0]
    [INDEX (datasetId, sectionIndex, status)]
}
```

Notes:

- The primary key is the surrogate `id`, **not** `(datasetId, sectionIndex)`. A section can therefore have several historical assignments; only one is `status='active'` at a time.
- `expiresAt` enables time-bounded assignments that can be reclaimed if not completed. The default duration is **2 hours** (`DEFAULT_ASSIGNMENT_DURATION_MS = 2 * 60 * 60 * 1000` in `services/section-assignment-service.js`); injectable per service instance via `assignmentDurationMs`.
- `timeSpentSeconds` accumulates work time per assignment.
- `status` lifecycle is managed at the application level (typical values: `active`, completed, expired, abandoned).
- Uniqueness of the active assignment of a `(datasetId, sectionIndex)` pair is enforced by the application, not by the database.

#### ActiveSession

```
ActiveSession {
    datasetId     INT         [FK -> Dataset.id, onDelete: Cascade]
    userId        INT         [FK -> User.id, onDelete: Cascade]
    mode          VARCHAR(20)
    sectionNumber INT
    entryNumber   INT
    [PRIMARY KEY (datasetId, userId, mode)]
}
```

Notes:

- `mode` distinguishes `annotation` from `revision` (string, not enum at the DB level — validated at the application level).
- The composite PK guarantees that a single user cannot hold more than one open session on the same dataset in the same mode.
- `sectionNumber` must be ≤ `ceil(totalEntries / Dataset.sectionSize)` for the dataset; `entryNumber` must be ≤ `totalEntries`. These ranges are enforced at the application level.

### 2.5 Annotation

#### Annotation

```
Annotation {
    entryId            UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    datasetId          INT
    userId             INT          [FK -> User.id, onDelete: Cascade]
    sentenceIndex      UNSIGNED INT [DEFAULT 0]
    sentence           TEXT
    rejectionReason    TEXT?
    origin             VARCHAR(20)  [DEFAULT 'manual']
    isAcceptedFirstTry BOOLEAN      [DEFAULT true]
    createdAt          DATETIME     [DEFAULT now()]
    updatedAt          DATETIME     [@updatedAt]
    [PRIMARY KEY (entryId, datasetId, sentenceIndex)]
}
```

Notes:

- The composite PK is `(entryId, datasetId, sentenceIndex)` (see `prisma/schema.prisma`), i.e. **one row per sentence** of an entry. **`userId` is deliberately not part of the key**, so the model supports **only one annotator per entry**: a second annotator saving the same `(entry, sentenceIndex)` would collide. This is a known tension with the multi-annotator assumptions elsewhere (`Permit.isAnnotator`, the review queue's `annotations: { none: { userId } }` filter) — tracked in `PROBLEMS.md §5`. If parallel annotators per entry are ever required, `userId` must enter the key and the review queue must choose whose annotation to surface.
- `origin` records how the sentence was produced (`manual`, generated, edited, etc.).
- `isAcceptedFirstTry` flags whether the annotation was accepted by the system without further corrections.
- `rejectionReason` stores the justification when the annotator overrides automatic alerts.

#### AnnotationAlertDecision

```
AnnotationAlertDecision {
    id              INT          [PK, AUTOINCREMENT]
    entryId         UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    userId          INT          [FK -> User.id, onDelete: Cascade]
    sentenceIndex   UNSIGNED INT
    alertCode       VARCHAR(100)
    alertType       VARCHAR(50)
    decision        VARCHAR(20)
    reason          TEXT?
    suggestion      TEXT?
    appliedSentence TEXT?
    createdAt       DATETIME     [DEFAULT now()]
}
```

Each row records what the annotator did with a specific alert: applied the suggestion, edited manually, dismissed it with a justification, etc. `alertType` classifies the alert (orthographic, grammatical, semantic) and `alertCode` identifies the specific rule. This table is the persistence layer behind the alert flow described in `US-08`.

### 2.6 Review

#### EvaluationCriterion

```
EvaluationCriterion {
    id          INT          [PK, AUTOINCREMENT]
    key         VARCHAR(64)  [UNIQUE]
    label       VARCHAR(160)
    description TEXT?
    sortOrder   INT          [DEFAULT 0]
    isActive    BOOLEAN      [DEFAULT true]
    version     INT          [DEFAULT 1]
    createdAt   DATETIME     [DEFAULT now()]
    updatedAt   DATETIME     [@updatedAt]
}
```

Defines the criteria that drive reviewer evaluation (`US-13`, `US-24`). `sortOrder` controls the sequential order in which criteria are presented; `isActive` toggles availability; `version` allows the catalogue of criteria to evolve without losing historical traceability.

#### Review

```
Review {
    id                    INT          [PK, AUTOINCREMENT]
    entryId               UNSIGNED INT [FK -> Entry.id, onDelete: Cascade]
    reviewerId            INT          [FK -> User.id, onDelete: Cascade]
    annotatorId           INT          [FK -> User.id, onDelete: Cascade]
    status                VARCHAR(20)  [DEFAULT 'pending']
    currentCriterionIndex INT          [DEFAULT 0]
    roundIndex            INT          [DEFAULT 0]
    cleanRound            BOOLEAN      [DEFAULT false]
    assignedAt            DATETIME     [DEFAULT now()]
    expiresAt             DATETIME
    timeSpentSeconds      UNSIGNED INT [DEFAULT 0]
    completedAt           DATETIME?
}
```

Represents a single review pass on an entry: the reviewer (`reviewerId`) evaluates the work of the annotator (`annotatorId`). The per-phrase wizard order is enforced from the decisions themselves (see §4.2), so `currentCriterionIndex` is retained as a legacy column but no longer drives the flow. `expiresAt` follows the same exclusive-assignment pattern as `SectionAssignment`: the default review window is **2 hours** (`DEFAULT_REVIEW_DURATION_MS` in `services/reviews-service.js`); `reviews-service.requestNextReview` calls `expireStaleReviews(new Date())` before searching for candidates, so abandoned reviews recycle automatically.

`roundIndex` and `cleanRound` support the multi-round consensus flow (§4.6). `roundIndex` is `0` for the first review opened on an entry, `1` for the second, etc. — assigned by `reviews-repository.createReview` as `max(roundIndex of prior reviews on the entry) + 1`. `cleanRound` is written by `finalizeReview` at closure: `true` iff every per-phrase and review-level decision is `accepted` **and** no `ReviewComment` row was added during the round (no text corrections). With `Dataset.hasAdditionalReviews = true`, two consecutive `cleanRound = true` reviews terminate the chain.

#### ReviewDecision

```
ReviewDecision {
    id            INT          [PK, AUTOINCREMENT]
    reviewId      INT          [FK -> Review.id, onDelete: Cascade]
    sentenceIndex INT?         [NULL = review-level criterion]
    criterionCode VARCHAR(100)
    decision      VARCHAR(20)
    comment       TEXT?
    decidedAt     DATETIME     [DEFAULT now()]
    [UNIQUE (reviewId, sentenceIndex, criterionCode)]
}
```

One row per `(phrase, criterion)` evaluated within a review. `sentenceIndex` is the annotated sentence the decision belongs to; it is `NULL` for the **review-level** criterion (`diversity`), which is decided once per entry. The two criteria families are defined in `constants/review-criterion.js` (`PHRASE_CRITERIA` — `naturalness`, `fluency`, `adequacy`, `completeness`, `coverage` — and `REVIEW_CRITERIA` — `diversity`). Because MariaDB treats NULLs as distinct in a UNIQUE index, the uniqueness of a review-level decision is enforced in `reviews-repository.upsertDecision` (find-then-write), not by the constraint alone.

#### ReviewComment

```
ReviewComment {
    id                 INT          [PK, AUTOINCREMENT]
    reviewId           INT          [FK -> Review.id, onDelete: Cascade]
    sentenceIndex      UNSIGNED INT
    originalSentence   TEXT?
    correctedSentence  TEXT
    comment            TEXT
    isAcceptedFirstTry BOOLEAN      [DEFAULT true]
    createdAt          DATETIME     [DEFAULT now()]
}
```

When the reviewer corrects a sentence, the original text, the corrected text and the justification comment are persisted. This is the persistence layer behind the rule "the correction comment is used both for re-correction and for feedback to the annotator" from `US-13`.

### 2.7 Relationships overview

- A `Dataset` has many `Section`, `Entry`, `Permit`, `SectionAssignment` and `ActiveSession`.
- A `User` has many `Permit`, `SectionAssignment`, `ActiveSession`, `Annotation`, `AnnotationAlertDecision`, and participates in `Review` either as `reviewer` or as `annotator`.
- An `Entry` has many `Tripleset`, `Lex`, `DbpediaLink`, `Link`, `Annotation`, `AnnotationAlertDecision` and `Review`.
- A `Tripleset` has many `Triple`.
- A `Review` has many `ReviewDecision` and `ReviewComment`.

### 2.8 Cascade behaviour summary

- Deleting an `Entry` cascades to `Tripleset`, `Triple` (through `Tripleset`), `Lex`, `DbpediaLink`, `Link`, `Annotation`, `AnnotationAlertDecision` and `Review` (and through `Review`, to `ReviewDecision` and `ReviewComment`).
- Deleting a `Dataset` cascades to its `Entry` (and transitively to all dependents above), to `ActiveSession` and to `SectionAssignment`.
- Deleting a `User` cascades to `ActiveSession`, `SectionAssignment`, `Annotation`, `AnnotationAlertDecision` and `Review` rows associated with that user.
- `Permit` and `Section` use `onDelete: Restrict`, so they block deletion of the referenced `User` or `Dataset` until they are removed first.

## 3. Section and active-session logic

This section details the internal implementation of the flow described functionally in `US-04` of [USER-STORIES.md](USER-STORIES.md#us-04).

### 3.1 Section partitioning

- A section generally groups 10 entries.
- A dataset is divided into `ceil(totalEntries / 10)` sections (ceiling integer division).
- When `totalEntries` is a multiple of 10, every section has exactly 10 entries; otherwise the last section contains the remainder.

### 3.2 Resolving "continue" on a dataset

When the user clicks "continue", the server decides the outcome following this procedure, aligned with the functional cases `Caso 0..Caso 5` of `US-04`:

1. If `Dataset.totalEntries == 0`, return the empty-dataset notice.
2. If the dataset is fully annotated and fully reviewed (derived from `sectionsCompleted` vs total sections and from review counters), return the complete-dataset notice.
3. If the dataset is fully annotated but not fully reviewed, return the corresponding notice.
4. Look up the row `(datasetId, userId, mode='annotation')` in `ActiveSession`:
   - If it exists, return the entry identified by `(datasetId, entryNumber)` together with `sectionNumber` and `entryNumber`.
5. If no active session exists, check whether every non-annotated section is held by an `active` `SectionAssignment` belonging to another user:
   - If all are assigned, return the corresponding notice.
6. If there are still unassigned sections, run the section assignment algorithm (section 3.4) and return the first entry of the new section.

### 3.3 "Send" button behaviour

- If the current entry is not the last one in the active section, advance `entryNumber` in `ActiveSession` and return the next entry.
- If the current entry is the last one in the section:
  - Mark the corresponding `SectionAssignment` as completed (status transition managed at the application level) and accumulate `timeSpentSeconds`.
  - Delete the corresponding row in `ActiveSession`.
  - Return the session-closed event with two options: `Exit` (redirects to `/datasets`) and `Continue` (creates a new `ActiveSession` row for the next available section).
  - The `Continue` option is omitted when no further sections are available.

### 3.4 Section assignment algorithm

When a user without an active session requests "continue" and unassigned sections exist:

1. In `SectionAssignment`, find the highest `sectionIndex` for the given `datasetId` among rows with `status='active'` or `status='completed'`.
2. Compute `nextIndex = sectionIndex + 1` (or `0` if no prior assignment exists for this dataset).
3. Compute `firstEntryOfNextSection = nextIndex * 10`.
4. If `firstEntryOfNextSection < Dataset.totalEntries`, insert a new row in `SectionAssignment` with `(datasetId, userId, sectionIndex=nextIndex, status='active', assignedAt=now(), expiresAt=...)` and create the matching row in `ActiveSession` pointing to the first entry of that section.
5. Otherwise, every section is already assigned: return the corresponding error message.

The application is responsible for keeping at most one `status='active'` row per `(datasetId, sectionIndex)` and for recycling expired assignments (using `expiresAt`).

### 3.5 Progress counters

`Dataset.sectionsCompleted`, `sectionsInReview` and `sectionsPending` are maintained transactionally by the application whenever:

- a new section assignment is created (`sectionsPending` decreases by 1 when the section moves from unassigned to assigned, depending on the chosen accounting),
- a section is completed by the annotator (`sectionsCompleted` increases),
- a section enters or leaves the review workflow (`sectionsInReview` updates accordingly).

The invariant is `sectionsPending + sectionsInReview + sectionsCompleted == ceil(totalEntries / 10)` for the dataset at rest.

## 4. Annotation and review flows

### 4.1 Annotation flow (supports US-05..US-10)

1. When the annotator opens an entry, the server returns the entry, its triplesets, lexes and any existing `Annotation` for that `(entryId, datasetId)`.
2. The annotator submits one or more sentences. The server replaces the user's `Annotation` rows for the entry (one row per `sentenceIndex`) inside a transaction; the same transaction moves `Entry.status` to `annotated` (or back to `pending` if every sentence is cleared). This is the single production path that makes an entry eligible for the review queue (`repositories/annotations-repository.js#replaceForAccessibleEntry`).
3. Automatic alerts are computed (rules + LLM in the mode set by `Dataset.llmMode`). For each alert the annotator interacts with, an `AnnotationAlertDecision` row records `alertType`, `alertCode`, the `decision` taken (e.g. applied, dismissed), the optional `suggestion` and `appliedSentence`, and the `reason` if the alert was dismissed.
4. `Annotation.isAcceptedFirstTry` is set to `false` if the annotator had to override or rework any alert; otherwise it stays `true`.

#### 4.1.1 `POST /api/annotations/send` request shape

Each sentence travels alongside its optional rejection reason in a single object to remove the positional-pairing risk that two parallel arrays would carry (AUDIT-2 §22). The wire format is:

```json
{
    "datasetId": 1,
    "rdfId": 7,
    "sentences": [
        { "sentence": "First sentence.", "rejectionReason": null },
        { "sentence": "Second sentence.", "rejectionReason": "Demasiado literal" }
    ],
    "sectionNumber": 2,
    "isLastEntry": false
}
```

- `sentences[i].sentence` is the literal text persisted into `Annotation.sentence`.
- `sentences[i].rejectionReason` is the justification persisted into `Annotation.rejectionReason` when the annotator overrode automatic alerts; omit, set to `null`, or send an empty string when none applies.
- `sectionNumber` and `isLastEntry` are optional and trigger section-finalisation bookkeeping when present.

### 4.2 Review flow (supports US-13)

1. A `Review` row is created when an annotated entry enters the review workflow (`Dataset.isReviewEnabled = true`). The row references the entry, the original annotator and the assigned reviewer.
2. **Reviewer eligibility:** `reviews-repository.findReviewableEntries` returns only entries with `status = 'annotated'` belonging to a dataset with `isReviewEnabled = true`, excluding every entry whose `annotations.userId` matches the requesting `reviewerId` (anti-self-review at the SQL level, `annotations: { none: { userId: reviewerId } }`) and every entry that already has a blocking review. No reviewer can ever be served their own annotation, regardless of `isModerator` status. The `isReviewEnabled` predicate is mirrored in `datasets-repository.findReviewableEntryDatasetIds`, which powers the dataset card's "review available" affordance. This `reviewableCount` is now computed for **both** the dataset-list and the single-dataset endpoints (`datasets-service.getAccessibleDatasetItem`), so a freshly completed, reviewable section surfaces the Revisión button consistently however the card is loaded (P5). The reviewer page entry point (`POST /api/reviews/request` via the "Solicitar siguiente revisión" button) cleanly reports `no_review_available` when the queue is empty.
3. The reviewer evaluates **each annotated phrase independently** against the five per-phrase criteria, plus the single review-level criterion (`diversity`) decided once for the entry. `GET /api/reviews/:reviewId` returns the `phraseCriteria` and `reviewCriteria` catalogues, the annotator's `annotations`, the entry `triples` / `englishSentences` / `alertDecisions`, and the flat `reviewDecisions` list (each carrying its `sentenceIndex`, `null` for the review-level one). Decisions are posted to `POST /api/reviews/:reviewId/decisions` with `{ sentenceIndex, criterionCode, decision, comment }`, where `sentenceIndex: null` targets the review-level criterion.
4. **Per-phrase wizard guard:** within a phrase the criteria are sequential. `reviews-service.submitDecision` reads the existing `ReviewDecision` rows for that `sentenceIndex` and, if any criterion earlier than the requested one is still undecided, rejects with `ServiceError(status: 409, code: 'criterion_locked')`. Re-deciding an already-resolved criterion is allowed: `upsertDecision` overwrites the row keyed by `(reviewId, sentenceIndex, criterionCode)`.
5. **Comment-required rule:** `decisionRequiresComment(decision)` (in `constants/review-decision.js`) returns `true` for `rejected` and `needs_fix`. Submitting such a decision with an empty `comment` is rejected with `code: 'comment_required'`. `submitTextCorrection` rejects an empty `correctedSentence` with `code: 'invalid_correction'`; the correction's own `comment` is **optional** (the justification lives in the rejected criterion's Motivo).
6. If the reviewer corrects a sentence, a `ReviewComment` row stores the original sentence and the corrected sentence (and the optional comment). The corrected text is what is surfaced to the annotator as feedback alongside the failed criteria.
7. **Finalization:** `reviews-service.finalizeReview` reads the annotator's annotated `sentenceIndex` set (`reviews-repository.findAnnotatedSentenceIndexes`) and requires that every phrase have all five per-phrase criteria decided and — only when the entry has more than one phrase — the review-level `diversity` decided (`code: 'criteria_incomplete'` otherwise). Within a single `prisma.$transaction` it sets `Review.status` to `completed` (all `accepted`) or `disputed` (any non-`accepted`), updates `Entry.status` to `reviewed` or `disputed` accordingly, and — for disputed cases — flips `Annotation.isAcceptedFirstTry` to `false` for every annotation of the same `(entryId, annotatorId)`. The reviewer page finalizes automatically once the last criterion is decided; `POST /api/reviews/:reviewId/release` returns an in-progress review to the queue.
8. `Dataset.hasAdditionalReviews` controls whether further review rounds can be opened on the same entry. The single-round case (`hasAdditionalReviews = false`) is the path described above. The multi-round consensus case (`hasAdditionalReviews = true`) — termination rule, eligible-reviewer selection, annotation mutation between rounds — is detailed in §4.6.

### 4.3 Configurable criteria (supports US-24)

`EvaluationCriterion` is the catalogue consumed by the review UI:

- `sortOrder` defines the sequential order.
- `isActive` filters which criteria are presented in the current review workflow.
- `version` allows criteria definitions to evolve while preserving the historical `criterionCode` values stored in `ReviewDecision`.

The shipped reviewer evaluates the **fixed** criteria families in `constants/review-criterion.js` (§4.2); `EvaluationCriterion` is the persisted, admin-manageable catalogue that US-24 will drive the criteria from once configurability is wired in.

### 4.4 Annotator feedback API (supports US-12)

`GET /api/reviews/feedback` is the single surface through which an annotator consults reviewer feedback on their own work.

- The annotator identifier is derived in the controller via `resolveSessionUserId(request)` and passed to the service as `annotatorId`. Any `annotatorId` field supplied via query string or body is **ignored**. This is the only enforcement preventing one annotator from reading another's feedback — there is no authorization check at the router level beyond `requireApiAuth`.
- Accepted parameters: `datasetId` (optional positive integer to scope, defaults to all datasets) and `limit` (defaults to 50).
- The repository call `findCompletedReviewsForAnnotator` filters by `annotatorId` and by terminal review status. In-flight reviews (`pending`, `in_progress`, `released`, `expired`) are not surfaced.
- The response shape per review includes `failedCriteria` (decisions whose `decision !== 'accepted'`, with their comment) and `corrections` (list of `ReviewComment` rows, with original / corrected / justification text).

### 4.5 Review-request authorization

`routes/reviews-api.js` exposes `POST /api/reviews/request` behind `requireApiAuth` plus the local middleware `requireReviewRequestAccess`:

- If `request.user.isModerator === true` → access granted unconditionally (moderator can pull from the global review queue).
- Else, the request must carry a positive `datasetId` (body or query). With the dataset scope, `reviews-service.requestNextReview` calls `requireDatasetReviewerPermission`, which checks `Permit.isReviewer = true` for `(datasetId, userId)`. Without `isReviewer`, the service rejects with `code: 'dataset_reviewer_required'` (`403`).
- A logged-in user with neither `isModerator` nor a `datasetId` in the request is rejected at the router with `403 { ok: false, code: 'forbidden' }`.

The rest of the review surface (`GET /api/reviews/:reviewId`, decisions, corrections, finalize, release) relies on the per-review ownership check performed by `reviews-service.loadOwnedReview`: any operation on a `reviewId` that does not belong to the calling reviewer returns `code: 'review_not_assigned'` (`403`).

### 4.6 Multi-round consensus reviews (`Dataset.hasAdditionalReviews`)

When `Dataset.hasAdditionalReviews = true` the review on a given entry does not finalize after the first reviewer closes it. Instead, the entry keeps re-entering the review queue until **two consecutive reviewers leave it unchanged** — i.e. until two consecutive rounds end with all decisions `accepted` and no text correction submitted. This is the case that matters for the `generation` / `correction` LLM modes (where the first version is machine-produced and a single human pass is not enough evidence that it is correct).

#### 4.6.1 Definitions

- **Round.** A `Review` row over an entry, identified by `Review.roundIndex` (0 for the first review opened, 1 for the second, etc.). `reviews-repository.createReview` assigns `roundIndex = max(prior Review.roundIndex on the entry) + 1` inside the same transaction as the row creation.
- **Clean round.** A terminal review whose decisions are all `accepted` **and** that produced **no `ReviewComment` rows** (no text correction). Computed inside `finalizeReview` from the in-memory decisions/comments accumulator and persisted as `Review.cleanRound = true`. A round with at least one non-accepted decision or one comment is **non-clean** (`cleanRound = false`).
- **Chain.** The ordered sequence of terminal reviews on an entry, sorted by `roundIndex`. A chain is **terminated** once it reaches one of the two end states below.

#### 4.6.2 Termination rule

`reviews-service.finalizeReview` computes `isCleanRound` for the closing review and reads the previous terminal review of the same entry (`reviews-repository.findPreviousTerminalReview({ entryId, beforeRoundIndex })`):

| `hasAdditionalReviews` | This round    | Previous round       | Outcome                                                            |
| ---                    | ---           | ---                  | ---                                                                |
| `false`                | any           | any                  | Single-round case: `Entry.status` → `reviewed` / `disputed` (§4.2). |
| `true`                 | non-clean     | any                  | `Entry.status` → `annotated` (re-queueable). `Review.status` → `disputed`. |
| `true`                 | clean         | none or non-clean    | `Entry.status` → `annotated` (re-queueable). `Review.status` → `completed`. The chain is not yet terminated; it just registered its first clean round. |
| `true`                 | clean         | clean                | **Two-clean termination.** `Entry.status` → `reviewed`. `Review.status` → `completed`. |

The closing transaction also writes `Review.status`, `Review.completedAt`, `Review.cleanRound`, `Review.timeSpentSeconds` and (only on non-clean) `Annotation.isAcceptedFirstTry = false` for the original annotator's rows — exactly as the single-round path already does.

#### 4.6.3 Annotation mutation between rounds

For round N+1 to be meaningful the next reviewer must see the corrected sentences, not the original ones. On a **non-clean** terminal review the finalize transaction also runs, inside the same `prisma.$transaction`:

- For every `ReviewComment` of the closing review (each carrying `sentenceIndex` and `correctedSentence`), update `Annotation.sentence` to the corrected text for the row `(entryId, annotatorId, sentenceIndex)`. The `Annotation` PK is `(entryId, datasetId, sentenceIndex)`, so the update is deterministic.
- `ReviewComment.originalSentence` keeps the **pre-correction** text of that round, so the chain is reconstructible from the `ReviewComment` history.

Net effect: the canonical "what the annotator wrote" mutates into "the current best version of the sentence". The authorship history lives in the `ReviewComment` chain and in `Review.completedAt`/`roundIndex` (oldest first = original annotator text → corrected by round 0 → corrected by round 1 → ...).

#### 4.6.4 Eligible-reviewer selection

`reviews-repository.findReviewableEntries` is extended for the multi-round case:

- The entry-blocking predicate keeps excluding entries with an **active** review (`pending`, `in_progress`). It **no longer** excludes entries whose latest terminal review is `completed`/`disputed` if `hasAdditionalReviews = true` and the chain is not terminated (i.e. the entry status is still `annotated`).
- The reviewer of the most recent terminal review on the entry is excluded (anti-immediate-repeat — the same reviewer cannot validate their own previous round). Earlier-round reviewers stay eligible so small reviewer pools do not stall.
- The annotator exclusion (`annotations: { none: { userId: reviewerId } }`) is preserved.

Concretely, `findReviewableEntries` joins on the entry's last terminal review (`orderBy: { roundIndex: 'desc' }, take: 1`) and adds `where: { reviewerId: { not: requestingReviewerId } }` to that subquery.

#### 4.6.5 No round cap

There is **no maximum-rounds safeguard** in this iteration: with two genuinely-disagreeing reviewers a chain can in principle stay open. In practice the corpus + LLM-generation setting that motivates the flow converges quickly because most non-clean rounds apply text edits that the next reviewer keeps. If indefinite cycling becomes a concrete problem, a `Dataset.maxReviewRounds` column is the natural escape valve.

#### 4.6.6 Statistics surface

The number-of-rounds distribution is computed from `Review.roundIndex` grouped by `entryId`. See §10.3.

## 5. Moderator registration via single-use code

This section details the implementation of the visitor-registers-as-moderator flow described functionally in `US-27` and `US-28` of [USER-STORIES.md](USER-STORIES.md).

### 5.1 Endpoint surface

- `POST /register` — unchanged. Creates a normal user (`isModerator = false`). Any `isModerator` / `role` field sent by the client is silently ignored.
- `POST /register/moderator` — new. Same body as `/register` plus a `code` field. Validates the body the same way as `/register`, then validates `code` shape (`string`, length 16, matches `^[A-Za-z0-9]{16}$`). On failure → `400` with JSON error `{ error: 'Invalid moderator register code' }`.

### 5.2 Code consumption

The repository `repositories/register-codes-repository.js` exposes a single operation:

- `consumeCode(code)` — atomic delete-if-exists. Returns `true` when a row was removed, `false` when no matching row existed. Implemented as `prisma.registerCode.delete({ where: { code } })` inside a try/catch that treats Prisma's `P2025` ("record not found") as a `false` return. There is no separate `findByCode` step because the read-then-delete sequence would race under concurrent registrations.

### 5.3 Service flow

`services/users-service.js` exposes `registerModeratorUser({ email, password, ..., code })`:

1. Calls `registerCodesRepository.consumeCode(code)`.
2. If `false` → throws a tagged error (`error.code = 'INVALID_REGISTER_CODE'`) that the controller maps to `400`.
3. If `true` → reuses the existing user-creation path with `isModerator: true` (same hashing + uniqueness checks as `registerUser`).

The two register paths share a private helper for the hash-password-and-create-user sequence so the moderator path cannot drift from the normal path.

### 5.4 Code generation

`scripts/generate-register-codes.js` is the operator-run CLI:

1. Prompts on stdin for a positive integer `count`.
2. Generates `count` codes, each 16 characters from `[a-zA-Z0-9]`, using `crypto.randomInt` so the distribution is uniform and not predictable.
3. Inserts every generated code into `register_codes` inside a single Prisma transaction, so a mid-batch failure leaves the table untouched.
4. After commit, prints each code on its own line to stdout.
5. On any error (validation, DB), prints the error to stderr and exits non-zero without printing any partial code list.

The script imports the same Prisma client / repository module as the server; it does not open its own connection.

### 5.5 Front-end form

The public register form (`public/register.html` + `public/js/register.js`) carries a **Moderator** checkbox (default unchecked) plus a conditionally visible **Moderator Register Code** input:

- Checking the checkbox unhides the code field; unchecking hides it **and clears its value**.
- `keypress` blocks characters outside `[a-zA-Z0-9]`; `paste` intercepts the clipboard, filters to `[a-zA-Z0-9]` and truncates to 16 characters (`maxlength` alone is not reliable for all paste paths).
- On submit: unchecked → `POST /register` (existing flow). Checked + code is exactly 16 valid chars → `POST /register/moderator`. Otherwise the inline error is shown and the form does not submit.
- Backend `INVALID_REGISTER_CODE` (`400`) is surfaced as the inline code error.

AJAX helpers live in `public/js/actions/register-actions.js` following the convention that all fetch logic sits under `public/js/actions/`: `submitRegister(payload)` for `POST /register` and `submitModeratorRegister(payload)` for `POST /register/moderator`.

### 5.6 Out of scope

- Expiry / TTL on register codes. Codes are valid until consumed.
- Rate-limiting on `POST /register/moderator`. Brute-forcing a 16-char `[a-zA-Z0-9]` code has ~95 bits of entropy.
- Auditing of who consumed which code. The row is deleted on success and no link is kept between the consumed code and the resulting user.
- Promoting / demoting users from the UI.
- Versioned migrations — the DB is treated as prototype and synced via `prisma db push`. The `database/lanbench.sql` dump is a backup, not the source of truth, and is not edited by hand.

## 6. Server-role gating

Server-level capability is enforced by two middlewares in `middlewares/auth.js`:

- `requirePageModerator()` — applied to HTML pages. Resolves the session user via `User.fromSession`, returns `401`/redirect when there is no session, redirects to `/forbidden` when `user.isModerator !== true`, and otherwise attaches `request.user` and calls `next()`.
- `requireApiModerator()` — applied to JSON endpoints. Same logic but returns `403` on insufficient capability.

Both wrap the unauthenticated checks performed by `requirePageAuth` and `requireApiAuth`, which continue to gate all authenticated routes.

Routes gated by `requireApiModerator()` include `routes/admin-api.js` (entire admin API surface) and `routes/datasets-api.js` `POST /` (dataset creation). Routes that depend on per-dataset capability continue to dispatch through `Permit` rows and are independent of `isModerator`. The reviewer flow in `routes/reviews-api.js` explicitly branches on `request.user.isModerator`: moderators can request reviews unconditionally, while normal users must scope by `datasetId` so the downstream permit check applies.

Session payloads expose `isModerator: boolean` (no role string). `services/datasets-service.js` exposes the server role inside each per-dataset permission row as `globalIsModerator: Boolean(user?.isModerator)`, so admin UIs can render moderator-only affordances without a separate session call.

`constants/roles.js` is the catalogue of **dataset roles only** (`ROLE_ANNOTATOR`, `ROLE_REVIEWER`, `ROLE_ADMIN`, `ALL_ROLES`, `isValidRole`); it is consumed by per-dataset logic (permits, reviews, dataset admin) and by the front-end toolbar.

## 7. Admin API surface

`routes/admin-api.js` mounts the moderator-only API. Every route under `/api/admin/*` first passes `requireApiAuth` and then `requireApiModerator()` at the router level — no per-handler check is needed. The wiring lives in `controllers/admin-controller.js` and `services/admin-service.js`.

### 7.1 Endpoints

| Method  | Path                                          | Handler                       | Purpose                                                                                       |
| ------- | --------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`   | `/api/admin/datasets/summary`                 | `listDatasetSummaries`        | Operational summary of every dataset (counters + progress percentages).                       |
| `GET`   | `/api/admin/datasets/:id/export`              | `exportDataset`               | On-demand export of a dataset's persisted progress. Accepts `?format=json` (default) or `xml`. |
| `GET`   | `/api/admin/evaluation-criteria`              | `listEvaluationCriteria`      | List the review-criteria catalogue (`EvaluationCriterion`).                                   |
| `POST`  | `/api/admin/evaluation-criteria`              | `createEvaluationCriterion`   | Create a new criterion (`key`, `label`, `description?`, `sortOrder?`).                        |
| `PATCH` | `/api/admin/evaluation-criteria/:id`          | `updateEvaluationCriterion`   | Update label, description, order or `isActive`; `version` is auto-incremented.                |
| `GET`   | `/api/admin/users`                            | `listUsers`                   | List every user as `{ id, email, isModerator }` (US-22). Never returns the password hash.     |
| `PATCH` | `/api/admin/users/:id`                         | `updateUserRole`              | Set a user's server role (`{ isModerator: boolean }`, US-22). Strict boolean; refuses self-demotion (`409 cannot_self_demote`); unknown id → `404 user_not_found`. |

### 7.2 Dataset summary fields

`listDatasetSummaries` returns one row per dataset accessible to the moderator. Each row has the shape produced by `mapDatasetSummary` in `services/admin-service.js`:

- `datasetId`, `name`, `updatedAt`.
- `totalEntries` — total entries belonging to the dataset.
- `reservedEntries` — entries belonging to sections with an active `SectionAssignment`.
- `annotatedEntries` — entries with at least one persisted `Annotation` row. This is intentionally **not** the same as counting `Entry.status = 'annotated'`: an entry keeps its annotation rows after it moves on to `reviewed`/`disputed`, so the row-based count is the stable "has been annotated" measure even though `annotated` is now a real, written status (see USER-STORIES.md §10.2 "Lifecycle of an entry").
- `reviewedEntries` — entries whose `status = 'reviewed'`.
- `disputedEntries` — entries whose `status = 'disputed'`.
- `activeAssignments` — number of currently-active `SectionAssignment` rows on the dataset.
- `progress` — percentages computed from `Dataset.sectionsCompleted / sectionsInReview / sectionsPending` (see §3.5).

### 7.3 Export endpoint

`GET /api/admin/datasets/:id/export` reads the full dataset graph through `datasets-repository.findDatasetExportGraph` (or equivalent) and emits it via `admin-service.exportDatasetProgress`. Two formats:

- `format=json` (default) — returns the canonical export object:
  `{ exportedAt, dataset: { id, name, totalEntries, progress }, entries: [...] }`. Each entry includes `triples`, `references` (the `Lex` rows), `annotations` (with `userEmail` for traceability) and the alert decisions of the annotator.
- `format=xml` — same payload serialized through a hand-rolled emitter (`buildExportXml`); intended for downstream pipelines that consume the WebNLG-style XML directly.

An unknown `format` returns `400`. The endpoint does **not** depend on the review subsystem: if no review exists for an entry, the relevant section is simply absent, never `null` or undefined.

### 7.4 Evaluation criteria lifecycle

`EvaluationCriterion` rows are never deleted: deactivation is done by setting `isActive = false`. Every update increments `version` so historical `ReviewDecision.criterionCode` values keep their semantic anchor even when the catalogue evolves. The criteria the reviewer UI evaluates are exposed by `constants/review-criterion.js` as two families — `getPhraseCriteria()` (the five per-phrase criteria) and `getReviewCriteria()` (the review-level `diversity`) — surfaced in the review context as `phraseCriteria` and `reviewCriteria`.

### 7.5 Out of scope

- Cross-dataset analytics (rolling counts of annotators, reviewers, etc.).
- Activity monitoring of individual users (US-23 is not yet implemented).
- Admin UI for managing `Permit` rows directly.

`scripts/bootstrap-admin.js` provisions a server-level moderator: it creates a user with `isModerator: true` or sets the flag on an existing user. It does not touch the `Permit` table.

The front-end toolbar (`public/js/toolbar.js`) is the only `public/js/` file that branches on server role: it fetches `/api/session/me`, builds the moderator-only navigation entry (`/reviewer`) and renders a moderator badge iff `isModerator === true`. The `Datasets` (`/datasets`, the canonical dataset listing) and `Mis estadísticas` (`/my-stats`) links are shown to every authenticated user. The toolbar brand (`Lanbench`) is non-clickable plain text — it no longer links anywhere. All other front-end files (`annotations.js`, `datasets.js`, `reviewer.js`, `dataset-admin.js`) consume per-dataset permission DTOs and are independent of `isModerator`.

## 8. Dataset downloads from the visualization tab

This section details the implementation of the user-facing downloads described functionally in `US-29` and `US-30` of [USER-STORIES.md](USER-STORIES.md). Both endpoints live next to the existing `GET /api/datasets/:id/text` (the source of truth for the read-only viewer in `public/dataset-view.html`) and share its authorization model: `requireApiAuth` plus the per-dataset accessibility check performed by `datasets-service.getAccessibleDatasetGraph`.

### 8.1 Endpoint surface

| Method | Path                                       | Handler                            | Purpose                                                                              |
| ------ | ------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/datasets/:id/download`               | `downloadDatasetXml`               | Download the dataset XML reconstructed from the persisted graph.                     |
| `GET`  | `/api/datasets/:id/download/annotated`     | `downloadDatasetAnnotatedXml`      | Download the extended XML (original content + Spanish annotations). 100% only.       |

Both routes are mounted in `routes/datasets-api.js` under the existing `requireApiAuth` middleware, exactly as `GET /api/datasets/:id/text`. No moderator or admin gating is applied; access is granted to any `Permit` holder of the dataset.

### 8.2 Filename rule

The originally uploaded filename is **not** persisted (see section 2.3). Both download endpoints derive the filename from `Dataset.name`:

- `GET /api/datasets/:id/download` → `<Dataset.name>.xml`
- `GET /api/datasets/:id/download/annotated` → `<Dataset.name>-extended.xml`

Both responses set `Content-Type: application/xml; charset=utf-8` and `Content-Disposition: attachment; filename="<derived-name>"`.

### 8.3 Original download (`/download`)

`datasets-service.getAccessibleDatasetXmlDownload(userId, datasetId)`:

1. Loads the accessible dataset graph through `getAccessibleDatasetGraph` (same call already used by `getAccessibleDatasetText`).
2. Rejects with `ServiceError(status: 404, code: 'dataset_without_entries')` when the dataset has no persisted entries — same controlled error as `getAccessibleDatasetText`.
3. Builds the XML body with `utils/dataset-xml.js#buildDatasetXml` over the persisted entries (same builder used by `/text`).
4. Returns `{ filename: \`${dataset.name}.xml\`, body, contentType: 'application/xml; charset=utf-8' }`.

The body is identical to the response of `GET /api/datasets/:id/text` — the only difference is the response headers (download instead of inline text).

### 8.4 Extended download (`/download/annotated`)

`datasets-service.getAccessibleDatasetAnnotatedXmlDownload(userId, datasetId)`:

1. Loads the accessible dataset graph including the related `Annotation` rows for each entry (existing repository graph extended with an `annotations` include scoped to the same `datasetId`).
2. Re-verifies the **completion condition**: `Dataset.sectionsCompleted === ceil(totalEntries / Dataset.sectionSize) && Dataset.sectionsPending === 0`. Otherwise throws `ServiceError(status: 409, code: 'dataset_not_completed')`. The frontend disables the button on the same condition (read from the existing dataset DTO), but the backend re-checks it because the UI cannot be trusted to gate write/read access.
3. Rejects with `dataset_without_entries` when the dataset has no entries (same code path as `/download`).
4. Builds the extended XML with a new builder `utils/dataset-xml.js#buildAnnotatedDatasetXml` (see section 8.5).
5. Returns `{ filename: \`${dataset.name}-extended.xml\`, body, contentType: 'application/xml; charset=utf-8' }`.

### 8.5 Spanish lex pairing rule

`buildAnnotatedDatasetXml` reuses `buildDatasetXml` for the structural backbone and adds, **per entry**, one Spanish `<lex>` element for every `Annotation` row of that entry, **ordered by `Annotation.sentenceIndex` ascending**. The output preserves the convention used by the source corpora (see `test-datasets/ru_dev.xml`), where each translation `<lex>` reuses the `lid` of its paired English `<lex>`:

For each annotation `a` of entry `e`:

1. Collect the English lex list of `e`: `englishLexes = e.lexes.filter(l => l.lang === 'en').sort(byPosition)`.
2. If `a.sentenceIndex < englishLexes.length`:
   - **Paired** Spanish lex. Use `lid = englishLexes[a.sentenceIndex].lid` (preserves the upper-case `Id<x>` convention).
3. Otherwise:
   - **Free** Spanish lex. Use `lid = \`id\${a.sentenceIndex + 1}\`` (lowercase `id` prefix, 1-indexed number).
4. Emit `<lex comment="" lang="es" lid="<lid>">${escapeXml(a.sentence)}</lex>` immediately after the English lex of the same `lid` when paired, and at the end of the lex group (before `dbpedialinks`/`links`) for free entries. The relative order between original `<lex>` entries is preserved.

The builder never emits a Spanish lex without a matching annotation, and never modifies non-Spanish lex entries already present. Existing `lang="ru"`/other-language lexes are passed through untouched.

The pairing is **positional by `sentenceIndex`**, not by sentence text. The frontend annotator UI is the contract that places sentence `n` of the entry into `Annotation.sentenceIndex = n`; downstream consumers of the extended XML inherit that ordering.

### 8.6 Authorization and access

Both endpoints rely on the existing `getAccessibleDatasetGraph` to enforce per-dataset access:

- A logged-in user without a `Permit` row over the dataset receives the same `404 dataset_not_found` returned by other accessible-dataset endpoints (no information leak about dataset existence).
- A logged-in user with any `Permit` row (annotator, reviewer, admin, owner) can call both endpoints, mirroring the visibility of the existing `Visualización del XML` tab.
- A `requireApiModerator()` check is **not** added; moderator status alone is not enough — a `Permit` row over the dataset is still required.

### 8.7 Out of scope

- Byte-identical reproduction of the originally uploaded XML. The download is reconstructed from the persisted graph; whitespace, attribute order and comments may differ from the upload. A future iteration may add a `Dataset.rawContent BLOB` column if byte fidelity is required.
- Per-user filtering of annotations. The extended XML aggregates every persisted annotation for each entry (the `Annotation` PK already constrains it to one canonical row per `(entryId, datasetId, sentenceIndex)`).
- Streaming for very large datasets. Bodies are built in memory; the current `buildDatasetXml` already follows the same approach for `/text`.

### 8.8 Dataset naming and rename (US-32)

A dataset is named on creation and can be renamed later from the administration
page. Both paths live in `routes/datasets-api.js` under `requireApiAuth`.

| Method  | Path                | Handler         | Authorization        | Purpose                                  |
| ------- | ------------------- | --------------- | -------------------- | ---------------------------------------- |
| `POST`  | `/api/datasets`     | `createDataset` | `requireApiModerator`| Accepts an optional `name` field (multipart). |
| `PATCH` | `/api/datasets/:id` | `renameDataset` | dataset admin (service) | Rename `{ name }`; admin-only, like `DELETE /:id`. |

**Name resolution and validation** (`services/datasets-service.js`):

- The name is **trimmed** (`normalizeDatasetName`). On creation, an empty/absent name falls back to the file-derived name (`nameFromFilename`, strips `.xml`); the UI pre-fills the field with the file name (`deriveDatasetNameFromFile` in `public/js/datasets.js`).
- `assertValidDatasetName` rejects an empty name (`400 invalid_dataset_name`) or one longer than 128 chars (`400 dataset_name_too_long`, mirroring `Dataset.name VarChar(128)`).

**Per-owner uniqueness invariant** — *no owner has two datasets with the same name*:

- Enforced for both creation and rename by `assertDatasetNameAvailable`, which queries `datasets-repository.findOwnedDatasetWithSameName({ userId, name, excludeDatasetId })` — a dataset whose name matches **and** that has a `Permit` with `isOwned` for that user. A hit raises `409 duplicate_dataset_name`.
- The comparison uses the column's DB collation (case-insensitive by default).
- On **rename** the check runs against the dataset's *owner* (resolved by `findDatasetOwnerUserId`), not necessarily the acting admin, and excludes the dataset being renamed. The check is **guarded** (`typeof === 'function'`) so unit tests with a minimal repository stub are unaffected.

The front-end keeps the relevant modal/panel open on `409` and surfaces the message inline (`public/js/datasets.js` create modal, `public/js/dataset-admin.js` rename panel) so the user can pick another name without losing context.

## 9. Per-dataset LLM credentials (US-31)

Until this block, the LLM provider and its key were **global and unique** for the whole application: `MODEL` selected `local`/`cloud` in `config.js`, and the Groq key came from `GROQ_API_KEY`. A single dispatcher (`utils/llm-client.js`) routed to `groq-client` or `ollama-client` by that global value. This section introduces **per-dataset AI credentials**: a dataset administrator registers a key and the AI-assisted validation of *that* dataset uses *that* credential, without affecting other datasets or the global configuration.

### 9.1 `DatasetLlmCredential` model

```
DatasetLlmCredential {
    id           INT          [PK, AUTOINCREMENT]
    datasetId    INT          [FK -> Dataset.id, MAPPED TO dataset_id]
    provider     VARCHAR(40)  // 'groq' | 'openai-compatible' | 'anthropic' | ...
    apiBase      VARCHAR(255)? [MAPPED TO api_base]
    model        VARCHAR(120)
    apiKeyCipher TEXT         [MAPPED TO api_key_cipher]  // AES-256-GCM: iv:authTag:ciphertext (base64)
    keyLast4     VARCHAR(8)   [MAPPED TO key_last4]       // last 4 chars, for the masked view
    isActive     BOOLEAN      [DEFAULT false, MAPPED TO is_active]
    createdAt    DATETIME     [DEFAULT now()]
    updatedAt    DATETIME     [@updatedAt]
    [UNIQUE (datasetId, provider) -> uq_dataset_llm_credentials_dataset_provider]
    [INDEX (datasetId) -> idx_dataset_llm_credentials_dataset]
}
```

`Dataset` gains the inverse relation `llmCredentials DatasetLlmCredential[]`. The FK uses `onDelete: Cascade`, so deleting a dataset removes its credentials. The table is applied with `npx prisma db push` (no versioned migrations; prototyping DB).

**Cardinality 1:N with a single active credential.** Several rows per dataset (one per provider) with an `isActive` flag that designates the one used. The "at most one active per dataset" rule is enforced in the service/repository layer inside a transaction (activating one deactivates the rest), because MySQL/Prisma has no convenient partial unique index.

### 9.2 At-rest encryption

`utils/secret-crypto.js` exposes `encryptSecret(plain)` / `decryptSecret(cipher)` using **AES-256-GCM** from `node:crypto`. The serialized format is `iv:authTag:ciphertext`, each part base64. The 32-byte key is derived with `scrypt` from `CREDENTIALS_ENCRYPTION_KEY` (or, as a fallback, from `SESSION_SECRET`) so the operator does not need to supply an exact 32-byte value. If no secret is configured, **writing a credential fails explicitly** (no ephemeral secret, which would invalidate stored data after a restart). A tampered ciphertext or auth tag throws (GCM authentication).

### 9.3 Provider abstraction

`utils/llm-client.js` accepts an explicit `providerConfig` in its calls:

```
providerConfig = { provider, apiBase?, model, apiKey, timeoutMs? }
```

- If `providerConfig` is present, the dispatcher routes by `providerConfig.provider`:
  - `openai-compatible` / `groq` → generic OpenAI-compatible client (`utils/openai-compatible-client.js`), reusing the request shape of the former `groq-client.js` (which remains as a thin alias).
  - `google-ai-studio` → the same OpenAI-compatible client, with the apiBase defaulting to Google's OpenAI-compatibility endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`), which accepts the AI Studio key as a Bearer token (US-35).
  - `anthropic` → native adapter (`utils/anthropic-client.js`, Messages API) that normalizes the response.
  - `local` / `ollama` → Ollama client.
- If `providerConfig` is absent, the dispatcher keeps the current global behaviour (`config.model`), so there is no regression.

All clients normalize the validation response to already-parsed JSON (as today with `extractJsonPayload`). For the "check" action there is a **free-text** path `generateText({ providerConfig, system?, prompt })` that returns the model's raw text without forcing `response_format: json_object`.

### 9.4 Precedence and `llm_mode`

- The **dataset credential takes precedence over the global config**: if the dataset has an active credential and `llm_mode != 'none'`, the `/check` flow resolves a `providerConfig` from it and passes it down to the client.
- With `llm_mode = 'none'` the panel does not apply: `listForAdmin` returns `[]`, `resolveActiveProviderConfig` returns `null` (the credential is not used even if rows exist), and write/check operations are rejected. The credential decides *which provider*; `llm_mode` decides *whether* there is AI assistance.

### 9.5 REST contract

All endpoints live under `/api/datasets/:id/llm-credentials`, behind `requireApiAuth`, and require the actor to be a dataset administrator (admin or owner):

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/api/datasets/:id/llm-credentials` | List masked credentials (empty when `llm_mode = 'none'`). |
| `POST`   | `/api/datasets/:id/llm-credentials` | Create/update a provider credential (`provider`, `apiBase?`, `model`, `apiKey`). |
| `PATCH`  | `/api/datasets/:id/llm-credentials/:provider/activate` | Mark the credential active (deactivates the rest). |
| `DELETE` | `/api/datasets/:id/llm-credentials/:provider` | Delete the credential. |
| `POST`   | `/api/datasets/:id/llm-credentials/:provider/check` | Call the model with `Respond "I'm <model> and I am ready to work"` and return `{ ok, message }`. |
| `POST`   | `/api/datasets/:id/llm-credentials/models` | List the provider's available models for the picker (US-35, §9.9). Body `{ provider, apiKey?, apiBase? }`; returns `{ ok:true, provider, models:[{id,label}] }` or `{ ok:false, code, error }`. |

The masked DTO is `{ provider, apiBase, model, keyLast4, isActive }` — never the clear or encrypted key. A non-admin gets `403 dataset_admin_required` / `404 dataset_not_found` (same codes as the rest of the dataset admin surface). With `llm_mode = 'none'`, `GET` returns an empty list and writes/`check` are rejected.

### 9.6 `/check` propagation

`POST /api/annotations/check` accepts an optional `datasetId`. When present, the controller resolves the session `userId` and **validates the user's access to that dataset** before loading/using its credential (a dataset the user cannot access is rejected, so a foreign dataset's key is never used). The annotations service resolves the active `providerConfig` via the credentials service and threads it through `context.providerConfig` → `spanish-service` → `ollama-spanish-checker` → `llm-client.generateJson`. With no active credential, no `providerConfig` is passed (global behaviour preserved).

### 9.7 Security

- The key is encrypted at rest and never returned to the client nor written to logs. `middlewares/request-log-middleware.js` redacts `apiKey`/`api_key`/`credential` in addition to the existing sensitive fields, taking care not to mask the legitimate `keyLast4`.
- Client/service error messages never echo the key. The `check` action returns `{ ok:false, error }` on provider/network failure without leaking the key.

### 9.8 Out of scope

- Key rotation/versioning. Rotating `CREDENTIALS_ENCRYPTION_KEY` makes previously stored ciphertexts unreadable; the secret is documented as mandatory and stable.
- Editing `llm_mode` after creation (still fixed at creation). The hiding rule is applied defensively for a hypothetical future where `llm_mode` becomes editable.

### 9.9 Provider model catalog for the picker (US-35)

The **Modelo** input of the credentials form becomes a live dropdown for providers whose catalog can be queried. Both supported catalogs are public APIs but **key-gated** (verified live: Groq returns `401 invalid_api_key`, Google `403 PERMISSION_DENIED` without a key), so the catalog is always fetched **server-side**, where the stored key can be decrypted and the typed key never leaves the application.

**Catalog sources** (`utils/llm-model-catalog.js`):

| Provider | Endpoint | Auth | Normalization |
|---|---|---|---|
| `groq` | `GET {apiBase:-https://api.groq.com/openai/v1}/models` | `Authorization: Bearer` | OpenAI list shape (`data[].id`); rows with `active === false` and non-chat ids (whisper/tts/guard/embedding…) are dropped. |
| `google-ai-studio` | `GET https://generativelanguage.googleapis.com/v1beta/models` (paginated, `pageSize=1000`) | `x-goog-api-key` header | `models[]` filtered to `supportedGenerationMethods ∋ generateContent`; `models/` prefix stripped from the id; `displayName` used as label. |

Both go through `fetchWithTimeout` (LLM log + abortable timeout). Failures are classified into `invalid_key` (401/403), `rate_limited` (429) and `provider_unavailable` (other HTTP errors, network failure, timeout) via a `CatalogError` carrying `code`; the classification feeds the inline UI message.

**Endpoint** `POST /api/datasets/:id/llm-credentials/models` (admin-only, `llm_mode` gate as the other writes). The body carries `{ provider, apiKey?, apiBase? }`; `POST` is used so the key travels in the body. Key resolution: the typed key wins; with no typed key the stored credential for that provider is decrypted; with neither, the call is rejected (`400 invalid_payload`). Providers without catalog support (`anthropic`, `openai-compatible`) are rejected with `400 invalid_payload` — the UI never offers the picker for them. Provider-side failures are returned as `200 { ok:false, code, error }` (the same handled-failure contract as `check`, including the `logAnomaly` flag), with the key redacted from messages.

**Frontend** (`public/js/dataset-admin.js`): a capability map decides per provider between dropdown and free text. The dropdown loads when the provider supports a catalog **and** a key is available (typed, or stored for that provider); responses are cached per provider+key fingerprint; a refresh button forces a reload. The list always ends with an **Otro (escribir manualmente)** option that reveals the legacy text input, so a catalog outage never blocks saving a credential.

## 10. Statistics and time tracking (US-14, US-21)

There are **two** statistics surfaces, both fed by the same time accumulators.

### 10.1 Time recording

The two pre-existing accumulator columns are now actually written by the work
flows:

- **Annotation** — `SectionAssignment.timeSpentSeconds`. The annotation page
  starts a clock when an entry is shown (`state.entryStartedAt`) and sends the
  elapsed seconds in the `POST /api/annotations/send` body (`timeSpentSeconds`).
  `annotations-service.saveSentences` adds it to the user's **active** assignment
  via `section-assignments-repository.addTimeToActiveAssignment`
  (`{ timeSpentSeconds: { increment } }`). Time accumulates across the entries of
  a section, matching how US-21 reads it (sum per user ÷ annotated entries).
- **Review** — `Review.timeSpentSeconds`. The reviewer page starts a clock when
  the review context loads (`state.loadedAt`) and sends the elapsed seconds in the
  `POST /api/reviews/:id/finalize` body. `reviews-service.finalizeReview` writes it
  inside the closing transaction.

Both values are **clamped** server-side to the relevant reservation window (2 h
by default) and floored to a non-negative integer, so a spoofed or buggy client
value cannot poison the average-time metrics.

### 10.2 Personal statistics — `GET /api/me/stats` (US-14)

`me-controller.getMyStats` resolves the user **from the session** (never the
request) and delegates to `me-statistics-service.getMyStatistics`, which reads:

- distinct annotated entries per dataset (`Annotation`, counted per entry),
- section-assignment time per dataset (annotation time),
- terminal reviews per dataset with their time (review time),
- the names of the datasets involved.

`buildMyStatisticsDTO` (pure, unit-tested) aggregates these into:

```
{
  user:   { id, email },
  totals: { annotations, reviews, datasetsAnnotated, datasetsReviewed,
            avgAnnotationSeconds, avgReviewSeconds },
  datasets: [ { datasetId, datasetName, annotations, reviews,
                avgAnnotationSeconds, avgReviewSeconds } ]   // only where > 0
}
```

Averages are `total ÷ count` floored, or `null` with no activity. The `datasets`
list keeps only datasets where the user has at least one annotation or review.
Section time recorded with no saved annotation is excluded from the general
annotation average so it cannot skew it. The page is `public/own-stads.html`
(linked as "Mis estadísticas" in the toolbar for every user); the reusable
front-only prototype lives in `prototypes/own-stads`.

### 10.3 Per-dataset administration statistics (US-21)

`GET /api/datasets/:id/statistics` (`datasets-statistics-service`) returns, per
dataset, an `annotation` and a `review` array of per-user rows (count, dataset
percentage, individual `averageTime`, precision). It now also returns
`annotationAverage` and `reviewAverage`: the dataset-wide **weighted general
average** time, computed as `Σ seconds ÷ Σ tasks` across users — so a user with
more tasks weighs proportionally. `public/dataset-admin.html` renders these as a
"Media general (ponderada)" footer row under each table.

#### 10.3.1 Multi-round review distribution

When `Dataset.hasAdditionalReviews = true` an entry can be reviewed several
times before its chain terminates (§4.6). The statistics DTO carries two
additional fields so the dataset admin can see the convergence pattern:

```
reviewRounds: {
    averageRoundsPerEntry: number,                 // mean rounds across entries that have ≥ 1 terminal review
    histogram: [ { rounds: 1, entryCount: 47 }, { rounds: 2, entryCount: 21 }, ... ]
}
```

Both are computed in the service layer from the statistics graph (no new
repository query): the `reviews` already eager-loaded under each entry are
filtered to `TERMINAL_REVIEW_STATUSES` and grouped by `entryId`. The histogram
keys are the consecutive positive integers from `1` to `max(rounds)`; bins with
`entryCount = 0` are kept so the SVG chart on the front-end can draw them as
empty bars. `averageRoundsPerEntry` is `Σ rounds ÷ count(entries)`, floored to
two decimals.

For datasets where `hasAdditionalReviews = false` (or for datasets without any
terminal review yet) the field is `null` and the histogram block is hidden in
the UI.

#### 10.3.2 Front-end rendering

`public/dataset-admin.html` adds, inside the **Revisión** tab and after the
per-user table, a small SVG bar chart (`#reviewRoundsHistogram`) plus a
label `Media de rondas por entrada: <X.XX>`. The chart is drawn inline by
`public/js/dataset-admin.js` (no new dependency); each bar's height scales
linearly with `entryCount`, the x-axis labels the round number, and an empty
bin is rendered as a 1px-tall baseline so the distribution shape stays
readable.

## 11. Automatic annotation by AI (US-33)

The automatic-annotation flow is added on top of the existing annotation
plumbing. It changes **only** the entry point on the dataset list (the **Anotar**
button on a `generation` dataset opens a modal instead of redirecting to
`/annotations`) and adds a background-job orchestrator that drives the
**existing** persistence path entry by entry. Every section that completes is
written through `spanish-service.save` exactly like a manual annotation, so the
counters, the review queue and the section assignment lifecycle behave
identically.

### 11.1 Surface

- `GET /api/datasets/:id/llm-credentials/active-status` — readable by any user
  with a `Permit` on the dataset (not admin-only). Returns
  `{ hasActive: boolean, llmMode: 'generation'|'correction'|'none' }`. The
  modal uses it to decide whether to enable the **Confirmar** button.
- `POST /api/annotations/auto/:datasetId` (body: `{ sectionsCount: 1..999 }`) —
  locks the next N globally-non-completed sections (`maxSectionIndex + 1..N`,
  same rule as the **continue** flow case 5) **atomically**: a single
  `prisma.$transaction` either creates the N `SectionAssignment` rows or rolls
  the whole job back. Then schedules the asynchronous worker and returns the
  initial status snapshot.
- `GET /api/annotations/auto/:datasetId/status` — returns the in-memory job
  snapshot: `{ status, entriesAnnotated, totalEntries, sectionsAnnotated,
  totalSections, currentSection, lastError, hasJob }`.
- `POST /api/annotations/auto/:datasetId/retry` — resumes a `failed` job on the
  entry where it stopped. Allowed only when `status === 'failed'`.
- `POST /api/annotations/auto/:datasetId/cancel` — deletes the `Annotation`
  rows already persisted for the partially-annotated current section, releases
  the remaining `SectionAssignment` locks (`status = 'released'`) and clears
  the job. The sections that completed before the cancel stay persisted.

### 11.2 Job state

State lives in an in-memory `Map<datasetId, Job>` owned by
`services/auto-annotation-service.js`:

```
Job {
  datasetId, userId,
  sectionIndexes: number[],     // the N sections, in order
  assignmentIds: number[],      // parallel to sectionIndexes
  sectionsCompleted: number,    // index in sectionIndexes finished
  currentEntryIndex: number,    // 0-based, within current section
  totalEntries: number,         // Σ entries across the N sections
  entriesAnnotated: number,     // already persisted
  totalSections: number,        // dataset-wide totalSections (for display)
  partialEntryIds: number[],    // entries persisted in current section, for cancel rollback
  status: 'running' | 'failed' | 'completed' | 'cancelled',
  lastError: string|null
}
```

In-memory is intentional: completed sections are persisted via the existing
path and survive restarts; a job in flight does not. A server restart in the
middle of a job will leave the section locks active until they expire (2 h),
matching the manual-flow contract.

### 11.3 Worker loop

The worker is started on `POST .../auto/:id` and runs detached (no `await` on
the start endpoint). For each remaining section:

1. Resolve the section's entries with the dataset section service
   (`datasetsService.getAccessibleDatasetSection`) — same shape the manual
   annotation page consumes.
2. For each entry, build a prompt **per entry** (one LLM call → one parsed
   response → one persist). The prompt asks for an array of Spanish sentences
   whose length matches `englishSentences.length` (`1` when the entry has no
   English reference). It is routed through `utils/llm-client.generateJson`
   with the dataset's active `providerConfig` (US-31) — the global key is never
   used for generation jobs.
3. Persist via `spanishService.save` (the same write path the manual flow uses
   to `replaceForAccessibleEntry` and transition the entry to `annotated`).
   Push the entry id to `partialEntryIds` so a later cancel can roll it back.
4. When all entries of the current section are persisted, run
   `sectionAssignmentService.completeAssignmentIfSectionDone` and
   `datasetsRepository.markSectionAsAnnotated` inside a single transaction
   (mirroring `annotations-service.finalizeSectionIfRequested`). Clear
   `partialEntryIds`, increment `sectionsCompleted`.

### 11.4 Failure / retry / cancel

- Any throw from steps 2 or 3 sets `status = 'failed'`, records `lastError`,
  and stops the loop. The current entry is not persisted (no partial DB write).
- **Retry** resumes from the current entry (the index it stopped on); it does
  not re-do entries that completed.
- **Cancel** runs a transaction: `Annotation.deleteMany` over
  `partialEntryIds`, plus `Entry.status = pending` for those entries (mirroring
  the "no sentences left" branch of `replaceForAccessibleEntry`), then
  releases the remaining `SectionAssignment` rows for the user/dataset/pending
  sections to `released` status. The job is removed from the map. Sections
  completed before the cancel keep their `completed`/`pending review` state.

### 11.5 Frontend integration

`public/js/datasets.js` checks `dataset.options.llmMode` on the click handler
of `Anotar`. For `generation` it opens the automatic-annotation modal; for
other modes the existing manual flow is preserved without any change. The
**En curso** state is read from `/api/annotations/auto/:id/status` lazily —
when the dataset list renders, for each `generation` dataset, a single status
call decides whether to label the button `Anotar` or `En curso`.

The dataset detail page (`/datasets/:id/view`) is a read-only XML viewer and
**does not expose any annotation entry point**; the manual annotation flow is
launched only from the dataset list.

### 11.6 Backend guard against manual annotation on `generation`


`continueDatasetService.continueDataset` rejects any attempt to reserve or
resume a section on a `generation` dataset with
`409 llm_generation_blocks_annotation`. This single guard covers both
entrypoints into the manual flow:

- the `Anotar` button on a dataset card (when the UI is bypassed),
- and the `/annotations?datasetId=...` page on load (which fans out to
  `POST /api/annotations/:id/continue` before resolving the active entry).

The check sits next to the `correction`-mode credential guard
(`assertActiveCredentialIfCorrection`) so both per-mode blocks live in one
place. `none` and `correction` flows are unaffected.

### 11.7 Out of scope

- Persistent jobs across restarts (today's contract is "completed sections
  survive; running state does not").
- Parallel LLM calls (entries are intentionally sequential to keep failure
  semantics simple: the failing entry is the resume point).
- Auto-annotation for `correction` and `none` modes (the button still opens
  the manual page).
