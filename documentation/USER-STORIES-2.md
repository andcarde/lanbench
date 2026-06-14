# USER STORIES — v2

## 1. Purpose of the document

This document is the **second iteration** of the functional reference for `lanbench`. It supersedes [USER-STORIES.md](USER-STORIES.md) and:

- restates every user story still in scope using a professional template (story sentence, value, dependencies, functional rules, **Gherkin acceptance criteria**, current status);
- consolidates user stories whose scope changed across iterations (notably the unified personal-statistics story);
- removes user stories that were officially discontinued during the project's lifetime — those are no longer presented as goals; only a brief annex retains the identifiers so traceability with prior planning artefacts is not lost;
- incorporates every user story added after the first iteration (US-29 through US-35).

The canonical sources of truth this document derives from are:

- [prisma/schema.prisma](../prisma/schema.prisma) — data model.
- [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) — how each functional behaviour is implemented.
- the working application surface (routes, controllers, services, public pages).

This document answers **what** the system does and **for whom**. The **how** lives in TECHNICAL-DESIGN.md.

## 2. Product goal

`lanbench` is a web platform to **generate, annotate, validate and manage Spanish text from RDF triples**, using WebNLG-style datasets as a base. It produces high-quality training data for natural language generation, assisted translation, and linguistic evaluation tasks.

The platform's purpose is to **reduce the manual effort of corpus construction** while keeping human control over quality and enabling collaboration between four kinds of actor:

- **Annotators** — produce Spanish sentences from RDF.
- **Reviewers** — judge the quality of the produced sentences.
- **Dataset administrators / owners** — own datasets, configure their workflow, see per-dataset throughput.
- **Moderators** — server-wide operators who can create datasets and manage server roles.

An **automatic AI-assisted component** (rule-based + LLM) participates at two points: contextual validation of a sentence (`llm_mode = correction`) and full automatic generation of sentences (`llm_mode = generation`).

## 3. Functional scope

The supported business workflow is:

1. A moderator (and/or dataset owner) brings an RDF dataset into the system, names it, optionally describes it, picks its section size, the LLM mode, and whether review is enabled.
2. Annotators access an assigned section and produce Spanish sentences from triples (`llm_mode = none` or `correction`), or wait for the AI to do it for them (`llm_mode = generation`, US-33).
3. Reviewers (when `Dataset.isReviewEnabled = true`) judge each annotated phrase against a fixed set of criteria, correcting where necessary.
4. The system records request and error logs for operational traceability.
5. Any user with access to a dataset can download its original XML; once the dataset is 100% complete, an **extended XML** carrying the Spanish annotations can also be downloaded.

What the system supports today end to end:

- Registration, login, session-protected access, two-tier roles (`isModerator` + per-dataset `Permit`).
- XML dataset upload by moderators, with declarative options (name, description, section size, LLM mode, review on/off, additional reviews).
- Browsing of accessible datasets, browsing of dataset sections in declarative-size blocks.
- Sentence validation by rules and AI assistance via Ollama / OpenAI-compatible providers / Anthropic, with **per-dataset credentials** that override the global one (US-31, US-35).
- Persistent annotation per user and entry, with section-assignment locking and 2-hour expiry.
- Per-phrase review wizard with a single review-level criterion (Diversity), inline corrections, automatic finalisation and 2-hour expiry.
- **Automatic AI annotation** for `llm_mode = generation` datasets (US-33): user requests N sections, the worker drives them entry by entry.
- Personal statistics for every user, per-dataset administrative statistics.
- Original-XML download from the visualization tab; extended XML download with Spanish annotations on 100% completed datasets.
- Request logs and 500-error logs in hourly/daily files.
- Public moderator registration with single-use codes; backend endpoints for server-role management.

## 4. Software architecture (in brief)

Modular monolith over Node.js / Express:

- **Presentation** — `routes/` (HTML and API), `middlewares/` (auth, file upload, request log).
- **Application** — `controllers/`, `services/`, `contracts/` (DTOs).
- **Persistence** — `repositories/`, `prisma/schema.prisma` over MySQL/MariaDB.
- **Domain & utilities** — `entities/`, `utils/` (XML I/O, validators, LLM clients, secret crypto), `constants/` (roles, criteria, section size resolution).

Sessions are managed with `express-session`. The LLM layer dispatches to **OpenAI-compatible**, **Anthropic-native**, or **Ollama** clients depending on the resolved per-dataset credential (US-31).

The data model is detailed in [TECHNICAL-DESIGN.md §2](TECHNICAL-DESIGN.md). The key entities are: `User`, `Permit`, `Dataset`, `Section`, `Entry`, `Tripleset`, `Triple`, `Lex`, `DbpediaLink`, `Link`, `SectionAssignment`, `ActiveSession`, `Annotation`, `AnnotationAlertDecision`, `EvaluationCriterion`, `Review`, `ReviewDecision`, `ReviewComment`, `DatasetLlmCredential`, `RegisterCode`, `Session`.

## 5. Two-tier role model

`lanbench` distinguishes two **independent** role dimensions; they never collapse into a single role string.

| Dimension | Where | Values | Granted by |
|---|---|---|---|
| **Server role** | `User.isModerator` | `normal` (`false`), `moderator` (`true`) | Bootstrap script, public moderator registration with single-use code (US-27), or server-role management endpoints (US-22). |
| **Dataset role** | `Permit.isOwned / isAnnotator / isReviewer / isAdmin` (one row per `(datasetId, userId)`) | Boolean flags, non-exclusive | A dataset admin or owner via the dataset administration page. |

A `moderator` does **not** automatically gain any dataset role: they still need a `Permit` row to act on a specific dataset. Server-level actions reserved for moderators (creating datasets, the admin API, managing server roles) do not require a `Permit`.

## 6. Capability dependencies

Stories are not independent. The value of the system appears when certain capabilities exist before others.

Main chain: **(1)** identity & session → **(2)** two-tier roles → **(3)** dataset upload with declarative options → **(4)** sectioning → **(5)** annotation (manual or automatic) → **(6)** automatic validation (alerts) → **(7)** human review → **(8)** statistics, downloads, audit.

Key invariants:

- Without authentication there is no traceability per user.
- Without the two-tier role model there can be no safe division of work between operators, dataset owners and annotators.
- Without dataset upload there is nothing to annotate.
- Without sectioning, multi-user work cannot scale (no exclusive locking).
- Without the alert flow, defects reach review unfiltered.
- Without review the quality assurance loop does not close.
- Without per-dataset LLM credentials, AI assistance is constrained to a single global key with a single global quota.
- Without request/error logs, there is no operational audit.

## 7. User stories — index

