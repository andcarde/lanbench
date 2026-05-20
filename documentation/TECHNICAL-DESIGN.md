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
    id                   INT          [PK, AUTOINCREMENT]
    name                 VARCHAR(128)
    totalEntries         INT
    languages            TEXT?
    colorClass           VARCHAR(64)  [DEFAULT 'dataset-purple']
    llmMode              VARCHAR(20)  [DEFAULT 'none']
    isReviewEnabled      BOOLEAN      [DEFAULT false]
    hasAdditionalReviews BOOLEAN      [DEFAULT false]
    sectionsCompleted    UNSIGNED INT [DEFAULT 0]
    sectionsInReview     UNSIGNED INT [DEFAULT 0]
    sectionsPending      UNSIGNED INT [DEFAULT 0]
    createdAt            DATETIME     [DEFAULT now()]
    updatedAt            DATETIME     [@updatedAt]
}
```

Notes:

- `totalEntries` is the number of entries belonging to this dataset.
- The raw XML payload is **not** persisted on `Dataset`. The dataset XML is reconstructed on demand from the persisted graph (`Entry` + `Tripleset` + `Triple` + `Lex` + `DbpediaLink` + `Link`) by `utils/dataset-xml.js#buildDatasetXml`. The original uploaded filename is also not stored: the download endpoints derive it as `<Dataset.name>.xml` (see section 8).
- `llmMode` selects how the LLM is used for this dataset (e.g. `none`, suggestion, validation — values defined at the application level).
- `isReviewEnabled` toggles the review workflow for this dataset; `hasAdditionalReviews` enables further review rounds beyond the first.
- `sectionsCompleted`, `sectionsInReview`, `sectionsPending` are **persisted progress counters** maintained by the application; they are not derived on the fly.

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
- `sectionNumber` must be ≤ `ceil(totalEntries / 10)` for the dataset; `entryNumber` must be ≤ `totalEntries`. These ranges are enforced at the application level.

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
    [PRIMARY KEY (entryId, datasetId)]
}
```

Notes:

- The composite PK `(entryId, datasetId)` means there is **one canonical annotation per entry per dataset**. The annotation belongs to the user identified by `userId`. Multi-sentence annotations are represented via `sentenceIndex` along with the related decision/comment tables.
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
    assignedAt            DATETIME     [DEFAULT now()]
    expiresAt             DATETIME
    timeSpentSeconds      UNSIGNED INT [DEFAULT 0]
    completedAt           DATETIME?
}
```

Represents a single review pass on an entry: the reviewer (`reviewerId`) evaluates the work of the annotator (`annotatorId`). `currentCriterionIndex` tracks the sequential progress through the criteria of `EvaluationCriterion` (required by the rule "the next criterion does not appear until the current one is checked" from `US-13`). `expiresAt` follows the same exclusive-assignment pattern as `SectionAssignment`: the default review window is **2 hours** (`DEFAULT_REVIEW_DURATION_MS` in `services/reviews-service.js`); `reviews-service.requestNextReview` calls `expireStaleReviews(new Date())` before searching for candidates, so abandoned reviews recycle automatically.

#### ReviewDecision

```
ReviewDecision {
    id            INT          [PK, AUTOINCREMENT]
    reviewId      INT          [FK -> Review.id, onDelete: Cascade]
    criterionCode VARCHAR(100)
    decision      VARCHAR(20)
    comment       TEXT?
    decidedAt     DATETIME     [DEFAULT now()]
    [UNIQUE (reviewId, criterionCode)]
}
```