Stories are grouped by capability area. Identifiers are preserved across iterations to keep traceability with the codebase, the technical design, and prior planning artefacts. Identifiers absent from this index (US-07, US-11, US-15, US-16, US-18) correspond to **discontinued stories** documented in [Annex A](#annex-a--discontinued-user-stories).

### 7.1 Identity and access
- `US-01` — Annotator registration and login.
- `US-27` — Public registration as moderator with single-use code.
- `US-28` — Operational generation of moderator codes.
- `US-22` — Server-role management (server-side endpoints).

### 7.2 Dataset lifecycle
- `US-19` — Upload of RDF datasets with declarative options.
- `US-32` — Naming and renaming of datasets (unique per owner).
- `US-34` — Optional dataset description on creation and on the visualization page.
- `US-02` — Consultation of accessible datasets.
- `US-29` — Download of the original XML from the visualization tab.
- `US-30` — Download of the extended XML with Spanish annotations.

### 7.3 Annotation
- `US-03` — Understandable visualization of RDF triples.
- `US-04` — Segmentation of the dataset into work sections.
- `US-05` — Writing Spanish sentences from RDF triples.
- `US-06` — Spanish writing assisted by English reference.
- `US-08` — Automatic alerts upon completion.
- `US-09` — Validation of text coverage with respect to the triples.
- `US-10` — Correction of linguistic and reference errors.

### 7.4 Review
- `US-13` — Per-phrase human evaluation by quality criteria.
- `US-12` — Review feedback visible to the annotator.

### 7.5 AI and smart assistance
- `US-17` — Detection of potentially invalid translations (contextual alert).
- `US-31` — Per-dataset AI credentials.
- `US-35` — Pick the AI model from the provider's live catalogue.
- `US-33` — Automatic annotation by AI (*Generación por IA*).

### 7.6 Personal and administrative metrics
- `US-14` — Unified personal statistics (annotator + reviewer).
- `US-21` — Per-dataset administration statistics.

### 7.7 Administration and governance
- `US-20` — Export of dataset progress (moderator API).
- `US-23` — Activity monitoring (gap, server-side logs only).
- `US-24` — Configuration of evaluation criteria (catalogue persisted, consumer not yet wired).

### 7.8 Operation and audit
- `US-25` — Request logging with payload.
- `US-26` — Specific logging of 500 errors.

---

## 8. User stories — detailed version

Each story follows the same template:

> **Story.** *As a* `<persona>`, *I want* `<action>`, *so that* `<benefit>`.
>
> **Value delivered.** Why it matters to the product.
>
> **Dependencies.** Other stories, models or services that must already exist.
>
> **Functional rules.** Behavioural constraints that hold beyond the happy path.
>
> **Acceptance criteria (Gherkin).** Verifiable scenarios in Given / When / Then.
>
> **Current status.** Implementation state at the time of writing.

### 8.1 Identity and access block

#### `US-01` — Annotator registration and login

**Story.** *As a* visitor, *I want* to create an account and authenticate, *so that* I can use the annotation platform with my work tied to my identity.

**Value delivered.** Identifies the user, attaches every annotation/review to them, and enables permission gating per dataset role.

**Dependencies.** `User` model, password hashing (`services/password-hasher.js`), session store (`express-session` + `Session` table), authentication middleware (`requirePageAuth`, `requireApiAuth`).

**Functional rules.**

- Public registration always creates a normal user (`is_moderator = false`). Any `isModerator` or `role` field sent by the client in `POST /register` is **silently ignored**.
- Elevation to moderator is exclusively reachable via `US-27` (single-use code), the bootstrap script, or the admin API (`US-22`).

**Acceptance criteria (Gherkin).**

- **Given** a visitor on `/register` with a valid email and a password matching the policy, **When** they submit, **Then** a `User` row is created with `isModerator = false` and a session is opened.
- **Given** a visitor submitting an email already present in `User`, **When** they submit, **Then** the registration is rejected with a controlled error and no row is created.
- **Given** an authenticated user, **When** they request a protected route, **Then** the request proceeds; **And** when they have no active session, the request is rejected with `401` (API) or redirected to `/login` (page).
- **Given** a request to `POST /register` carrying `isModerator: true` or `role: 'moderator'`, **When** the server processes it, **Then** the body field is ignored and the created user is `isModerator = false`.

**Current status.** Implemented.

---

#### `US-27` — Public registration as moderator with single-use code

**Story.** *As a* visitor in possession of a valid moderator code, *I want* to register and be promoted to moderator in the same sign-up, *so that* I can access the administrative surface without operational intervention on the database.

**Value delivered.** Distributes administrative access to authorised operators without manual DB promotion.

**Dependencies.** `User.isModerator`, `RegisterCode` table, the public registration form, body validation of `POST /register`, prior code generation (US-28).

**Functional rules — form.**

- The public registration form carries a **Moderator** checkbox, unchecked by default.
- When checked, a **Moderator Register Code** input becomes visible; when unchecked, the field is hidden **and its value is cleared**.
- The code field only accepts `[a-zA-Z0-9]` (case-sensitive) and is hardware-limited to 16 characters via `keypress`/`paste` filters (the `maxlength` attribute alone is not reliable for all paste paths).

**Functional rules — backend.**

- Unchecked checkbox → submission goes to `POST /register` (US-01 path), unchanged.
- Checked checkbox → submission goes to `POST /register/moderator` with the same body as `/register` plus the `code` field (exactly 16 chars matching `^[A-Za-z0-9]{16}$`).
- Server validation order: body validation first (email, password rules); then `code` shape; then `code` consumption.
- `code` consumption is **atomic** (`prisma.registerCode.delete({ where: { code } })`): a successful delete consumes the code and the user is created with `is_moderator = true`; a missing row yields `400 { error: 'Invalid moderator register code' }` and no user is created.

**Acceptance criteria (Gherkin).**

- **Given** the registration form with **Moderator** unchecked, **When** the user toggles it on, **Then** the code field is shown empty; **And** when they toggle it off, the code field is hidden and its value is cleared.
- **Given** the code field, **When** the user pastes a string containing characters outside `[a-zA-Z0-9]` or longer than 16 characters, **Then** the content is filtered and truncated to 16 valid characters.
- **Given** a valid body and a code that exists in `RegisterCode`, **When** the form is submitted, **Then** the user is created with `is_moderator = true` and the code row is deleted.
- **Given** a valid body and a code that does not exist in `RegisterCode`, **When** the form is submitted, **Then** the response is `400` with `{ error: 'Invalid moderator register code' }` and no user is created.
- **Given** two concurrent requests with the same code, **When** they reach the server, **Then** only the first succeeds and the second receives `400`.

**Current status.** Implemented.

---

#### `US-28` — Operational generation of moderator codes

**Story.** *As an* operator, *I want* to generate batches of single-use codes, *so that* I can hand them out to people who must register as moderators without touching the database by hand.

**Value delivered.** Removes the need to manually insert rows or expose DB credentials.

**Dependencies.** `RegisterCode` table, the Prisma client shared with the server.

**Functional rules.**

- A CLI under `scripts/generate-register-codes.js` prompts on stdin for a positive integer `count`.
- Each code is exactly 16 characters from `[a-zA-Z0-9]` drawn through `crypto.randomInt` (uniform, unpredictable).
- All codes are inserted inside a **single** Prisma transaction; a mid-batch failure leaves the table untouched.
- After commit, each code is printed on its own line on stdout.
- On any error (validation or DB), the error is printed to stderr and the process exits non-zero **without** printing any partial code list.

**Acceptance criteria (Gherkin).**

- **Given** the operator enters `N`, **When** the CLI runs to completion, **Then** `N` rows are inserted in `RegisterCode` and exactly `N` lines are written to stdout.
- **Given** the operator enters a non-positive value, **When** the CLI validates it, **Then** the process exits non-zero with an error on stderr and no row is inserted.
- **Given** a DB failure mid-insert, **When** the transaction aborts, **Then** `RegisterCode` contains no row from this batch.
- **Given** any generated code, **When** inspected, **Then** it measures 16 characters from `[a-zA-Z0-9]`.

**Current status.** Implemented.

---

#### `US-22` — Server-role management (backend)

**Story.** *As a* moderator, *I want* to promote or demote other users to/from the moderator role from the admin API, *so that* I can manage administrative capability without database access.

**Value delivered.** Closes the operational loop for server-role changes without manual SQL.

**Dependencies.** `User.isModerator`, `requireApiModerator()` middleware, admin API.

**Functional rules.**

- The admin API exposes:
  - `GET /api/admin/users` — list every user as `{ id, email, isModerator }`. The password hash is **never** returned.
  - `PATCH /api/admin/users/:id` — body `{ isModerator: boolean }`, strict boolean check.
- A moderator **cannot** demote themselves (`409 cannot_self_demote`), guaranteeing that a single-moderator base cannot lock itself out.
- An unknown user id returns `404 user_not_found`.
- Both endpoints sit behind `requireApiAuth + requireApiModerator()`; a non-moderator receives `403 forbidden_role`.

**Acceptance criteria (Gherkin).**

- **Given** a moderator session, **When** they `GET /api/admin/users`, **Then** the response lists every user as `{ id, email, isModerator }` and never includes the password hash.
- **Given** a moderator session, **When** they `PATCH /api/admin/users/:id` with `{ isModerator: true }` on a normal user, **Then** the user is promoted; **And** with `{ isModerator: false }` on a moderator (other than themselves), the user is demoted.
- **Given** a moderator session, **When** they try to demote their own account, **Then** the response is `409 cannot_self_demote`.
- **Given** a moderator session and an unknown user id, **When** they `PATCH`, **Then** the response is `404 user_not_found`.
- **Given** a non-moderator session, **When** they call either endpoint, **Then** the response is `403 forbidden_role`.
- **Given** a body where `isModerator` is not a strict boolean (e.g. `1`, `"true"`), **When** processed, **Then** the request is rejected.

**Current status.** Backend complete; a roster front-end page is not yet built (see [§9 — Gaps](#9-known-gaps)).

---

### 8.2 Dataset lifecycle block

#### `US-19` — Upload of RDF datasets with declarative options

**Story.** *As a* moderator, *I want* to upload an RDF/XML dataset and choose its workflow options at creation time, *so that* the dataset is immediately ready for annotation under the regime I want.

**Value delivered.** Opens the complete workflow of the product and pins the dataset's behavioural shape upfront.

**Dependencies.** Moderator server role (`requireApiModerator`), file upload middleware, XML parser, the dataset graph (`Dataset`, `Entry`, `Tripleset`, `Triple`, `Lex`, `DbpediaLink`, `Link`).

**Functional rules — form.**

The *Nuevo dataset* form persists six options on the dataset:

| Option | Column | Default | Notes |
|---|---|---|---|
| **Nombre** | `Dataset.name` | file name minus `.xml` | Trimmed, non-empty, ≤ 128 chars, unique per owner — see [US-32](#us-32--dataset-naming-and-rename). |
| **Descripción** (opcional) | `Dataset.description` | `NULL` | Optional free text — see [US-34](#us-34--optional-dataset-description). |
| **Tamaño de sección** | `Dataset.sectionSize` | `10` | Positive integer — see [US-04](#us-04--segmentation-of-the-dataset-into-work-sections). |
| **Uso de LLMs** | `Dataset.llmMode` | `none` | `none` / `generation` / `correction`. |
| **Revisión** | `Dataset.isReviewEnabled` | `false` | When `false`, US-13 is skipped for this dataset. |
| **Revisiones adicionales tras corrección** | `Dataset.hasAdditionalReviews` | `false` | Reserved for additional review rounds (column persisted but inert today). |

**Functional rules — invariants.**

The last three options are coupled by two invariants enforced in the UI and **normalised defensively** server-side (`normalizeDatasetCreationOptions`). Policy: **normalise, never reject** — a crafted request that violates the rules is silently coerced to the valid combination, so an illegal state can never be persisted.

- **R1.** `isReviewEnabled = false` ⇒ `hasAdditionalReviews = false`. When *Revisión* is **No**, *Revisiones adicionales* is hidden and forced to `false`.
- **R2.** `llmMode = 'correction'` ⇒ `isReviewEnabled = true` ∧ `hasAdditionalReviews = true`. Both controls are shown but **locked**.

**Acceptance criteria (Gherkin).**

- **Given** a moderator session, **When** they submit a valid XML and a name, **Then** the dataset, its entries, triplesets, triples, lexes, and links are persisted in a single transaction.
- **Given** a non-moderator session, **When** they attempt `POST /api/datasets`, **Then** the response is `403`.
- **Given** an invalid XML (missing entries, malformed), **When** processed, **Then** the response is a controlled error and nothing is persisted.
- **Given** a payload with `isReviewEnabled = false` and `hasAdditionalReviews = true`, **When** persisted, **Then** the stored row has `hasAdditionalReviews = false` (normalised by R1).
- **Given** a payload with `llmMode = 'correction'` and `isReviewEnabled = false`, **When** persisted, **Then** the stored row has `isReviewEnabled = true` and `hasAdditionalReviews = true` (normalised by R2).
- **Given** a payload with an empty `sectionSize` or a non-positive value, **When** persisted, **Then** the stored row has `sectionSize = 10` (default).

**Current status.** Implemented.

---

#### `US-32` — Dataset naming and rename

**Story.** *As a* dataset administrator (admin or owner), *I want* to name a dataset on creation and rename it later from the administration page, *so that* datasets stay identifiable and naming mistakes can be fixed without re-importing data.

**Value delivered.** Keeps datasets identifiable and lets admins fix naming without re-importing.

**Dependencies.** `Dataset.name`, `Permit.isOwned/isAdmin`, `assertDatasetAdminPermission`.

**Functional rules.**

- On creation, the form pre-fills the name with the uploaded file name (without `.xml`); the admin may edit it. When no name is supplied (non-UI client), the server derives it from the file.
- The name is **trimmed**.
- An empty/blank name yields `400 invalid_dataset_name`.
- A name longer than 128 characters yields `400 dataset_name_too_long`.
- A name must be **unique per owner**: a collision yields `409 duplicate_dataset_name`.
- Renaming is exposed by `PATCH /api/datasets/:id` and is **admin-only**, enforced server-side like `DELETE /:id`.
- On rename, the collision check runs against the *dataset's owner* (not the acting admin) and excludes the dataset being renamed.

**Acceptance criteria (Gherkin).**

- **Given** a moderator session, **When** they create a dataset without supplying a name, **Then** the persisted name equals the uploaded file name minus `.xml`.
- **Given** a dataset administrator session and a non-empty new name unique among the owner's datasets, **When** they `PATCH /api/datasets/:id`, **Then** the dataset is renamed and the response carries the new name.
- **Given** a payload with an empty or whitespace-only name, **When** validated, **Then** the response is `400 invalid_dataset_name`.
- **Given** a payload with a name longer than 128 characters, **When** validated, **Then** the response is `400 dataset_name_too_long`.
- **Given** a name already used by another dataset of the same owner, **When** processed, **Then** the response is `409 duplicate_dataset_name` and the dataset is not changed.
- **Given** a non-admin session, **When** they `PATCH /api/datasets/:id`, **Then** the response is `403`.

**Current status.** Implemented.

---

#### `US-34` — Optional dataset description

**Story.** *As a* dataset administrator, *I want* to attach an optional short description to a dataset on creation, *so that* users opening the visualization page understand what the dataset is about under its name.

**Value delivered.** Replaces the previously placeholder header area on `/datasets/:id/view` with a one-glance explanation of the dataset.

**Dependencies.** `Dataset.description VARCHAR(512)?`, the *Nuevo dataset* form (US-19, US-32), `GET /api/datasets/:id`, the visualization page `public/dataset-view.html`.

**Functional rules.**

- The form exposes an optional `Descripción` textarea below the name input.
- The length cap is **512 characters** and is enforced on **both** sides:
  - Client: HTML `maxlength="512"`, an `input` listener that hard-truncates to 512, and a `paste` listener that clips the merged value to 512 (covers the "paste over selection" case where the merged text would exceed the limit).
  - Server: `assertValidDatasetDescription` rejects any trimmed value longer than 512 with `400 dataset_description_too_long`.
- The value is trimmed server-side. A blank or whitespace-only description is persisted as `NULL` and treated identically to no description.
- The visualization page renders the description verbatim under the dataset name; when `description` is `NULL` or empty, the subtitle node is hidden — nothing appears under the name.
- The previous "Modo servidor preparado" pill on the visualization header was **removed**: it never carried information for users.

**Acceptance criteria (Gherkin).**

- **Given** the *Nuevo dataset* form with an empty `Descripción`, **When** the dataset is created, **Then** the row has `description = NULL` and the visualization page shows no subtitle under the name.
- **Given** a description of 1–512 characters, **When** the dataset is created, **Then** the trimmed value is persisted and shown under the name on the visualization page.
- **Given** the user types or pastes more than 512 characters into the field, **When** the field is read, **Then** its value is at most 512 characters.
- **Given** a crafted request with `description.length > 512`, **When** validated, **Then** the response is `400 dataset_description_too_long` and the modal stays open showing the message inline.
- **Given** an existing dataset with `description = NULL`, **When** the visualization page is loaded, **Then** no subtitle and no "server mode" pill are rendered in the header.

**Current status.** Implemented.

---

#### `US-02` — Consultation of accessible datasets

**Story.** *As an* authenticated user, *I want* to see the list of datasets I have access to, *so that* I can pick which one to work on.

**Value delivered.** Entry point for every dataset-bound action.

**Dependencies.** Authentication, `Permit` rows, dataset repository, dataset DTOs.

**Functional rules.**

- The list returns only datasets the user has a `Permit` on; for moderators, the dataset list also serves as the moderator's pivot to the admin API.
- Each item exposes the metadata needed to drive the dataset card: name, description, color class, options (`llmMode`, `isReviewEnabled`, `hasAdditionalReviews`, `sectionSize`), counters (`sectionsCompleted`, `sectionsInReview`, `sectionsPending`, `totalEntries`), the per-dataset reviewable count, and the actor's effective dataset role flags.

**Acceptance criteria (Gherkin).**

- **Given** an authenticated user without a `Permit` on a dataset, **When** they request the list, **Then** that dataset does not appear.
- **Given** an authenticated user with a `Permit` on a dataset, **When** they request the list, **Then** that dataset appears with name, description, counters and effective dataset role flags.
- **Given** an unauthenticated request, **When** it reaches the endpoint, **Then** the response is `401`.

**Current status.** Implemented.

---

#### `US-29` — Download of the original XML

**Story.** *As a* user with access to a dataset, *I want* to download the original XML from the *Visualización del XML* tab, *so that* I can inspect or reuse the dataset outside the platform.

**Value delivered.** Enables external inspection and reuse without requiring administrative access.

**Dependencies.** `Permit` over the dataset, the persisted dataset graph, the XML serializer (`utils/dataset-xml.js#buildDatasetXml`).

**Functional rules.**

- A button labelled `Original` (with a download icon) sits in the header of the *Visualización del XML* card.
- The downloaded body is the dataset XML **reconstructed from the persisted graph** — identical to the content the read-only viewer already shows. It is not guaranteed to be byte-identical to the originally uploaded file.
- File name: `<Dataset.name>.xml`.
- Response headers: `Content-Type: application/xml; charset=utf-8`, `Content-Disposition: attachment; filename="<Dataset.name>.xml"`.

**Acceptance criteria (Gherkin).**

- **Given** a user with a `Permit` on the dataset, **When** they press `Original`, **Then** the response is a `.xml` attachment whose body matches the read-only viewer's content.
- **Given** a user without a `Permit`, **When** they hit the endpoint, **Then** the response is the standard accessible-dataset authorization error.
- **Given** an empty dataset (no entries), **When** the user presses `Original`, **Then** the response is the controlled error `dataset_without_entries`.
- **Given** the downloaded file, **When** named, **Then** the name equals `<Dataset.name>.xml`.

**Current status.** Implemented.

---

#### `US-30` — Download of the extended XML with Spanish annotations

**Story.** *As a* user with access to a fully completed dataset, *I want* to download an extended XML that contains the original content plus the Spanish annotations, *so that* I can reuse the annotated corpus.

**Value delivered.** Closes the corpus production loop: Spanish annotations stop living only in the database.

**Dependencies.** `Permit` over the dataset, persisted `Annotation` rows, dataset completion counters, `utils/dataset-xml.js#buildAnnotatedDatasetXml`.

**Functional rules.**

- A button labelled `Extendido` (with a download icon) sits next to `Original` in the same card header.
- The button is **disabled** while the dataset is below 100% completion; a tooltip explains the requirement.
- 100% completed is defined server-side as `sectionsCompleted === ceil(totalEntries / sectionSize) && sectionsPending === 0`. The backend re-checks the condition before serving the file; an incomplete dataset returns `409 dataset_not_completed`.
- File name: `<Dataset.name>-extended.xml`.
- The extended XML mirrors the original entry by entry; for each entry, Spanish `<lex>` elements (`lang="es"`) are appended from the `Annotation` rows. Pairing rule:
  - If a same-position English `<lex>` exists, the Spanish lex reuses its `lid` (e.g. `Id1`, `Id2`).
  - Otherwise the Spanish lex uses `lid="id<sentenceIndex+1>"` (lowercase `id` prefix).
- The output never emits a Spanish `<lex>` without a matching `Annotation` row; non-Spanish lexes are passed through untouched.

**Acceptance criteria (Gherkin).**

- **Given** a 100%-completed dataset and a user with a `Permit`, **When** they press `Extendido`, **Then** the response is a `.xml` attachment whose body contains the original structure plus Spanish `<lex>` elements derived from the annotations.
- **Given** a dataset below 100% completion, **When** the user hits the endpoint, **Then** the response is `409 dataset_not_completed` and the UI button is rendered disabled.
- **Given** an entry with English `<lex>` `lid="Id2"` at position 2 and a Spanish annotation at `sentenceIndex = 1`, **When** the file is built, **Then** the annotation appears as `<lex lang="es" lid="Id2">…</lex>`.
- **Given** an entry whose annotation `sentenceIndex` exceeds the number of English lexes, **When** the file is built, **Then** the Spanish lex uses `lid="id<sentenceIndex+1>"`.

**Current status.** Implemented.

---

### 8.3 Annotation block

#### `US-03` — Understandable visualization of RDF triples

**Story.** *As an* annotator, *I want* to see an entry's triples and contextual metadata clearly, *so that* I can produce a correct Spanish verbalisation.

**Value delivered.** Reduces ambiguity and improves semantic coverage.

**Dependencies.** XML parser, persisted dataset graph, dataset DTOs.

**Functional rules.**

- The annotation page surfaces the entry's `triples`, the available English `lexes` as contextual reference, and the entry's metadata (`eid`, `category`, `shape`, `shapeType`).

**Acceptance criteria (Gherkin).**

- **Given** an entry with at least one tripleset, **When** the annotator opens it, **Then** subject, predicate, and object are clearly identifiable per triple.
- **Given** an entry with at least one English `<lex>`, **When** the annotator opens it, **Then** the English reference is visible and usable as support.

**Current status.** Implemented.

---

#### `US-04` — Segmentation of the dataset into work sections

**Story.** *As an* annotator, *I want* the dataset to be divided into manageable work sections, *so that* multiple annotators can collaborate without overlap.

**Value delivered.** Enables exclusive multi-user work distribution.

**Dependencies.** `Dataset.sectionSize`, `SectionAssignment`, `ActiveSession`, `constants/datasets.js#resolveSectionSize`.

**Functional rules.**

- Section size is **declarative per dataset** (`Dataset.sectionSize`, default `10`, chosen on creation — US-19). Non-positive or missing values are coerced to `10`.
- The dataset is divided into `ceil(totalEntries / sectionSize)` sections.
- The section is the minimum unit of work assigned to an annotator. Assignments are time-bounded by `SectionAssignment.expiresAt` (default 2 hours); upon expiry the section becomes available again.
- **Anti-overlap guarantee.** No two users hold an active assignment on the same `(datasetId, sectionIndex)` at the same time.
- **Backend guard against manual annotation on `generation` datasets.** Reserving or resuming a section on a dataset with `llm_mode = 'generation'` returns `409 llm_generation_blocks_annotation`. This single guard covers both entrypoints: the **Anotar** button (which is repurposed to launch US-33's modal) and direct navigation to `/annotations?datasetId=...`.

**Functional rules — "continue" decision tree.**

When the user clicks **continue** on a dataset, the server resolves one of six cases:

- **Case 0 — Empty dataset.** `Dataset.totalEntries = 0` → notice "nothing to complete".
- **Case 1 — Completed dataset.** 100% annotated and 100% reviewed → notice "dataset complete".
- **Case 2 — Pending review.** 100% annotated, review incomplete → notice "pending review".
- **Case 3 — No section available for the user.** Every non-annotated section held by another user → notice.
- **Case 4 — Active annotation session.** `ActiveSession` row exists → return the entry pointed by it.
- **Case 5 — No active session, sections available.** Assign the next free section, return its first entry.

**Functional rules — "send" button.**

- If the current entry is not the last in the section → advance `ActiveSession.entryNumber`.
- If it is the last → close the section assignment, clear the active session, congratulate the user, and offer **Exit** (`/datasets`) or **Continue** (open a new session on the next available section). **Continue** is hidden when no further sections are available.

**Functional rules — entry lifecycle.**

`Entry.status` starts at `pending` (schema default). Production transitions:

- `pending → annotated` when an annotation is saved with at least one sentence (same transaction in `replaceForAccessibleEntry`). Clearing every sentence reverts to `pending`.
- `annotated → reviewed | disputed` when `finalizeReview` closes the review.
- Re-annotating an entry that was already `reviewed`/`disputed` sets it back to `annotated`, but the review queue still excludes it while a terminal `Review` row exists, so a closed review is never silently re-opened.

**Acceptance criteria (Gherkin).**

- **Given** a dataset with `sectionSize = 7` and `totalEntries = 23`, **When** the section count is requested, **Then** it equals `ceil(23/7) = 4`; **And** the last section contains 2 entries.
- **Given** a user with no active session and a dataset with sections available, **When** they press **continue**, **Then** the next free section is assigned to them and the first entry is returned.
- **Given** all non-annotated sections held by other users, **When** the user presses **continue**, **Then** the case-3 notice is returned and no assignment is created.
- **Given** the user is on the last entry of their section, **When** they press **send**, **Then** the assignment is closed, the active session is cleared, and the response carries the **Exit**/**Continue** options.
- **Given** a `generation` dataset, **When** any path reserves or resumes a section, **Then** the response is `409 llm_generation_blocks_annotation`.

**Current status.** Implemented.

---

#### `US-05` — Writing Spanish sentences from RDF triples

**Story.** *As an* annotator, *I want* to write one or more Spanish sentences from the entry's triples, *so that* I produce training data.

**Value delivered.** Core function of corpus creation.

**Dependencies.** Dataset access, entry visualization, `Annotation` persistence.

**Functional rules.**

- The annotator can input one or several sentences per entry. Each one becomes an `Annotation` row keyed by `(entryId, datasetId, sentenceIndex)`.
- Saving **replaces** the previous version: `replaceForAccessibleEntry` deletes prior rows for the same entry and inserts the new ones inside the same transaction; the entry's `status` transitions to `annotated` if at least one sentence was saved, or back to `pending` if every sentence was cleared.
- The request wire format pairs each sentence with its optional rejection reason in a single object (no parallel arrays), removing the positional-pairing risk.

**Acceptance criteria (Gherkin).**

- **Given** an annotator with an active assignment, **When** they save `N` sentences, **Then** the entry has exactly `N` `Annotation` rows; **And** previous rows for that `(entryId, datasetId)` are gone.
- **Given** the annotator clears every sentence, **When** they save, **Then** every `Annotation` row for that entry is deleted **and** the entry's `status` reverts to `pending`.
- **Given** at least one saved sentence, **When** the transaction commits, **Then** the entry's `status` becomes `annotated`.

**Current status.** Implemented.

---

#### `US-06` — Spanish writing assisted by English reference

**Story.** *As an* annotator, *I want* to consult the English `<lex>` reference of the entry while writing, *so that* I disambiguate the intended meaning and write a correct Spanish version.

**Value delivered.** Reduces interpretive ambiguity and accelerates annotation.

**Dependencies.** Availability of English `<lex>` rows on the entry.

**Acceptance criteria (Gherkin).**

- **Given** an entry with at least one English `<lex>`, **When** the annotator opens it, **Then** the English text is visible alongside the triples.
- **Given** an entry without English `<lex>`, **When** the annotator opens it, **Then** no reference is shown and the annotator can still write Spanish from the triples alone.

**Current status.** Implemented.

---

#### `US-08` — Automatic alerts upon completion

**Story.** *As an* annotator, *I want* the system to warn me about spelling, grammatical and semantic problems before I save, *so that* I reduce defects before they reach the reviewer.

**Value delivered.** Filters defects upstream and trains the annotator.

**Dependencies.** Rule checker (`domain/spanish/*`), semantic checker via LLM (`utils/llm-client.js`), entry context (triples + English reference), `AnnotationAlertDecision` table.

**Functional rules.**

- Alerts cover **three** layers: spelling, grammar (syntax), and semantic / contextual coverage.
- Each alert exposes a suggestion when one can be derived.
- If the annotator decides to **dismiss** an alert, they must record a justification in `rejectionReason` (the `Annotation` row) and/or in `AnnotationAlertDecision.reason`, so the reviewer can revalidate later.
- `Annotation.isAcceptedFirstTry` is set to `false` if the annotator had to override or rework any alert.
- Semantic validation uses the triples and the English reference when available.
- Per-dataset LLM credential (US-31) takes precedence over the global credential when running the semantic layer.

**Acceptance criteria (Gherkin).**

- **Given** an empty sentence or a malformed input, **When** the rule checker runs, **Then** an alert is raised.
- **Given** a sentence with a spelling, grammatical or semantic issue, **When** the corresponding layer runs, **Then** an alert of the matching `alertType` is raised.
- **Given** the annotator dismisses an alert, **When** they save without a justification, **Then** the save is rejected and the annotator is asked for a reason.
- **Given** the annotator dismissed at least one alert during the session, **When** the annotation is saved, **Then** `Annotation.isAcceptedFirstTry = false`.

**Current status.** Implemented (the rule + LLM layers run; per-dataset credential routing implemented).

---

#### `US-09` — Validation of text coverage with respect to the triples

**Story.** *As an* annotator, *I want* the system to tell me whether my text covers the relevant information of the entry, *so that* I avoid incomplete or inconsistent annotations.

**Value delivered.** Reduces the rate of disputed reviews caused by missing semantic content.

**Dependencies.** Entry representation, contextual validation through the LLM layer, business rules.

**Functional rules.**

- Coverage is judged at the **sentence level**, delegated to the contextual LLM checker. A deterministic per-triple verdict (covered / missing / uncertain) was attempted and discarded.

**Acceptance criteria (Gherkin).**

- **Given** a sentence and the entry's triples, **When** the contextual checker runs, **Then** it returns a verdict and a textual reason that surfaces to the annotator as an alert when coverage is insufficient.
- **Given** the annotator dismisses a coverage alert, **When** they save, **Then** the dismissal is recorded with a `reason` for later review.

**Current status.** Partially implemented (sentence-level contextual validation only; per-triple verification not pursued).

---

#### `US-10` — Correction of linguistic and reference errors

**Story.** *As an* annotator, *I want* to apply the system's suggested corrections (or my own) to my text, *so that* I raise the final quality of the corpus.

**Value delivered.** Closes the alert → fix loop without leaving the page.

**Dependencies.** Annotation editor, automatic alert flow (US-08), `Annotation` persistence.

**Acceptance criteria (Gherkin).**

- **Given** an alert with a suggested correction, **When** the annotator accepts it, **Then** the sentence in the editor is updated and an `AnnotationAlertDecision` row is recorded with the applied sentence.
- **Given** an alert with no suggestion, **When** the annotator edits manually and re-runs validation, **Then** the alert clears if the edit solves it.

**Current status.** Implemented.

---

### 8.4 Review block

#### `US-13` — Per-phrase human evaluation by quality criteria

**Story.** *As a* reviewer, *I want* to judge every annotated phrase against fixed quality criteria and decide a single review-level diversity verdict per entry, *so that* the corpus is held to a deterministic quality standard.

**Value delivered.** Final quality assurance loop.

**Dependencies.** `Permit.isReviewer` (or `isModerator` for the global queue), `Review` / `ReviewDecision` / `ReviewComment`, `Annotation` rows, `constants/review-criterion.js` (`PHRASE_CRITERIA` + `REVIEW_CRITERIA`).

**Functional rules.**

- **Per-phrase criteria.** Every annotated sentence is judged independently against five criteria: *Naturalidad*, *Fluidez*, *Adecuación*, *Completitud*, *Cobertura*. Each phrase keeps its own decision per criterion; switching between phrases never loses state.
- **Review-level criterion.** *Diversidad* is decided **once per entry** (it is inherently comparative). With a single phrase it is shown inert ("no aplica") and excluded from the finalize gate.
- **Sequential wizard per phrase.** Until the current criterion is decided, the next one is locked. A decision targeting a criterion of a phrase whose earlier criteria are still undecided is rejected with `code: 'criterion_locked'`. Re-deciding an already-resolved criterion is allowed.
- **Binary decision.** **Sí** (`accepted`) commits immediately; **No** (`rejected`) reveals a mandatory **Motivo** (≤ 280 chars) and *Siguiente* to commit. A `rejected` decision with an empty motivo is rejected with `code: 'comment_required'`.
- **Mandatory inline correction.** A phrase criterion marked **No** requires the reviewer to correct that phrase inline. The corrected text is mandatory and must differ from the original (`code: 'invalid_correction'` otherwise). The correction's own comment is optional — the justification lives in the rejected criterion's Motivo.
- **Anti-self-review.** The review queue excludes any entry whose annotator equals the requesting reviewer. When this exclusion is the *only* reason a reviewer has nothing to review on a dataset (`review.blockedBySelfAnnotation = true`), the disabled **Revisión** button tooltip is *"Todas las entradas pendientes han sido anotadas por ti. Otra persona debe ser el revisor."*.
- **Exclusive assignment with expiry.** Once assigned, no other reviewer receives the same entry. The assignment expires after **2 hours** by default; expired reviews recycle automatically (`expireStaleReviews` runs before each `requestNextReview`). The reviewer can also **release** a review back to the queue.
- **Authorization for `POST /api/reviews/request`.** Moderators may pull from the global queue unconditionally. Normal users must scope by `datasetId` and have `Permit.isReviewer` on that dataset.
- **Automatic finalisation.** Once every phrase has its five criteria decided **and** (if applicable) Diversidad is resolved, the review closes to `completed` (all `accepted`) or `disputed` (any non-`accepted`), and `Entry.status` is propagated. Attempting to finalize earlier yields `code: 'criteria_incomplete'`. Disputed closures flip `Annotation.isAcceptedFirstTry = false` for every annotation of the same `(entryId, annotatorId)`.

**Acceptance criteria (Gherkin).**

- **Given** a reviewer with `Permit.isReviewer` on the dataset and at least one annotated entry not authored by themselves, **When** they `POST /api/reviews/request` with the dataset id, **Then** a review is assigned exclusively to them with `expiresAt = now() + 2 h`.
- **Given** an entry annotated by user `A`, **When** user `A` requests a review on it, **Then** the queue excludes that entry; **And** if the queue is empty for that reason only, the dataset card carries `review.blockedBySelfAnnotation = true`.
- **Given** an in-progress review, **When** the reviewer submits a decision on the second criterion of a phrase whose first criterion is undecided, **Then** the response is `409 criterion_locked`.
- **Given** a `rejected` decision, **When** submitted without `comment`, **Then** the response is `400 comment_required`.
- **Given** a phrase criterion marked **No**, **When** the reviewer corrects it with text equal to the original, **Then** the response is `400 invalid_correction`.
- **Given** every per-phrase criterion decided plus Diversidad (when more than one phrase), **When** the system auto-finalises, **Then** `Review.status` is `completed` (all `accepted`) or `disputed` (any non-`accepted`) and `Entry.status` is `reviewed` or `disputed` accordingly inside the same transaction.
- **Given** a review with at least one `rejected` decision, **When** finalised, **Then** every `Annotation` of the same `(entryId, annotatorId)` has `isAcceptedFirstTry = false`.

**Current status.** Implemented end to end (queue, exclusive assignment with 2 h expiry, per-phrase wizard, review-level Diversidad, inline corrections, automatic closure, release).

---

#### `US-12` — Review feedback visible to the annotator

**Story.** *As an* annotator, *I want* to see, over my own work, which criteria failed and which corrections the reviewer provided, *so that* I do not repeat the same errors.

**Value delivered.** Closes the annotator ↔ reviewer loop without operational meetings.

**Dependencies.** Closed `Review` rows with terminal status (`completed` or `disputed`), `ReviewDecision`, `ReviewComment`.

**Functional rules.**

- `GET /api/reviews/feedback` derives the annotator identifier **always from the session**. Any `annotatorId` sent in query string or body is ignored.
- Optional parameters: `datasetId` (positive integer), `limit` (defaults to 50). Anything else is ignored.
- Only reviews in **terminal status** (`completed` or `disputed`) are returned. In-flight states (`pending`, `in_progress`, `released`, `expired`) are not exposed.
- For each review the response carries `failedCriteria` (decisions whose `decision !== 'accepted'`, with their comment) and `corrections` (list of `ReviewComment` rows with original, corrected and justification text).

**Acceptance criteria (Gherkin).**

- **Given** two authenticated annotators, **When** one queries `GET /api/reviews/feedback` while passing the other's `annotatorId`, **Then** the response includes only the **session user's** feedback.
- **Given** an annotator with no closed reviews, **When** they query the endpoint, **Then** the response is `{ feedback: [] }` and the status is `200`.
- **Given** a closed `disputed` review with one rejected criterion and one inline correction, **When** queried, **Then** the response distinguishes between the failed criterion and the punctual correction.

**Current status.** Implemented.

---

### 8.5 AI and smart assistance block

#### `US-17` — Detection of potentially invalid translations

**Story.** *As an* annotator, *I want* the system to flag a sentence that appears incorrect with respect to the RDF context or the English reference, *so that* I catch errors before saving.

**Value delivered.** Reduces defective annotations reaching review.

**Dependencies.** Contextual checker (rules + LLM, US-08), per-dataset LLM credential (US-31).

**Acceptance criteria (Gherkin).**

- **Given** a sentence whose semantics deviate from the triples, **When** the contextual checker runs, **Then** an alert with the corresponding reason surfaces to the annotator.
- **Given** the annotator dismisses the alert, **When** they save, **Then** the dismissal is recorded as an `AnnotationAlertDecision` row with `reason` and `alertType = 'semantic'`.

**Current status.** Partially supported through the contextual rules + LLM layer.

---

#### `US-31` — Per-dataset AI credentials

**Story.** *As a* dataset administrator, *I want* to register, activate, delete and check one or more AI provider API keys per dataset, *so that* the AI-assisted validation of that dataset uses my credential and my quota, not the global one.

**Value delivered.** Decouples AI usage from the single global key. Each dataset can run assisted validation against its own provider.

**Dependencies.** Dataset admin authorization (`Permit.isAdmin/isOwned` via `assertDatasetAdminPermission`), the OpenAI-compatible client (`utils/openai-compatible-client.js`), the Anthropic-native client (`utils/anthropic-client.js`), the at-rest secret crypto helper (`utils/secret-crypto.js`), and `Dataset.llmMode`.

**Functional rules.**

- Endpoints under `/api/datasets/:id/llm-credentials/*`. Only a dataset administrator (admin or owner) can list, create, activate, delete or check.
- A dataset holds **at most one active credential**. Activating one deactivates the rest atomically. Uniqueness is `(datasetId, provider)`.
- The API key is **never** stored in clear text (AES-256-GCM at rest) and is **never** returned to the client: the masked DTO exposes `{ provider, apiBase, model, keyLast4, isActive }`. The key never appears in logs (`apiKey`/`api_key`/`credential` are redacted by the request log middleware).
- With `llmMode = 'none'` the credential panel is hidden, the listing returns `[]`, and write/check operations are rejected — defensively applied even though `llmMode` is fixed at creation today.
- The credential governs *which provider/key* is used; `llmMode` governs *whether* there is AI assistance.
- With an active credential, the dataset's `/check` flow uses that credential's `providerConfig`; with no active credential the global provider (`config.model`) is used.
- The **check** action calls the model with the prompt *"Respond \"I'm <model> and I am ready to work\""* (substituting the credential's `model`) using the decrypted key, and returns the model's free-text reply in `{ ok, message }`. On provider/network failure the response is `{ ok: false, error }` with no key leakage.

**Acceptance criteria (Gherkin).**

- **Given** a dataset admin, **When** they create a credential with `{ provider, apiBase?, model, apiKey }`, **Then** a row is persisted with the key encrypted; **And** the response DTO contains only the masked fields.
- **Given** an existing active credential of provider `X`, **When** the admin activates a credential of provider `Y`, **Then** `X` becomes inactive and `Y` becomes the sole active credential atomically.
- **Given** any read path (`GET`, logs, error messages), **When** inspected, **Then** the clear or encrypted key never appears — only `keyLast4`.
- **Given** `llmMode = 'none'`, **When** the admin lists credentials, **Then** the response is `[]`; **And** write/check operations are rejected.
- **Given** an active credential, **When** `POST /api/annotations/check` is called for that dataset, **Then** the call is routed to the configured provider with the decrypted key.
- **Given** a non-admin session, **When** any credential endpoint is called, **Then** the response is the same authorization error as other admin-only dataset endpoints.
- **Given** the admin presses **Comprobar** on a credential, **When** the model responds, **Then** the UI shows the response in a modal; **And** when the provider fails, the modal shows an error without leaking the key.

**Current status.** Implemented.

---

#### `US-35` — Pick the AI model from the provider's live catalogue

**Story.** *As a* dataset administrator, *I want* to pick the AI model from a live list of the active provider's available models (Groq, Google AI Studio, etc.) instead of typing it by hand, *so that* I avoid typos and stale model identifiers.

**Value delivered.** Removes typo-driven `model_not_found` errors and lets the admin discover what's available.

**Dependencies.** US-31 (per-dataset credentials), provider catalogue endpoints (`/models` on OpenAI-compatible providers and equivalents on others).

**Functional rules.**

- The credential creation/update form presents a **model selector** populated by a live call to the provider's catalogue endpoint, using the supplied key for authentication.
- When the catalogue is unavailable (network error, invalid key, unsupported provider response), the form surfaces a controlled error and does not silently fall back to a free-text input that could hide the failure.
- The provider's response is normalised to a flat list of model ids; the selector preserves the model id verbatim in `DatasetLlmCredential.model`.

**Acceptance criteria (Gherkin).**

- **Given** an admin filling the credential form with a valid key, **When** they pick a provider, **Then** the model field shows the live list of available model ids.
- **Given** a provider catalogue that fails (network or auth), **When** the admin opens the model selector, **Then** the form surfaces a controlled error explaining the failure.
- **Given** a model id picked from the live list, **When** persisted, **Then** `DatasetLlmCredential.model` equals the id verbatim.

**Current status.** Implemented for OpenAI-compatible providers and equivalents.

---

#### `US-33` — Automatic annotation by AI ("Generación por IA")

**Story.** *As a* dataset user on a dataset with `llmMode = 'generation'`, *I want* to launch an automatic annotation for N sections, *so that* the AI produces the Spanish sentences entry by entry and frees me to do other work.

**Value delivered.** For generation-mode datasets, the human becomes a consumer of AI output. A single click annotates N sections; failures are recoverable (retry / cancel) without losing the sections that already completed.

**Dependencies.** Per-dataset AI credential (US-31), dataset options at creation (US-19), `SectionAssignment` (reused as locks), the standard annotation persistence path (`annotations-service.saveSentences` → `replaceForAccessibleEntry`), the OpenAI-compatible / Anthropic / Ollama clients.

**Functional rules — entry point.**

- Only `llmMode = 'generation'` datasets change the **Anotar** behaviour: instead of opening the manual annotation page, the button opens the automatic-annotation modal. For `correction` and `none` the manual page still opens (no regression).

**Functional rules — modal.**

- The modal asks for *Número de secciones a anotar* (integer, 1–999). The input accepts only digits, enforces `maxLength = 3`, strips a leading `0`, and rejects `0` inline with **Mínimo 1**.
- If the dataset has **no active AI credential**, the **Confirmar** button is disabled and the message **No hay API activa. Configúrela para continuar.** is shown in red. The check is served by `GET /api/datasets/:id/llm-credentials/active-status`, readable by any user with a `Permit` (not admin-only).

**Functional rules — job orchestration.**

- The N sections to annotate are the **next N globally non-completed sections** of the dataset (same `maxSectionIndex + 1..N` rule the manual *continue* flow uses for case 5).
- All N sections are **locked atomically** in a single `prisma.$transaction` before any LLM call. If any lock cannot be taken, the whole job is aborted with one error message; partial locking is never observable.
- The job runs **asynchronously**. The start request returns as soon as the locks are taken; the **Anotar** button on the dataset row switches to **En curso**. The user can leave the page and come back: state is read on demand.
- Entries are annotated **one by one** (one prompt → one parsed response → one persist). Section completion reuses the same path the manual flow uses (`SectionAssignment → completed`, counters decremented/incremented depending on `isReviewEnabled`).
- A dataset can have at most one active auto-annotation job at a time. A second start attempt while a job is running is rejected with a controlled message inviting the user to open the **En curso** modal.

**Functional rules — in-progress modal.**

- Clicking **En curso** on a healthy job shows the *Anotación en curso* modal: progress (`Entries: x de total`, `Secciones: y de total_secciones`) and a single **Cerrar** button.
- On LLM failure (network, invalid output, etc.) the job pauses on the failing entry. The modal then shows the error and exposes:
  - **Reintentar** — resumes from the failed entry.
  - **Cancelar** — deletes the `Annotation` rows of the partially-annotated current section (and reverts those entries to `pending`), releases the section assignment, **keeps every previously-completed section as definitive**, and frees the **Anotar** button.

**Functional rules — durability.**

- Completed sections survive **server restarts** because they are persisted via the same path the manual flow uses; the in-memory job state does not. A server restart in the middle of a job leaves the section locks active until they expire (2 h), matching the manual-flow contract.

**Acceptance criteria (Gherkin).**

- **Given** a `generation` dataset, **When** the user clicks **Anotar**, **Then** the automatic-annotation modal opens with the spec'd field validation.
- **Given** a `correction` or `none` dataset, **When** the user clicks **Anotar**, **Then** the manual annotation page opens (no regression).
- **Given** the dataset has no active AI credential, **When** the modal opens, **Then** **Confirmar** is disabled and the configured red message is shown.
- **Given** `N` valid sections requested, **When** the start endpoint succeeds, **Then** exactly `N` `SectionAssignment` rows are created inside one transaction and the response is the initial job snapshot.
- **Given** a partial lock failure on any of the `N` sections, **When** the transaction is evaluated, **Then** the whole transaction rolls back and no `SectionAssignment` row is created.
- **Given** an LLM failure on the `k`-th entry of a section, **When** the worker traps the error, **Then** the job moves to `failed` with `lastError` set; **And** **Reintentar** resumes from the `k`-th entry; **And** **Cancelar** deletes the partial-section annotations, releases the remaining locks, and keeps every previously-completed section persisted.
- **Given** a server restart mid-job, **When** the user reopens the dataset list, **Then** the previously-completed sections are still persisted and the section locks remain until expiry.

**Current status.** Implemented.

---

### 8.6 Personal and administrative metrics block

#### `US-14` — Unified personal statistics (annotator + reviewer)

> This story **consolidates** the previously separate annotator-statistics (formerly `US-11`) and reviewer-statistics goals into a single "Mis estadísticas" page available to every authenticated user. The retired `US-11` identifier is documented in [Annex A](#annex-a--discontinued-user-stories) for traceability.

**Story.** *As an* authenticated user, *I want* to see metrics about my own annotation and review activity in one place, *so that* I know my throughput and pace without exposing or comparing to anyone else's data.

**Value delivered.** Gives each user a self-service view of throughput; surfaces the average time per task that US-21 also relies on.

**Dependencies.** Per-user `Annotation` rows, terminal `Review` rows, `SectionAssignment.timeSpentSeconds`, `Review.timeSpentSeconds`.

**Functional rules.**

- The page (`/my-stats`, `public/own-stads.html`) and the data source (`GET /api/me/stats`) always derive the user **from the session**; the request body and query string are ignored.
- **Global totals.** Distinct annotated entries (annotations), terminal reviews (`completed`/`disputed`), number of datasets annotated, number of datasets reviewed, average time per annotation, average time per review.
- **Per-dataset breakdown.** One row per dataset where the user has at least one annotation or review (strictly `> 0`), with that dataset's counts and per-task averages. Datasets with no activity are omitted.
- Averages are *total seconds ÷ task count*, floored. With no activity, the value is `null` and rendered as `—`.
- Annotation time recorded with no saved annotation does not skew the average (it is excluded from the numerator).

**Acceptance criteria (Gherkin).**

- **Given** two authenticated users `A` and `B`, **When** user `A` queries `GET /api/me/stats` while passing `userId=B` in any form, **Then** the response carries only `A`'s data.
- **Given** a user with 3 annotated entries on dataset `D1` and 0 on dataset `D2`, **When** they load the page, **Then** the per-dataset breakdown shows `D1` and **does not** include `D2`.
- **Given** a user with 10 annotated entries summing 600 seconds, **When** averages are computed, **Then** `avgAnnotationSeconds = 60`.
- **Given** section time was recorded on an assignment but no annotation was saved, **When** averages are computed, **Then** that section's time is excluded from the numerator.

**Current status.** Implemented end to end (prototype `prototypes/own-stads`, live page `public/own-stads.html`, `GET /api/me/stats`, time recording wired into the annotation `send` and review `finalize` flows).

---

#### `US-21` — Per-dataset administration statistics

**Story.** *As a* dataset administrator, *I want* to see, for my dataset, who annotated and who reviewed, each user's individual average time (separated by annotation and review), and a dataset-wide weighted average, *so that* I can track throughput and accountability.

**Value delivered.** Per-user accountability and a single dataset-wide pace figure, reusing the same time accumulators as US-14.

**Dependencies.** Dataset access (`findAccessibleById`), the statistics graph (`datasets-statistics-repository`), `SectionAssignment.timeSpentSeconds`, `Review.timeSpentSeconds`.

**Functional rules.**

- `GET /api/datasets/:id/statistics` returns two tables — **annotation** and **review** — for every user with at least one row in either dimension on that dataset.
- Each row carries: user identity (id, email), task count, percentage of the dataset, individual average time, and first-pass precision.
- Each table also carries a **weighted general average** (`Σ time ÷ Σ tasks`) so a user with more tasks contributes proportionally — surfaced as the "Media general (ponderada)" footer row.
- Annotation time comes from the user's `SectionAssignment.timeSpentSeconds`; review time from each `Review.timeSpentSeconds`.

**Acceptance criteria (Gherkin).**

- **Given** a dataset administrator, **When** they `GET /api/datasets/:id/statistics`, **Then** the response carries an `annotation` array and a `review` array with one row per active user in each dimension.
- **Given** users `A` and `B` with `A`: 3 min × 10 reviews and `B`: 6 min × 5 reviews, **When** the weighted general average is computed, **Then** it equals `((3·10)+(6·5))/15 = 4` minutes.
- **Given** a non-admin session over an accessible dataset, **When** they call the endpoint, **Then** the response succeeds (the endpoint is accessible to any user with access to the dataset).
- **Given** an inaccessible dataset, **When** they call the endpoint, **Then** the response is the standard accessible-dataset authorization error.

**Current status.** Implemented end to end.

---

### 8.7 Administration and governance block

#### `US-20` — Export of dataset progress (admin API)

**Story.** *As a* moderator, *I want* to export a dataset's persisted progress through the admin API, *so that* downstream pipelines can consume the dataset and its annotations in either JSON or XML.

**Value delivered.** Enables off-platform exploitation of the corpus and progress.

**Dependencies.** `requireApiModerator()`, `datasets-repository.findDatasetExportGraph`, `admin-service.exportDatasetProgress`.

**Functional rules.**

- `GET /api/admin/datasets/:id/export` accepts `?format=json` (default) or `?format=xml`.
- The JSON payload has shape `{ exportedAt, dataset: { id, name, totalEntries, progress }, entries: [...] }`. Each entry includes `triples`, `references` (the `Lex` rows), `annotations` (with `userEmail` for traceability), and the alert decisions of the annotator.
- The XML format is a hand-rolled emitter (`buildExportXml`) for downstream pipelines that consume WebNLG-style XML.
- An unknown `format` returns `400`.
- The endpoint is independent of the review subsystem: if no review exists for an entry, the relevant section is simply absent.
- An accessible `/api/datasets/:id/download` (US-29) and `/api/datasets/:id/download/annotated` (US-30) provide user-side downloads that do **not** require moderator capability.

**Acceptance criteria (Gherkin).**

- **Given** a moderator session, **When** they `GET /api/admin/datasets/:id/export` without format, **Then** the response is JSON with the canonical shape.
- **Given** `?format=xml`, **When** they `GET`, **Then** the response is a WebNLG-style XML body.
- **Given** an unknown `format`, **When** they `GET`, **Then** the response is `400`.
- **Given** a non-moderator session, **When** they `GET`, **Then** the response is `403`.

**Current status.** Implemented for moderators via the admin API. The user-side downloads (US-29, US-30) cover the most common end-user need.

---

#### `US-23` — Activity monitoring (gap)

**Story.** *As a* moderator, *I want* a consolidated view of per-user activity (annotation, review, dataset interactions) over a configurable time window, *so that* I can audit and react to operational anomalies.

**Value delivered.** Operational observability beyond raw request/error logs.

**Dependencies.** Request log files (US-25), 500-error log files (US-26), `Annotation`, `Review`, `SectionAssignment` data.

**Current status.** **Not implemented.** Raw request and error logs are written; no panel or endpoint aggregates them yet. See [§9 — Gaps](#9-known-gaps).

---

#### `US-24` — Configuration of evaluation criteria (gap)

**Story.** *As a* moderator, *I want* to add, edit, deactivate and reorder the criteria used by the review process from the admin surface, *so that* the catalogue can evolve without code changes.

**Value delivered.** Decouples the review criteria from a hardcoded constant file.

**Dependencies.** `EvaluationCriterion` table (already exists), `constants/review-criterion.js` (currently the source consumed by the reviewer UI).

**Functional rules (target).**

- The admin API exposes `GET/POST/PATCH /api/admin/evaluation-criteria`. Rows are never deleted: deactivation sets `isActive = false`. Every update increments `version` so historical `ReviewDecision.criterionCode` values keep their semantic anchor.
- The reviewer UI consumes the catalogue (per-phrase + review-level split) instead of the hardcoded constants.

**Current status.** **Not implemented end to end.** The CRUD endpoints exist and the table is persisted; the reviewer UI still consumes the fixed criteria in `constants/review-criterion.js`. See [§9 — Gaps](#9-known-gaps).

---

### 8.8 Operation and audit block

#### `US-25` — Request logging with payload

**Story.** *As an* operator, *I want* every request carrying form or JSON data recorded in an hourly file with sensitive fields redacted, *so that* I have traceable evidence of activity for debugging and auditing.

**Value delivered.** Operational traceability without exposing secrets.

**Dependencies.** `middlewares/request-log-middleware.js`, asynchronous serialised writer.

**Functional rules.**

- All logs live in the `logs/` folder.
- An hourly file `<year>-<month>-<day>-<hour>.txt` collects the requests of that hour.
- Each request records its timestamp as `<year>.<month>.<day>.<hour>.<minute>.<second>.<milliseconds>`.
- Only requests containing form or JSON data are recorded.
- **Sensitive fields are replaced with `[ommited]`** before writing. The redaction list covers at least: `password`, and the credential-related fields `apiKey`, `api_key`, `credential` (added in US-31; the legitimate `keyLast4` field is **not** masked).
- A single writer thread serialises writes per file in a multi-user environment; incoming requests are queued asynchronously.
- The file begins with a blank line and separates each request with a blank line.

**Acceptance criteria (Gherkin).**

- **Given** a request body `{ email, password }`, **When** logged, **Then** the file shows `password: '[ommited]'` while preserving the other fields verbatim.
- **Given** a request body `{ apiKey, model, keyLast4 }`, **When** logged, **Then** `apiKey` is `[ommited]` and `keyLast4` is preserved.
- **Given** two requests in the same hour, **When** logged, **Then** they appear in the same hourly file separated by a blank line.
- **Given** a request without form or JSON body, **When** processed, **Then** no log line is written for it.

**Current status.** Implemented.

---

#### `US-26` — Specific logging of 500 errors

**Story.** *As an* operator, *I want* every internal server error captured in a daily error file with method, route, code and reason, *so that* I can diagnose production failures quickly.

**Value delivered.** Faster incident triage.

**Dependencies.** Same asynchronous serialised writer as US-25.

**Functional rules.**

- The error file is named `<year>-<month>-<day>-error.txt` and lives in `logs/`.
- **Only** responses with status `500` are recorded; `403` and `404` are **not**.
- Each entry includes method, route, code, and error reason.

**Acceptance criteria (Gherkin).**

- **Given** an endpoint that returns `500`, **When** the middleware catches it, **Then** the daily error file has a new entry with method, route, `code: 500`, and `reason`.
- **Given** an endpoint that returns `403` or `404`, **When** processed, **Then** the daily error file does **not** receive any entry for it.

**Current status.** Implemented.

---

## 9. Known gaps

The capabilities below remain as **genuine gaps** at the time of writing. They are tracked here so they do not disappear from the functional plan:

- **US-23 — Activity monitoring panel.** Request and error logs are written, but no panel or endpoint aggregates them.
- **US-24 — Dynamic configuration of evaluation criteria.** The `EvaluationCriterion` admin CRUD exists, but the reviewer UI still consumes the fixed criteria in `constants/review-criterion.js`. The catalogue cannot yet express the per-phrase / review-level split.
- **US-22 — Front-end for server-role management.** The moderator-only endpoints `GET/PATCH /api/admin/users` are complete, but no roster page consumes them yet.
- **Second / additional review round.** `Dataset.hasAdditionalReviews` is persisted but inert — no second-round flow has been wired in.

The previously-flagged "missing" items (the human review flow, personal/admin statistics, exclusive section assignment, the dispute flow) are **implemented** today and documented in §8.4 and §8.6 above.

---

## 10. Main use cases

### CU-01 — Load a dataset and leave it ready for annotation
1. The moderator logs in.
2. Uploads a valid XML; chooses name, optional description, section size, LLM mode, review on/off and additional-reviews flag.
3. The system validates and persists dataset + entries + triples + lexes + links in one transaction.
4. The dataset becomes available to authorised users on the dataset list.

### CU-02 — Annotate a section of the dataset (manual flow)
1. The annotator logs in.
2. Consults the accessible datasets and clicks **Anotar** on a `none`/`correction` dataset.
3. The server resolves the *continue* decision (cases 0–5).
4. The annotator reads triples and English references, writes Spanish sentences, runs validation alerts, dismisses with justifications when relevant.
5. Saves the annotations; the entry transitions to `annotated` inside the same transaction.

### CU-03 — Auto-annotate a section by AI (US-33)
1. The user opens a `generation` dataset and clicks **Anotar**.
2. The modal asks for *N*; the system locks *N* sections atomically.
3. The worker drives entry by entry through the active per-dataset credential.
4. On failure, the user retries from the failing entry or cancels (rolling back the half-section).

### CU-04 — Detect a quality error before review
1. The annotator inputs a sentence.
2. The rule layer runs first; the contextual LLM layer runs when applicable.
3. The system surfaces alerts with reasons and suggestions; the annotator either fixes or dismisses with a justification.

### CU-05 — Review and correct an annotation
1. The reviewer accesses `/reviewer` and pulls the next review (dataset-scoped or global, depending on moderator status).
2. The reviewer drives the per-phrase sequential wizard plus the review-level Diversity criterion.
3. When a phrase criterion is rejected, the reviewer corrects the phrase inline.
4. The review auto-finalises once every criterion is decided, propagating to `Entry.status`.

### CU-06 — Audit an internal server failure
1. An endpoint returns `500`.
2. The middleware records the entry in the daily error file (US-26).
3. The technical team consults the trace for diagnosis.

### CU-07 — Download the corpus
1. Any user with `Permit` on a dataset opens the *Visualización del XML* tab.
2. Pressing **Original** downloads the dataset XML reconstructed from the persisted graph (US-29).
3. Pressing **Extendido** (enabled only on 100%-completed datasets) downloads the extended XML with Spanish annotations (US-30).

---

## 11. Recommended future extensions

- Initial generator of Spanish verbalisations from RDF for `correction` and `none` datasets (different from US-33, which serves `generation` only).
- Reviewer-driven dynamic criteria catalogue (closes US-24 end to end).
- Activity monitoring panel that aggregates request/error logs and operational events (closes US-23).
- Server-role roster page consuming the existing admin endpoints (closes the UI half of US-22).
- Second / additional review round driven by `Dataset.hasAdditionalReviews`.
- Productivity and coverage dashboard per role.
- Advanced administration of roles, permissions and teams.
- Operational observability with a panel over logs, errors and activity.

---

## 12. Conclusion

`lanbench` responds to a real need for supervised construction of Spanish corpora from RDF triples. The current functional base supports authentication, two-tier roles, dataset upload with declarative options, sectioned access, persistent annotation with AI-assisted validation per dataset, per-phrase human review with automatic finalisation, automatic AI annotation for generation-mode datasets, personal and administrative statistics, original and extended XML downloads, and operational auditing. The next natural priorities are to close the dynamic-criteria loop (US-24), build the activity monitoring panel (US-23), and ship the server-role roster page (US-22 front-end).

---

## Annex A — Discontinued user stories

The following identifiers from the first iteration are no longer active goals of the product. They are listed here only for traceability with prior planning artefacts; they are **not** part of scope and must not be implemented unless explicitly re-opened in a future iteration with a fresh story.

| ID | Original title | Reason for discontinuation |
|---|---|---|
| `US-07` | Editing automatically generated sentences | Tied to US-15/US-16. The draft generator was attempted (`business/spanish-draft-generator.js`) and discarded in a prior cleanup. The *Anotar* surface on `generation` datasets now relies on US-33's automatic flow instead. |
| `US-11` | Annotator-only personal statistics | **Consolidated** into [US-14](#us-14--unified-personal-statistics-annotator--reviewer), which serves every authenticated user (annotator and reviewer) from a single endpoint and page. |
| `US-15` | Automatic text generation from RDF | A draft generator and `POST /api/annotations/drafts` were attempted and removed. Not pursued by default; if revived, it should start from a new plan. |
| `US-16` | Automatic translation generation | Shared implementation with US-15 and discarded in the same iteration. Not pursued. |
| `US-18` | Detection of low linguistic diversity | `business/diversity-checker.js` was attempted and removed. Current validation is sentence-by-sentence; a multi-sentence diversity layer is not pursued without a firm use case. |

---

## Annex B — Mapping to TECHNICAL-DESIGN.md

| Story | Implementation reference |
|---|---|
| US-01, US-27, US-28 | TECHNICAL-DESIGN.md §2.2, §5 |
| US-19, US-32, US-34 | TECHNICAL-DESIGN.md §2.3, §8.8 |
| US-02, US-03, US-04, US-05, US-06, US-08, US-09, US-10 | TECHNICAL-DESIGN.md §3, §4.1 |
| US-12, US-13 | TECHNICAL-DESIGN.md §4.2, §4.4, §4.5 |
| US-17, US-31, US-35 | TECHNICAL-DESIGN.md §9 |
| US-33 | TECHNICAL-DESIGN.md §11 |
| US-14, US-21 | TECHNICAL-DESIGN.md §10 |
| US-20, US-22, US-24 | TECHNICAL-DESIGN.md §7 |
| US-29, US-30 | TECHNICAL-DESIGN.md §8 |
| US-25, US-26 | Hourly/daily log files under `logs/` |