One row per criterion per review. The unique constraint enforces that each criterion is decided at most once per review.

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
  - Return the session-closed event with two options: `Exit` (redirects to `/tasks`) and `Continue` (creates a new `ActiveSession` row for the next available section).
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
2. The annotator submits a sentence. The server upserts the `Annotation` row keyed by `(entryId, datasetId)`; subsequent edits replace the existing row.
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
2. **Reviewer eligibility:** `reviews-repository.findReviewableEntries` excludes every entry whose `annotations.userId` matches the requesting `reviewerId`, enforcing the anti-self-review rule at the SQL level (`annotations: { none: { userId: reviewerId } }`). No reviewer can ever be served their own annotation, regardless of `isModerator` status.
3. The reviewer evaluates the entry criterion by criterion. The active criterion is the one at index `currentCriterionIndex`, advancing only after the previous decision is persisted in `ReviewDecision`. The unique key `(reviewId, criterionCode)` makes each criterion decidable at most once per review.
4. **Wizard guard:** `reviews-service.submitDecision` rejects any decision whose criterion index is greater than `review.currentCriterionIndex` with `ServiceError(status: 409, code: 'criterion_locked')`. Re-deciding an earlier criterion is allowed (regression permitted): the upsert overwrites the prior `ReviewDecision` but `currentCriterionIndex` only advances when the active criterion is the one being decided.
5. **Comment-required rule:** `decisionRequiresComment(decision)` (in `constants/review-decision.js`) returns `true` for `rejected` and `needs_fix`. Submitting such a decision with an empty `comment` is rejected with `code: 'comment_required'`. The same code is emitted by `submitTextCorrection` whenever a `ReviewComment` is attempted with empty `comment` or empty `correctedSentence` (`code: 'invalid_correction'`).
6. If the reviewer corrects a sentence, a `ReviewComment` row stores the original sentence, the corrected sentence and the justification comment. The justification is used both for re-correction and for feedback to the annotator.
7. **Finalization:** `reviews-service.finalizeReview` requires all criteria to have a decision (`code: 'criteria_incomplete'` otherwise). Within a single `prisma.$transaction` it sets `Review.status` to `completed` (all `accepted`) or `disputed` (any non-`accepted`), updates `Entry.status` to `reviewed` or `disputed` accordingly, and — for disputed cases — flips `Annotation.isAcceptedFirstTry` to `false` for every annotation of the same `(entryId, annotatorId)`.
8. `Dataset.hasAdditionalReviews` controls whether further review rounds can be opened on the same entry.

### 4.3 Configurable criteria (supports US-24)

`EvaluationCriterion` is the catalogue consumed by the review UI:

- `sortOrder` defines the sequential order.
- `isActive` filters which criteria are presented in the current review workflow.
- `version` allows criteria definitions to evolve while preserving the historical `criterionCode` values stored in `ReviewDecision`.

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

### 7.2 Dataset summary fields

`listDatasetSummaries` returns one row per dataset accessible to the moderator. Each row has the shape produced by `mapDatasetSummary` in `services/admin-service.js`:

- `datasetId`, `name`, `updatedAt`.
- `totalEntries` — total entries belonging to the dataset.
- `reservedEntries` — entries belonging to sections with an active `SectionAssignment`.
- `annotatedEntries` — entries with at least one persisted `Annotation` row (derived; not equal to `Entry.status = 'annotated'` because no current code path writes that status — see USER-STORIES.md §10.2 "Ciclo de vida de una entry").
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

`EvaluationCriterion` rows are never deleted: deactivation is done by setting `isActive = false`. Every update increments `version` so historical `ReviewDecision.criterionCode` values keep their semantic anchor even when the catalogue evolves. The reviewer UI calls `getOrderedCriteria()` (from `constants/review-criterion.js`) which projects the active subset in `sortOrder` ascending.

### 7.5 Out of scope

- Cross-dataset analytics (rolling counts of annotators, reviewers, etc.).
- Activity monitoring of individual users (US-23 is not yet implemented).
- Admin UI for managing `Permit` rows directly.

`scripts/bootstrap-admin.js` provisions a server-level moderator: it creates a user with `isModerator: true` or sets the flag on an existing user. It does not touch the `Permit` table.

The front-end toolbar (`public/js/toolbar.js`) is the only `public/js/` file that branches on server role: it fetches `/api/session/me`, builds moderator-only navigation entries (`/reviewer` and `/tasks` admin links) iff `isModerator === true`, and renders a moderator badge under the same condition. All other front-end files (`annotations.js`, `datasets.js`, `reviewer.js`, `dataset-admin.js`) consume per-dataset permission DTOs and are independent of `isModerator`.

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
2. Re-verifies the **completion condition**: `Dataset.sectionsCompleted === ceil(totalEntries / SECTION_SIZE) && Dataset.sectionsPending === 0`. Otherwise throws `ServiceError(status: 409, code: 'dataset_not_completed')`. The frontend disables the button on the same condition (read from the existing dataset DTO), but the backend re-checks it because the UI cannot be trusted to gate write/read access.
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
