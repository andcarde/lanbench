# USER STORIES

## 1. Purpose of the document

This document defines the functional purpose of `lanbench`, its current scope, the priority user stories, and the dependency structure between capabilities. Its goal is to serve as a product reference to align development, functional validation, and future evolution of the system.

This document is the single source of functional reference for the product. It integrates and replaces:

- `documentation/user_stories.txt` (original stories per actor and associated functional rules)
- `documentation/user_stories.md` (stories about the two-level role model and moderator registration with single-use code)
- `documentation/log-requeriments.txt` (operational and error logging requirements)
- the actual structure of the repository and its current implementation

## 2. Project goal

`lanbench` is a web platform to generate, annotate, validate, and manage Spanish text from RDF triples, using WebNLG-style datasets as a base. The system is oriented to producing high-quality training data for natural language generation, assisted translation, and linguistic evaluation tasks.

The main goal of the project is to reduce the manual effort of corpus construction while keeping human control over quality and enabling collaboration between several profiles:

- annotators
- reviewers
- administrators
- an automatic assistance component based on rules and AI models

## 3. What it is for

The platform serves to:

- transform RDF structures into Spanish texts useful for training and evaluation
- organize collaborative work on datasets divided into manageable units
- validate linguistic and semantic quality of the produced sentences
- preserve operational traceability through request and error logs
- ease dataset administration and tracking of annotation progress

## 4. What the goal is based on

The system's goal is based on four foundations:

1. The need to create high-quality Spanish corpora from RDF structures.
2. The use of WebNLG-style datasets as a structured source of triples, entries, and textual references.
3. The combination of human supervision and artificial intelligence to improve productivity without losing quality control.
4. The need to operate in multi-user environments with traceability, validation, and separation of responsibilities.

## 5. Functional scope of the product

### 5.1 Expected scope at the business level

The product is conceived to cover the following workflow:

1. An administrator brings an RDF dataset into the system.
2. An annotator accesses a section of the dataset and generates or corrects Spanish sentences.
3. The system validates the basic and semantic quality of those sentences.
4. A reviewer evaluates and corrects the result to ensure final quality.
5. The system keeps an operational record of the process and allows the resulting dataset to be exploited.

### 5.2 Scope supported by the current implementation

In the current state of the repository, the system clearly supports:

- registration and login
- access control by session and role
- XML dataset upload by administrators
- storage of datasets and their entries in the database
- consultation of accessible datasets
- consultation of dataset sections in blocks of 10 entries
- sentence validation through rules and semantic checking assisted by Ollama
- saving annotations per user and entry
- request traceability with input logs and 500 error logs
- download of the dataset XML from the "Visualización del XML" tab: the original XML and, on fully completed datasets, an extended XML with the Spanish annotations added

## 6. Software architecture used

The solution uses a modular monolithic layered architecture, implemented on Node.js and Express.

### 6.1 Architectural style

- Modular monolith with clear separation of responsibilities.
- Layered architecture: routes, controllers, business services, repositories, entities, and utilities.
- Relational persistence on MySQL/MariaDB via Prisma.
- Session management with `express-session`.
- Smart validation integration through an external semantic component based on Ollama.

### 6.2 Main layers

#### Presentation and transport

- `routes/`: exposes web and API endpoints.
- `middlewares/`: authentication, access control, file upload, and logging.
- `app.js`: composition of routes, middleware, error handling, and server startup.

#### Application and business

- `business/`: controllers and functional orchestration logic.
- `services/`: domain and application services.
- `contracts/`: DTO mapping for the API.

#### Persistence

- `repositories/`: data access.
- `prisma/schema.prisma`: data model.
- `database/lanbench.sql`: supporting SQL base.

#### Domain and utilities

- `entities/`: main domain entities.
- `utils/`: XML reading, XML writing, validators, Ollama client, and helper utilities.
- `constants/`: roles, section sizes, and functional configuration constants.

### 6.3 Relevant architectural decisions

- Datasets are treated as manageable units and also as a persisted graph of entries and triples.
- Annotation is associated with user, entry, and sentence position.
- Validation combines a fast rule-based layer with an AI-assisted semantic layer.
- Logging is resolved through asynchronous serialized writing to a file, which addresses the multi-user environment requirement.

## 7. Dependencies between capabilities

The stories are not independent. The value of the system appears when certain capabilities exist before others.

### 7.1 Main dependency chain

1. User and session management.
2. Role and permission control.
3. Dataset upload and storage.
4. Dataset access and section segmentation.
5. Sentence annotation.
6. Automatic validation.
7. Human review.
8. Statistics, export, and tracking.

### 7.2 Key dependencies

- Without authentication there is no traceability per user.
- Without permissions there cannot be safe work distribution.
- Without dataset uploading there is no base to annotate on.
- Without sectioning, multi-user work cannot scale.
- Without validation, the corpus quality goal cannot be achieved.
- Without human review, the quality assurance cycle does not close.
- Without logs, there is no operational audit sufficient to diagnose server errors.

## 8. Professional breakdown of the documentation work

To produce and maintain this document with professional quality, the work can be divided into the following tasks:

1. Analyze the source of functional requirements per actor and goal.
2. Identify capabilities actually implemented in the code.
3. Separate target scope from current scope.
4. Define the architecture and its relationship with the requirements.
5. Write simple user stories.
6. Expand into detailed stories with value, flow, rules, and acceptance criteria.
7. Document cross-cutting use cases.
8. Document exclusions, limits, and opportunities for evolution.

This sequence reduces ambiguity, avoids contradictions, and improves the maintainability of the document.

## 9. User stories in simple version

### 9.1 Annotator

- `US-01`: As an annotator, I want to register and log in to access the annotation platform.
- `US-02`: As an annotator, I want to see a list of available datasets to select which one to work on.
- `US-03`: As an annotator, I want to view a set of RDF triples in a natural way to understand the information to verbalize.
- `US-04`: As an annotator, I want to receive triples grouped into work sections.
- `US-05`: As an annotator, I want to write Spanish sentences from RDF triples to generate training data.
- `US-06`: As an annotator, I want to write Spanish sentences from English to generate training data.
- `US-07`: As an annotator, I want to edit automatically generated sentences to correct errors.
- `US-08`: As an annotator, I want to receive automatic alerts upon finishing an annotation to correct errors.
- `US-09`: As an annotator, I want to validate whether a text covers all the triples to ensure quality.
- `US-10`: As an annotator, I want to correct linguistic and reference errors in the generated texts.
- `US-11`: As an annotator, I want to see statistics of my work to know my progress.
- `US-12`: As an annotator, I want to see errors detected during review so I don't repeat them.

### 9.2 Reviewer

- `US-13`: As a reviewer, I want to evaluate generated texts based on quality criteria to measure their adequacy.
- `US-14`: As a reviewer, I want to see statistics of my work to know my progress.

### 9.3 System or AI agent

- `US-15`: As a system, I want to generate text automatically from RDF triples to assist annotators.
- `US-16`: As a system, I want to generate translations automatically from RDF triples to assist annotators.
- `US-17`: As a system, I want to generate alerts when I detect that a translation may be invalid.
- `US-18`: As a system, I want to detect low linguistic diversity between sentences.

### 9.4 Administrator

- `US-19`: As an administrator, I want to upload RDF datasets to use them on the platform.
- `US-20`: As an administrator, I want to download dataset progress to use it outside the platform.
- `US-21`: As an administrator, I want to see global statistics on coverage, errors, and disputes.
- `US-22`: As an administrator, I want to manage user roles.
- `US-23`: As an administrator, I want to monitor user activity.
- `US-24`: As an administrator, I want to configure custom evaluation criteria.
- `US-31`: As a dataset administrator, I want to register, activate and check my own AI provider API keys for a dataset so its AI-assisted validation uses my credential instead of the global one.
- `US-32`: As a dataset administrator, I want to name a dataset on creation (defaulting to the file name) and rename it later from the administration page, with names kept unique per owner, so datasets stay identifiable.
- `US-34`: As a dataset administrator, I want to attach an optional short description to a dataset on creation so the visualization page shows what the dataset is about under its name.
- `US-35`: As a dataset administrator, I want to pick the AI model from a live list of the provider's available models (Groq, Google AI Studio) instead of typing it by hand, with clear errors when the provider's catalog is unavailable.

### 9.5 Operation and audit

- `US-25`: As a system, I want to record requests with payload to have operational traceability.
- `US-26`: As a system, I want to record 500 errors in a specific file to ease technical diagnosis.

### 9.6 Moderator registration

- `US-27`: As a visitor with a moderator code, I want to register directly as a moderator to access the administration surface without operational intervention.
- `US-28`: As an operator, I want to generate batches of single-use codes to distribute among those who must register as moderators.

### 9.7 Dataset visualization downloads

- `US-29`: As a user with access to a dataset, I want to download the original XML from the "Visualización del XML" tab so I can inspect or reuse it outside the platform.
- `US-30`: As a user with access to a fully completed dataset, I want to download the extended XML with the Spanish annotations added so I can reuse the annotated corpus.

## 10. User stories in detailed version

### 10.1 Access and security block

#### Two-level role model

`lanbench` separates two role concepts that combine but never collapse into a single string:

1. **Server roles** — the user's global capability over the whole application. They live in the `users` table. There are exactly two: `normal` (default) and `moderator` (elevated, can create datasets, access the admin API, manage criteria, etc.). They are stored as the boolean column `is_moderator` (`false` → `normal`, `true` → `moderator`).
2. **Dataset roles** — per-dataset capability that a specific user has over a specific dataset. They live in the `permits` table as the boolean columns `is_owned`, `is_annotator`, `is_reviewer`, `is_admin`.

The effective capability on each screen is the *combination* of the server role and the dataset role that applies to the resource. A user with `is_moderator = true` does **not** automatically gain any dataset role: they still need a row in `permits` to act on a specific dataset. Server-level actions reserved for moderators (listing all datasets in the admin API, creating datasets, etc.) do not require an entry in `permits`. The session and the DTOs expose `isModerator: boolean` (no `role` string).

#### `US-01` Annotator registration and login

**Description**  
The annotator must be able to create an account and log in to access protected functions.

**Value delivered**  
Allows identifying the user, associating their work, and applying permissions by role.

**Dependencies**  
User model, persistence, session, and authentication middleware.

**Acceptance criteria**

- The user can register with a valid email and password.
- The system prevents duplicate registrations.
- The authenticated user keeps an active session.
- Protected routes reject access without a valid session.
- A user created through the public registration form has `is_moderator = false` in the database. The client cannot influence that value from the body (any `isModerator` or `role` sent is ignored). Elevation to moderator is covered in `US-27`.

### 10.2 Datasets block

#### `US-02` Consultation of available datasets

**Description**  
The annotator must be able to see the datasets they have access to.

**Value delivered**  
Allows starting annotation work on authorized material.

**Dependencies**  
Authentication, permissions, and dataset repository.

**Acceptance criteria**

- The system only shows datasets accessible to the user.
- Each dataset exposes basic information useful for selection.
- Access without a valid session returns an authorization error.

#### `US-03` Understandable visualization of RDF triples

**Description**  
The annotator needs to see triples, context, and textual references to produce correct text.

**Value delivered**  
Reduces ambiguity and improves semantic coverage.

**Dependencies**  
XML parser, persistence of entries, and dataset DTOs.

**Acceptance criteria**

- Each entry shows its triples and main metadata.
- The English source sentences can be used as contextual reference.
- The representation makes it easier to understand subject, predicate, and object.

#### `US-04` Segmentation of the dataset into work sections

**Description**  
The dataset must be divided into blocks of a declarative, per-dataset section size (default 10 entries) to organize the work.

**Value delivered**  
Makes the task manageable and favors multi-user operation.

**Dependencies**  
Dataset loading, entry counting, and sectioning logic.

**Specific functional rules**

- The dataset is divided into sections of `Dataset.sectionSize` entries each (the value chosen on the *Nuevo dataset* form, defaulting to 10).
- The section is the minimum unit of work assigned to an annotator.
- The sectioning mechanism guarantees exclusive access to a subset of the dataset, preventing overlap in multi-user environments where several annotators work in parallel on the same dataset.

**Acceptance criteria**

- The system returns the requested section when it exists.
- The system reports the total number of sections and entries.
- A request for a non-existent section is rejected with a controlled error.

**Section size and count**

- The **section size** is a declarative, optional input on the *Nuevo dataset* form: a positive integer, **defaulting to 10**, persisted per dataset (`Dataset.sectionSize`). Missing / non-positive values are coerced to 10, and legacy datasets without the column fall back to 10 (`constants/datasets.js#resolveSectionSize`).
- The dataset is divided into `ceil(entries / sectionSize)` sections (integer division rounded up).
- If the number of entries is a multiple of `sectionSize`, all sections have that many entries; otherwise, the last section contains the remainder.

**Functional flow when pressing "continue" on a dataset**

When pressing "continue" on the tasks page, the server evaluates the state of the dataset and the user to decide what is loaded or what notice is displayed:

- **Case 0 — Empty dataset.** There are no entries. The system displays a notice indicating there is nothing to complete.
- **Case 1 — Completed dataset.** The dataset is 100% annotated and 100% reviewed. A modal message indicates this.
- **Case 2 — Dataset 100% annotated, pending review.** All sections are annotated but the review is not complete. A modal message indicates this.
- **Case 3 — Incomplete dataset with no sections available for the user.** There are unannotated sections, but all are assigned to other users different from the current one. A modal message indicates this.
- **Case 4 — User with active annotation session.** There is an active annotation session of the user over a section of the dataset. The system returns the entry corresponding to that session, along with the section number and entry number.
- **Case 5 — Without active session and with sections to assign.** The user has no active session over the dataset and there are still unassigned sections. The next free section is assigned to the user and its first entry is returned. If no free sections remain, the corresponding error message is displayed.

**Behavior of the "send" button during annotation**

- If the current entry is **not** the last one in the section, the next entry of the section is loaded.
- If it **is** the last one, the user's active session over that section is closed and a message appears congratulating the user for finishing the session, with two options:
  - **Exit**: redirects to `/datasets`.
  - **Continue**: opens a new session over the next available section of the same dataset. The "Continue" button does not appear when there are no more available sections.

**Entry point to annotation from the dataset view page**

- The dataset view page (`/datasets/:id/view`) is a read-only viewer of the XML content; it no longer exposes an "Abrir anotación" entry point. The annotation flow is launched exclusively from the dataset list (`/datasets`) via the **Anotar** button on each dataset card, which carries the per-dataset rules (LLM mode, credential availability, completion state).

**Annotation blocked for `generation` datasets**

- When the dataset's `llmMode === 'generation'`, the manual annotation flow is disabled for every user regardless of their annotation permission: those entries are produced by the LLM (see `US-33`), not by humans.
- Attempting to reserve a section (`POST /api/annotations/:datasetId/continue`) returns `409 llm_generation_blocks_annotation` with the message *"Este dataset se anota automáticamente por IA; la anotación manual no está disponible."*. The same error fires when the annotation page (`/annotations?datasetId=...`) tries to resolve the active session, so the page cannot enter the editing flow.
- The dataset list reflects the block by repurposing the **Anotar** button to launch the automatic-annotation modal (US-33) instead of the manual flow.

> Implementation details (tables, keys, assignment algorithm) are documented in [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md).

**Lifecycle of an entry**

`Entry.status` starts at `pending` (schema default). The transitions actually applied by production code today are:

- **`pending` → `annotated`**: when an annotation is saved with at least one sentence. The transition runs inside the same transaction that persists the rows (`repositories/annotations-repository.js#replaceForAccessibleEntry`); clearing every sentence reverts the entry to `pending`. This is what makes an entry eligible for the review queue.
- **`annotated` → `reviewed` / `disputed`**: when closing a review. `reviews-service.finalizeReview` leaves it at `reviewed` (all criteria `accepted`) or `disputed` (any `rejected`/`needs_fix`).

The review queue queries (`repositories/reviews-repository.js#findReviewableEntries`, `repositories/datasets-repository.js#findReviewableEntryDatasetIds`) filter by `status: 'annotated'` **and** `dataset.isReviewEnabled = true`, so only annotated entries of review-enabled datasets are offered. The `constants/entry-status.js` catalog also enumerates `in_progress` and `under_review`, but **no production flow applies those two today**: they remain planned states without a writer.

> Re-annotating an entry that was already `reviewed`/`disputed` sets it back to `annotated`, but the queue still excludes it while a terminal `Review` row exists, so a closed review is never silently re-opened.

#### `US-19` Upload of RDF datasets by the administrator

**Description**  
The administrator must be able to import a valid XML to convert it into a manageable dataset.

**Value delivered**  
Opens the complete workflow of the product.

**Dependencies**  
Administrator role, file upload, XML parser, repository, and database.

**Acceptance criteria**

- Only an administrator can upload datasets.
- The system validates that the XML is correct and contains entries.
- The system persists dataset, entries, triples, and relevant metadata.
- Import errors are reported in a controlled way.

**Dataset name (Nuevo dataset form)**

The form asks for a **Nombre del dataset** (`name`):

- The field **defaults to the uploaded file name** (without the `.xml` extension); the administrator may edit it before creating.
- A dataset name must be **unique per owner**: creating (or renaming, see `US-32`) to a name already used by another dataset **owned by the same user** is rejected with a controlled message (`409 duplicate_dataset_name`); the form keeps open and surfaces the reason inline.
- When no name is provided (e.g. a non-UI client), the server falls back to the file-derived name.

**Creation options (Nuevo dataset form)**

The form exposes four declarative options, persisted on the dataset:

- **Tamaño de sección** (`sectionSize`): positive integer, default `10` (see `US-04`).
- **Uso de LLMs** (`llmMode`): `none` / `generation` / `correction`.
- **Revisión** (`isReviewEnabled`): enables the review workflow.
- **Revisiones adicionales tras corrección** (`hasAdditionalReviews`).

The last three are **coupled by two invariants**, enforced both in the UI (show/hide + lock the controls on change) and **defensively on the server** (`services/datasets-service.js#normalizeDatasetCreationOptions`). Policy: **NORMALISE, never reject** — a crafted request that violates the rules is silently coerced to the valid combination, so an illegal state can never be persisted.

- **R1** — When *Revisión* is **No**, *Revisiones adicionales* is meaningless: it is hidden in the form and forced to `false` in the payload. When *Revisión* is **Activa**, the field is shown.
- **R2** — When *Uso de LLMs* is **Corrección por IA** (`llmMode = 'correction'`), *Revisión* is forced to `true` and *Revisiones adicionales* is forced to `true`; both are shown but **locked** (not alterable).

#### `US-20` Export of dataset progress

**Description**  
The administrator must be able to obtain the dataset content and its progress for external use.

**Value delivered**  
Allows exploiting the work outside the platform and maintaining interoperability.

**Dependencies**  
Consistent dataset persistence and XML serialization.

**Current status**

- A query of the dataset text exists.
- Formal export of administrative progress is not yet closed as a complete product flow.

#### `US-29` Download of the original XML from the visualization tab

**Description**  
Any user with access to a dataset must be able to download the original RDF XML from the "Visualización del XML" tab.

**Value delivered**  
Allows external inspection and reuse of the source dataset without requiring administrative access or the admin export flow.

**Dependencies**  
Dataset access (`Permit`), persisted dataset graph, XML serializer (`utils/dataset-xml.js`).

**Specific functional rules**

- The download is exposed as a button labelled `Original` (with a download icon) in the header of the "Visualización del XML" card, next to the read-only badge.
- The downloaded file is the dataset XML **reconstructed from the persisted graph** — the same content the read-only viewer already shows through `GET /api/datasets/:id/text`. It is not guaranteed to be byte-identical to the originally uploaded file.
- The file name is `<Dataset.name>.xml`, where `Dataset.name` is the value persisted on registration (already derived from the original filename minus the `.xml` extension).
- The HTTP response sets `Content-Type: application/xml; charset=utf-8` and `Content-Disposition: attachment; filename="<Dataset.name>.xml"`.

**Acceptance criteria**

- A user with `Permit` over the dataset can press `Original` and receive a `.xml` file whose body matches the viewer content.
- A user without `Permit` over the dataset receives the same authorization error as any other accessible-dataset endpoint.
- The downloaded file name is `<Dataset.name>.xml`.
- An empty dataset (no entries) is reported with the same controlled error (`dataset_without_entries`) used by `GET /api/datasets/:id/text`.

#### `US-30` Download of the extended XML with Spanish annotations

**Description**  
Any user with access to a fully completed dataset must be able to download an extended XML that contains the original content plus the Spanish annotations stored on the platform.

**Value delivered**  
Closes the corpus production loop: the Spanish annotations stop living only in the database and become a portable, reusable XML corpus.

**Dependencies**  
Dataset access (`Permit`), persisted `Annotation` rows, dataset completion counters, XML serializer extended with Spanish lex pairing (see [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md)).

**Specific functional rules**

- The download is exposed as a button labelled `Extendido` (with a download icon) in the same card header, next to the `Original` button.
- The `Extendido` button is **disabled** while the dataset is below 100% completion; an inline tooltip explains the requirement.
- "100% completed" is defined as `sectionsCompleted === ceil(totalEntries / 10) && sectionsPending === 0` on the dataset row. The frontend reads completion from the same payload used by the dataset card; the backend re-checks the condition before serving the file.
- The file name is `<Dataset.name>-extended.xml`.
- The extended XML mirrors the original XML structure entry by entry; for each entry, Spanish `<lex>` entries (`lang="es"`) are added from the persisted `Annotation` rows. The pairing rule with the existing English `<lex>` entries is documented in [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md).
- The HTTP response sets `Content-Type: application/xml; charset=utf-8` and `Content-Disposition: attachment; filename="<Dataset.name>-extended.xml"`.

**Acceptance criteria**

- A user with `Permit` over a 100%-completed dataset pressing `Extendido` receives the extended XML.
- A user with `Permit` over a non-completed dataset receives `409` `dataset_not_completed` from the endpoint, and the button is rendered disabled in the UI.
- Every Spanish `<lex>` entry in the output corresponds to a persisted `Annotation` row for that entry; no Spanish lex without a matching annotation appears.
- Pairing rule (deterministic order by `Annotation.sentenceIndex`):
  - If the entry has an English `<lex>` at the same position as the annotation's `sentenceIndex`, the new Spanish lex reuses that English lex's `lid` (e.g. `Id1`, `Id2`).
  - Otherwise the Spanish lex is "free" and uses `lid="id<sentenceIndex+1>"` (lowercase `id` prefix).

### 10.3 Annotation block

#### `US-05` Writing Spanish sentences from RDF triples

**Description**  
The annotator writes Spanish sentences from the triples of the entry.

**Value delivered**  
It is the central function of corpus creation.

**Dependencies**  
Dataset access, entry visualization, and annotation persistence.

**Acceptance criteria**

- The user can input one or several sentences.
- Each sentence is associated with the entry, the user, and its position.
- Saving replaces the previous version of the same user for that entry.

#### `US-06` Spanish writing assisted by English reference

**Description**  
The annotator can rely on English source sentences to produce a correct Spanish version.

**Value delivered**  
Reduces interpretive ambiguity and accelerates annotation.

**Dependencies**  
Availability of English `lexes` or source references.

**Acceptance criteria**

- The English reference is available when it exists in the dataset.
- The annotator can use it as support without losing focus on RDF coverage.

#### `US-07` Editing automatically generated sentences

**Description**  
The annotator must be able to correct an automatic proposal before saving it.

**Value delivered**  
Combines productivity with human control.

**Dependencies**  
Previous automatic generation and annotation editor.

**Current status**

- Automatic validation exists.
- Automatic generation of sentences is not implemented as a complete capability in this version.

#### `US-08` Automatic alerts upon completion

**Description**  
The system must warn about spelling, grammatical, or semantic errors.

**Value delivered**  
Reduces defects before human review.

**Dependencies**  
Rule checker, semantic checker, and entry context.

**Specific functional rules**

- Alerts must cover spelling, grammatical (syntax), and semantic errors.
- If the annotator decides to skip an alert, they must explain the reason for each omission.
- Omission justifications remain available so the reviewer can revalidate them later.

**Acceptance criteria**

- The system detects empty sentences and basic format failures.
- The system covers the three types of alert: spelling, grammatical, and semantic.
- The system can suggest corrections.
- Semantic validation uses triples and English reference when available.
- Each skipped alert is recorded with its justification for human review.

#### `US-09` Validation of text coverage with respect to the triples

**Description**  
The annotator needs to know whether the text covers the relevant information of the entry.

**Value delivered**  
Avoids incomplete or inconsistent annotations.

**Dependencies**  
Entry representation, contextual validation, and business rules.

**Current status**

- Basic textual and contextual validation exists.
- **Deterministic per-triple verification** (an explicit verdict of covered / missing / uncertain for each triple) was attempted as `business/triple-coverage-checker.js`; it was removed in a prior cleanup (the `AUDITORY-3.md` snapshot that documented it is no longer in the tree — see `PROBLEMS.md §4`). It is not pursued in the current roadmap: validation stays at the sentence level and delegates full coverage to the contextual LLM.

#### `US-10` Correction of linguistic and reference errors

**Description**  
The annotator can correct spelling, grammatical, semantic, or RDF-alignment errors.

**Value delivered**  
Raises the final quality of the corpus.

**Dependencies**  
Annotation editor, automatic validation, and persistence.

### 10.4 Review block

#### `US-12` Review feedback visible to the annotator

**Description**  
The annotator must see, over their own work, which criteria failed and which corrections the reviewer provided, so as not to repeat the same errors.

**Value delivered**  
Closes the annotator ↔ reviewer loop without operational meetings and teaches the annotator from the corrected texts.

**Dependencies**  
Closed review flow (US-13), `Review` with terminal `status` (`completed` or `disputed`), `ReviewDecision`, and `ReviewComment`.

**Specific functional rules**

- The `GET /api/reviews/feedback` endpoint derives the annotator identifier **always from the session**, never from query string or body. Even if the client sends an `annotatorId`, it is ignored. This prevents an annotator from querying another's reviews.
- The optional `datasetId` filter and the `limit` are the only accepted parameters.
- Only reviews in terminal status (`completed` or `disputed`) are returned. Pending or released ones are not exposed.
- For each review, the `failedCriteria` (decisions other than `accepted`) and the `corrections` (original sentence, corrected sentence, and comment) are included.

**Acceptance criteria**

- Two authenticated annotators never see each other's feedback, even by manipulating query strings.
- An annotator with no closed reviews receives `{ feedback: [] }` (not an error).
- The payload distinguishes between a punctual sentence correction and a failed criterion without corrected text.

#### `US-13` Human evaluation by quality criteria

**Description**  
The reviewer must evaluate each text considering naturalness, fluency, adequacy, completeness, coverage, and diversity.

**Value delivered**  
Introduces a final layer of quality assurance.

**Dependencies**  
Role-based authentication, access to annotations, review flow, and persistence of changes.

**Specific functional rules**

- Evaluation is **per phrase**: every annotated sentence of the entry is judged independently against the five per-phrase criteria — Naturalidad, Fluidez, Adecuación, Completitud, Cobertura. Each phrase keeps its own decision per criterion, so switching between phrases never loses state. Clicking a phrase (or focusing it and pressing Enter/Space) drives the criteria panel for *that* phrase.
- There is **one review-level criterion**, Diversidad, decided **once for the whole entry** (it is inherently comparative across phrases). It only applies when the entry has more than one phrase; with a single phrase it is shown inert ("no aplica") and excluded from the finalize gate.
- Within a phrase the criteria are a **sequential wizard**: until the current criterion is decided, the next one stays locked. Sending a decision for a criterion of that phrase whose earlier criteria are not yet decided is rejected with `code: 'criterion_locked'`. The wizard allows **going back and rewriting** a decision already made on an earlier criterion of the same phrase.
- The decision is **binary**: **Sí** (`accepted`) commits immediately; **No** (`rejected`) reveals a mandatory **Motivo** (≤ 280 characters) and a *Siguiente* to commit. A `rejected` decision without a motivo is rejected with `code: 'comment_required'`.
- A phrase criterion marked **No** requires the reviewer to **correct that phrase** inline. The corrected text is mandatory and must differ from the original (`code: 'invalid_correction'` otherwise). The correction itself does **not** carry its own comment — the justification lives in the rejected criterion's Motivo, which is what is returned as feedback to the annotator.
- A reviewer **cannot review their own annotations**: the review queue excludes any entry whose annotator matches the requesting reviewer. It is a governance rule that prevents self-review. When this exclusion is the *only* reason a reviewer has nothing to review on a dataset (the dataset card carries `review.blockedBySelfAnnotation = true`), the disabled **Revisión** button explains it via tooltip ("Todas las entradas pendientes han sido anotadas por ti. Otra persona debe ser el revisor.") instead of the generic "no sections pending review" — so a single annotator-reviewer understands they need a second person to review.
- The review is exclusive: once assigned, no other reviewer receives the same entry. The assignment expires by default after **2 hours**; upon expiration it becomes available again to other reviewers. The reviewer can also **release** an in-progress review back to the queue.
- **Finalization is automatic**: once every phrase has its five criteria decided **and** the review-level Diversidad is resolved (when it applies), the review closes to `completed` (everything `accepted`) or `disputed` (any `rejected`), propagating to `Entry.status`. Attempting to finalize earlier is rejected with `code: 'criteria_incomplete'`.

**Current status**

- Per-phrase review flow implemented end to end: dataset-scoped or global queue, exclusive assignment with expiry, per-phrase sequential wizard, the review-level Diversidad criterion, inline corrections, automatic closure with terminal mark in `Entry.status`, and release back to the queue.
- The reviewer page (`/reviewer`) consumes `phraseCriteria` / `reviewCriteria` from the review context and posts decisions carrying the evaluated `sentenceIndex` (`null` for the review-level criterion). See [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) §4.2.

#### `US-14` Personal statistics (annotator + reviewer)

**Description**  
Each user must see metrics about their own activity — both annotation and
review — so they know their progress. This unifies `US-11` (annotator
statistics) and `US-14` (reviewer statistics) into a single "Mis estadísticas"
page available to every authenticated user.

**Value delivered**  
Gives each user a self-service view of their throughput and pace without
exposing anyone else's data, and surfaces the average time per task that the
dataset administrator also relies on (`US-21`).

**Dependencies**  
Per-user `Annotation` rows, terminal `Review` rows, and the time accumulators
recorded during work: `SectionAssignment.timeSpentSeconds` for annotation and
`Review.timeSpentSeconds` for review (see [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) §10).

**Specific functional rules**

- The page (`/my-stats`) and its data source (`GET /api/me/stats`) always derive
  the user **from the session**, never from the request; one user can never read
  another's statistics.
- **Global totals**: total annotations (distinct annotated entries), total
  reviews (terminal: `completed`/`disputed`), number of datasets annotated, number
  of datasets reviewed, and the **average time per annotation** and **per review**.
- **Per-dataset breakdown**: one row per dataset where the user has **at least
  one** annotation or review (`> 0`), with that dataset's counts and per-task
  average times. Datasets with no activity for the user are omitted.
- Averages are *total seconds ÷ task count*, floored, and shown as `—` when there
  is no activity. Annotation time recorded with no saved annotation does not skew
  the average (it is excluded from the numerator).

**Current status**

- Implemented end to end: prototype (`prototypes/own-stads`), the live page
  (`public/own-stads.html`, linked as "Mis estadísticas" in the toolbar for every
  user), `GET /api/me/stats` (`me-controller` → `me-statistics-service` →
  `me-statistics-repository`), and the time recording wired into the annotation
  `send` and review `finalize` flows.

### 10.5 AI and smart assistance block

#### `US-15` Automatic text generation from RDF

**Description**  
The system should propose Spanish text from RDF triples.

**Value delivered**  
Increases production speed and serves as an editable base.

**Current status: discarded**

A draft generator (`business/spanish-draft-generator.js`) and the HTTP surface `POST /api/annotations/drafts` were attempted. The iteration was reverted and the piece was removed from the repository (semantic helpers removed in a prior cleanup; the `AUDITORY-3.md` snapshot that documented it is no longer in the tree — see `PROBLEMS.md §4`). By default, reintroducing it is not pursued. If it is taken up again in the future, it should start from a new `EPIC-<n>-PLAN.md` and not from the old E3 plan.

#### `US-16` Automatic translation generation

**Description**  
The system should automatically translate or adapt base content into Spanish.

**Current status: discarded**

It shared implementation with US-15 (same `spanish-draft-generator.js` module in `translate` mode). It was discarded in the same iteration. Not pursued.

#### `US-17` Detection of potentially invalid translations

**Description**  
The system must warn when a sentence appears incorrect with respect to the RDF context or the reference.

**Value delivered**  
Helps the annotator detect errors before final saving.

**Current status**

- Partially supported through contextual validation via rules and Ollama.

#### `US-18` Detection of low linguistic diversity

**Description**  
The system should flag excessive similarities between sentences.

**Current status: discarded**

`business/diversity-checker.js` was attempted to compare sentences within the same entry. It was removed in the same cleanup as US-15/US-16 (the `AUDITORY-3.md` snapshot is no longer in the tree — see `PROBLEMS.md §4`). Current validation is sentence by sentence and a multi-sentence layer is not pursued as long as there is no firm use case.

#### `US-31` Per-dataset AI credentials (dataset administrator)

**Description**  
A dataset administrator can register and manage one or more AI provider API keys (Groq, any OpenAI-compatible provider, or a native provider such as Anthropic) for their dataset, choose which one is active, and "check" each one, so that the AI-assisted validation of that dataset uses their own credential instead of the global one configured for the whole application.

**Value delivered**  
Decouples AI usage from the single global key in `config.js`: each dataset can run its assisted validation against its own provider and quota, without affecting other datasets or the global configuration.

**Dependencies**  
Dataset admin authorization (`Permit.isAdmin`/`isOwned`, reused via `assertDatasetAdminPermission`), the OpenAI-compatible LLM client, at-rest secret encryption (`utils/secret-crypto.js`), and the per-dataset `llm_mode` metadata. See [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) §9.

**Specific functional rules**

- Only a dataset administrator (admin or owner) can list, create, activate, delete or check the dataset's AI credentials. A non-admin receives the same authorization error as any other admin-only dataset endpoint.
- A dataset holds at most **one active credential**. Activating one credential deactivates the others atomically; uniqueness is `(datasetId, provider)`.
- The API key is **never** stored in clear text (AES-256-GCM at rest) and is **never** returned to the client: responses expose only `provider`, `apiBase`, `model`, `keyLast4` (last 4 characters) and `isActive`. The key never appears in logs.
- The credential panel (form + existing credentials) is **hidden when `Uso de LLMs` = `Ninguna` (`llm_mode = 'none'`)**, both in the UI and in the backend listing. This is applied defensively even though `llm_mode` is fixed at creation today: the listing returns an empty list and write/check operations are rejected under `llm_mode = 'none'`.
- The credential governs *which provider/key* is used; `llm_mode` governs *whether* there is AI assistance. The active credential is consumed by the dataset's `/check` flow; with no active credential the global provider is used (no regression).
- Each credential has a **"check"** action: the server calls the model with the prompt `Respond "I'm <model> and I am ready to work"` (substituting the credential's `model`) using the decrypted key, and returns the text received from the model, which the UI shows in a modal.

**Acceptance criteria**

- A dataset admin can create, list (masked), activate, delete and check credentials for their dataset; a non-admin cannot and receives a permissions error.
- No response, log line or DTO ever contains the clear or encrypted key; only the masked form (`••••last4`) is shown.
- With an active credential of provider X, `POST /api/annotations/check` for that dataset calls provider X with the decrypted key; with no active credential the global provider (`config.model`) is used.
- With `llm_mode = 'none'`, the listing is empty, the panel is hidden, and write/check operations are rejected.
- The "check" action returns the model's message and the UI shows it in a modal (success or error), without leaking the key.

#### `US-32` Dataset naming and rename

**Description**  
The administrator names a dataset when creating it (the field defaults to the
uploaded file name) and can rename it later from the dataset administration
page. Names are kept unique per owner.

**Value delivered**  
Keeps datasets identifiable and lets admins fix or improve a name without
re-importing the data.

**Dependencies**  
Dataset admin authorization (`Permit.isAdmin`/`isOwned`, reused via
`assertDatasetAdminPermission`), dataset ownership (`Permit.isOwned`) and the
`Dataset.name` column. See [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md).

**Specific functional rules**

- On creation, the **Nuevo dataset** form pre-fills the name with the file name (without `.xml`); the admin may edit it. With no name supplied (non-UI client), the server derives it from the file.
- Renaming is exposed on the administration page and is **admin-only** (`PATCH /api/datasets/:id`), enforced server-side like deletion.
- The name is **trimmed**, must be **non-empty** (`400 invalid_dataset_name`) and at most **128 characters** (`400 dataset_name_too_long`).
- A name must be **unique among datasets owned by the same user**. The collision check runs against the *dataset's owner* on rename (not necessarily the acting admin), preserving the invariant "no owner has two datasets with the same name". A collision is rejected with `409 duplicate_dataset_name` and a controlled message; the form stays open and shows the reason inline.

**Acceptance criteria**

- Creating a dataset asks for a name defaulting to the file name; an empty or duplicated (per-owner) name is reported with a clear message instead of silently creating.
- A dataset admin can rename a dataset from the administration page; the new name is reflected in the list and the admin header.
- A non-admin cannot rename a dataset and receives the same authorization error as other admin-only dataset endpoints.
- Renaming to a name already owned by the same owner is rejected (`409`) without changing the dataset.

#### `US-34` Optional dataset description on creation and visualization

**Description**  
The administrator may attach a short, free-text description to a dataset when
creating it. The description is shown immediately under the dataset name on the
visualization page (`/datasets/:id/view`), so users opening the view understand
what the dataset is about. The field is optional: an empty description leaves
no subtitle under the name.

**Value delivered**  
Gives administrators a place to write the intent or scope of a dataset
(provenance, domain, version notes, etc.) and gives every user with access a
one-glance explanation of what they are looking at, replacing the static
"endpoint AJAX" placeholder and the unused "server mode" badge that previously
sat in that area.

**Dependencies**  
The new `Dataset.description` column (`VARCHAR(512)?`), the *Nuevo dataset*
form (`US-32`), the dataset summary endpoint (`GET /api/datasets/:id`,
already consumed by the visualization page to gate the extended-download
button), and the visualization page (`public/dataset-view.html`).

**Specific functional rules**

- The *Nuevo dataset* form exposes an **optional** `Descripción` textarea below
  the name input. The user may leave it empty.
- Length cap is **512 characters** and is enforced on **both** sides:
  - Client: HTML `maxlength="512"` (blocks typing past 512), an `input` listener
    that hard-truncates to 512 (defensive fallback) and a `paste` listener that
    intercepts the paste event and clips the merged value to 512 characters
    (covers the "paste over selection" scenario where the merged text would
    otherwise exceed the limit).
  - Server: `assertValidDatasetDescription` rejects any trimmed value longer
    than 512 with `400 dataset_description_too_long`. The existing inline error
    banner inside the new-dataset modal (`#newDatasetMessage`) surfaces the
    message; no separate error modal is introduced.
- The value is **trimmed** on the server. A blank/whitespace-only description
  is persisted as `NULL` and treated identically to no description at all.
- Existing datasets created before this story have `description = NULL` and
  therefore render no subtitle under the name (no migration backfill needed).
- The visualization page (`/datasets/:id/view`) renders the description verbatim
  under the dataset name. When the description is `NULL` or empty, the subtitle
  paragraph is hidden — nothing appears under the name.
- The previous "Modo servidor preparado" pill on the visualization header is
  **removed**: it never carried information for users.

**Acceptance criteria**

- The *Nuevo dataset* form accepts an empty description and creates the dataset
  with `description = NULL`.
- A description of 1–512 characters is persisted as-is (post-trim) and shown
  under the name on the visualization page.
- Typing or pasting more than 512 characters into the description never lets
  the field hold a value longer than 512 characters.
- A crafted request with `description.length > 512` is rejected by the API with
  `400 dataset_description_too_long`; the modal stays open and surfaces the
  message in its existing red banner.
- Opening the visualization page for a dataset with `description = NULL`
  renders no subtitle and no "server mode" pill in the header.

#### `US-33` Automatic annotation by AI ("Generación por IA")

**Description**
A dataset created with `llm_mode = 'generation'` reuses the **Anotar** button on the dataset list to launch an *automatic* annotation: instead of opening the manual annotation page, the system asks the user how many sections to annotate, locks those sections, and asks the active per-dataset LLM credential (US-31) to produce the Spanish sentences entry by entry. The user is freed and can keep working while the job runs in the background.

**Value delivered**
For generation-mode datasets, the human becomes a consumer of the AI output instead of a producer. A single click annotates N sections; failures are recoverable (retry / cancel) without losing the sections that already completed.

**Dependencies**
The per-dataset AI credential (`US-31`), the dataset-options panel that sets `llm_mode` at creation (`US-32` form), the section assignment service (`SectionAssignment`, reused as locks), the annotation persistence path (`annotations-service.saveSentences`) and the OpenAI-compatible client (`utils/openai-compatible-client.js`). See [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) §10.

**Specific functional rules**

- Only datasets with `llm_mode = 'generation'` change the **Anotar** behaviour. For `correction` and `none` the manual page is still opened (no regression).
- The modal asks for `Número de secciones a anotar`. The input accepts only digits (`0-9`), enforces `maxLength = 3` (max `999`) and strips a leading `0` when the user types a new digit. Value `0` is rejected inline with the message **Mínimo 1**.
- If the dataset has **no active AI credential**, the `Confirmar` button is disabled and the message **No hay API activa. Configúrela para continuar.** is shown in red. The check is exposed by the new endpoint `GET /api/datasets/:id/llm-credentials/active-status`, which is readable by any user with a `Permit` (not admin-only): the dataset annotator needs to know whether to enable the button.
- The N sections to annotate are the **next N globally non-completed sections** of the dataset (same `maxSectionIndex + 1..N` rule the **continue** flow uses for case 5). All N sections are **locked atomically** before any LLM call. If any cannot be locked the job is aborted with a single error message — partial locking is never observable to the user.
- The job runs **asynchronously**. The start request returns as soon as the locks are taken; the **Anotar** button switches to **En curso** on the dataset row. The user can leave the page and come back: the state is read on demand from the server.
- Entries are annotated **one by one** (one prompt → one response → one persist). The completed-section counters and the `SectionAssignment.status` transitions reuse the same path the manual flow uses (`section_assignments` to `completed`, `Dataset.sectionsPending` decremented, `sectionsCompleted` or `sectionsInReview` incremented depending on `isReviewEnabled`).
- Clicking the **En curso** button while the job is healthy shows a modal with title **Anotación en curso**, the running progress (`Entries: x de total`, `Secciones: y de total_secciones`) and a single **Cerrar** button.
- On an LLM failure (`Fallo de conexión`, `Salida inesperada`, etc.) the job pauses on the failing entry. The **En curso** modal then shows the error message and exposes two buttons: **Reintentar** resumes from the failed entry; **Cancelar** discards the entries already persisted for the partially-annotated current section (`Annotation` rows are deleted for those entries and the section assignment is `released`), keeps every previously-completed section as **definitive**, and frees the **Anotar** button.
- A dataset can have at most one active auto-annotation job at a time. A second start attempt while a job is running is rejected with a controlled message; the user is invited to open the **En curso** modal.

**Acceptance criteria**

- For a `generation` dataset, **Anotar** opens the automatic-annotation modal with the spec'd field validation; for `correction` and `none` the manual annotation page still opens.
- With no active credential, the modal disables **Confirmar** and shows the configured message.
- Submitting a valid N locks N sections inside a single transaction (all-or-nothing) and returns immediately; the **Anotar** button switches to **En curso** while the job runs in the background.
- Each entry is annotated by an individual LLM call and persisted as soon as it returns. Completed sections survive **server restarts** because they are persisted via the same path the manual flow uses; the running job's in-memory state does not.
- An LLM failure leaves the job in a `failed` state. Clicking **En curso** shows the error and the two recovery buttons (**Reintentar** / **Cancelar**). **Reintentar** resumes from the failing entry. **Cancelar** rolls back the half-annotated current section and frees the **Anotar** button. All sections completed before the failure remain persisted.

#### `US-35` Model picker fed by the provider's live catalog (dataset administrator)

**Description**  
On the dataset administration page, the **Modelo** field of the AI-credentials form is no longer a bare free-text input: for providers that expose a public model-listing API (**Groq** and **Google AI Studio**), the administrator picks the model from a dropdown populated live from the provider, with a manual-entry fallback that is always available. Google AI Studio also becomes a first-class provider selectable in the form.

**Value delivered**  
Removes the main friction of US-31: administrators no longer need to leave the page to look up exact model identifiers (and no longer mistype them). Catalog errors (invalid key, rate limit, provider down) are surfaced inline with actionable messages instead of failing later at "check" time.

**Dependencies**  
The per-dataset AI credentials surface (`US-31`: service, controller, routes, panel), the shared LLM HTTP helper (`utils/llm-http.js`, for timeouts and LLM logging) and the provider catalog endpoints: Groq `GET /openai/v1/models` and Google AI Studio `GET /v1beta/models`. See [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md) §9.9.

**Specific functional rules**

- Both provider catalogs **require an API key** (verified: Groq answers `401 invalid_api_key` and Google `403 PERMISSION_DENIED` without one); there is no anonymous listing. The dropdown therefore loads only when a key is available: the one typed in the form or, failing that, the key already stored for that provider in the dataset (decrypted **server-side only**).
- The browser never calls the providers directly: a new admin-only endpoint `POST /api/datasets/:id/llm-credentials/models` proxies the catalog request. The key travels in the request **body** (never in the URL or query string) and is never echoed back.
- The picker applies to `groq` and `google-ai-studio`. For `anthropic` and `openai-compatible` the model field remains free text (no catalog contract is assumed for them).
- The Google catalog is filtered to models supporting `generateContent` (chat-capable) and the `models/` prefix is stripped from ids; the Groq catalog is filtered to active, chat-capable models (audio/TTS/guard entries are excluded). Lists are sorted alphabetically.
- A **manual-entry option** ("Otro (escribir manualmente)") is always offered, so saving a credential is never blocked by a catalog outage or by a model missing from the listing.
- Catalog failures are reported inline distinguishing: invalid/unauthorized key, rate limit, and provider unavailable (HTTP 5xx, network failure or timeout). The error message never contains the key.
- The catalog response is cached client-side per provider+key while the page is open; the refresh button forces a reload. Switching provider re-populates the dropdown (from cache or live).
- `google-ai-studio` becomes a valid provider end-to-end: selectable in the form, accepted by the JSON importer (aliases `google-ai-studio`, `google`, `ai-studio`, `gemini`), and routed by the LLM dispatcher through the OpenAI-compatible client against Google's OpenAI-compatibility endpoint, so "Comprobar" and the annotation `/check` flow work unchanged.

**Acceptance criteria**

- With a valid Groq key typed in the form, choosing **Groq** populates the dropdown with that account's chat models; the saved credential stores the picked id.
- With a valid Google AI Studio key, choosing **Google AI Studio** populates the dropdown with `generateContent`-capable Gemini models (ids without the `models/` prefix) and "Comprobar" on the saved credential returns the model's reply.
- With an invalid key, the panel shows the invalid-key message inline; with the provider unreachable (network error/5xx/timeout), it shows the service-unavailable message. In both cases manual entry still allows saving the credential.
- A non-admin calling `POST /api/datasets/:id/llm-credentials/models` receives the same authorization error as the rest of the credentials surface; with `llm_mode = 'none'` the call is rejected (`409 llm_disabled`).
- No response, log line or error message ever contains the clear key.

### 10.6 Administration and governance block

#### `US-21` Per-dataset administration statistics

**Description**  
A dataset administrator must consult, for their dataset, who annotated and who
reviewed, each user's individual average time (separated by annotation and
review), and the dataset's overall pace.

**Value delivered**  
Gives dataset admins per-user accountability and a single dataset-wide figure to
track throughput, reusing the same time accumulators as the personal view
(`US-14`).

**Dependencies**  
Dataset access (`findAccessibleById`), the statistics graph
(`datasets-statistics-repository`), and the recorded time accumulators
(`SectionAssignment.timeSpentSeconds`, `Review.timeSpentSeconds`).

**Specific functional rules**

- Served by `GET /api/datasets/:id/statistics`, available to every user with
  access to the dataset (the dataset's admins in practice), with two tables —
  **annotation** and **review**.
- Each table lists, **per user**, their task count, percentage of the dataset,
  **individual average time** and first-pass precision.
- Each table also shows a **weighted general average** time: `Σ time ÷ Σ tasks`
  across all users, so a user with more tasks contributes proportionally (e.g.
  A = 3 min × 10 reviews and B = 6 min × 5 reviews ⇒ `((3·10)+(6·5))/15 = 4 min`).
- Annotation time comes from the user's `SectionAssignment` accumulators; review
  time from each `Review`. Both are now recorded by the work flows (§10).

**Current status**

- Implemented: per-user annotation/review tables in `public/dataset-admin.html`
  (US-21), now complemented by the dataset-wide **weighted general average**
  footer and backed by the time recorded during annotation and review.

#### `US-22` Role management

**Description**  
The administrator must be able to assign and modify roles.

**Current status**

- **Dataset roles** (`Permit` flags) are fully manageable by a dataset admin through `GET/POST/PATCH /api/datasets/:id/permissions` and the dataset-admin UI.
- **Server roles** (`isModerator`) are now manageable by a moderator through the admin API:
  - `GET /api/admin/users` — lists every user with `{ id, email, isModerator }` (never the password hash).
  - `PATCH /api/admin/users/:id` with `{ isModerator: boolean }` — promotes/demotes a user. `isModerator` must be a real boolean (strict). A moderator **cannot** demote their own account (`409 cannot_self_demote`), which prevents a single-moderator base from locking itself out. An unknown user id yields `404 user_not_found`.
- Both endpoints are behind `requireApiModerator()`; a non-moderator receives `403 forbidden_role`.
- A dedicated front-end roster page is not yet built; the endpoints are backend-complete and tested. Registering directly as a moderator with a single-use code remains the other supported path (`US-27`).

#### `US-23` Activity monitoring

**Description**  
The administrator must have operational visibility of user activity.

**Current status**

- Request and error logs exist.
- A consolidated user monitoring panel does not yet exist.

#### `US-24` Configuration of evaluation criteria

**Description**  
The administrator must be able to adjust the criteria used by the review process.

**Current status**

- No functional implementation is observed in this version.

### 10.7 Operation and audit block

#### `US-25` Request logging with payload

**Description**  
The system must record requests with JSON data or forms in hourly files.

**Value delivered**  
Eases traceability, debugging, and operational auditing.

**Dependencies**  
Logging middleware and asynchronous serialized writing policy.

**Specific functional rules**

- All logs are created inside the `logs` folder.
- Each hour, a file is generated with the name `<year>-<month>-<day>-<hour>.txt` where the requests for that hour are written.
- Each request records its timestamp with the format `<year>.<month>.<day>.<hour>.<minute>.<second>.<milliseconds>`.
- Only requests containing form or JSON data are recorded.
- Sensitive fields, such as `password`, are replaced with `[ommited]` before being written.
- Because it is a multi-user environment, only one execution thread has write access to the file; incoming requests are sent asynchronously to that thread, which writes them in order.

**Acceptance criteria**

- A file is created per hour in the `logs` folder with the indicated name.
- Only requests with form or JSON are recorded.
- Sensitive fields always appear redacted as `[ommited]`.
- The file begins with a blank line and separates each request with a blank line.
- Writing on each file is serialized in a single thread.

**Example of file `logs/2026-04-16-22.txt`**

```
2026.04.16.22.45.12.763 POST /register {
    surname: 'Jack',
    lastName: 'Robinson',
    email: 'jack@gmail.com',
    password: '[ommited]'
}

POST /register {
    surname: 'Eve',
    lastName: 'Howard',
    email: 'eve@gmail.com',
    password: '[ommited]'
}

POST /login {
    email: 'eve@gmail.com'
    password: '[ommited]'
}
```

#### `US-26` Specific logging of 500 errors

**Description**  
The system must record internal server errors in a specific daily file.

**Value delivered**  
Improves diagnostic and technical support capability.

**Specific functional rules**

- The error file is named `<year>-<month>-<day>-error.txt` and is also located inside `logs`.
- Only responses with code 500 (internal server error) are recorded.
- Responses with code 403 (forbidden) or 404 (no exists) are not recorded.
- Each entry includes method, route, code, and error reason.
- Writing on the daily error file follows the same asynchronous serialized policy as the hourly request log.

**Acceptance criteria**

- Only responses with code 500 are recorded.
- 403 and 404 errors do not appear in this file.
- Each entry includes route and reason of the error.

**Example of file `logs/2026-04-16-error.txt`**

```
GET /benchmark/1 {
    code: 500,
    reason: 'Database connection problem',
}

GET /benchmarks {
    code: 500,
    reason: 'Generic internal server error',
}
```

### 10.8 Moderator registration block

#### `US-27` Public registration as moderator with single-use code

**Description**  
The visitor in possession of a valid moderator code must be able to register and be promoted to `moderator` in the same sign-up, without subsequent operational intervention.

**Value delivered**  
Allows distributing administrative access to authorized operators without requiring manual promotion in the database.

**Dependencies**  
User model with `isModerator`, `register_codes` table, public registration form, body validation of `POST /register`, and prior code generation (`US-28`).

**Specific functional rules — form**

- The public registration form includes a **Moderator** checkbox, unchecked by default.
- When checked, a **Moderator Register Code** field appears; when unchecked, the field is hidden **and its value is cleared**.
- The code field only accepts `[a-zA-Z0-9]` (case-sensitive) and is hardware-limited to 16 characters: a 17th character cannot be typed and pasting a text that takes the value above 16 characters is not allowed.
- If the checkbox is checked and the code does not measure exactly 16 characters, the form shows an inline error and does not submit.

**Specific functional rules — backend**

- If the checkbox is unchecked, the form submits to `POST /register` (the `US-01` flow, unchanged).
- If the checkbox is checked, the form submits to `POST /register/moderator` with the same body as `/register` plus the `code` field (exactly 16 chars `[a-zA-Z0-9]`).
- The server validates the `code` against `register_codes`:
  - If the code **exists**: the row is deleted (single-use) **and** the user is created with `is_moderator = true`, reusing the same creation logic as `/register`.
  - If the code **does not exist**: the request is rejected with `HTTP 400` and JSON `{ error: 'Invalid moderator register code' }`. No user is created and no row is deleted.
- The endpoint applies the same body validation as `/register` (email format, password rules, etc.) before consuming the code.

**Specific functional rules — codes**

- Codes live in the `register_codes` table with two columns: `code VARCHAR(16)` (PK) and `created_at DATETIME`.
- A code is consumed (deleted) on a successful moderator registration.
- Codes are produced offline by an operator script (`US-28`).

**Acceptance criteria**

- Checking/unchecking the checkbox shows/hides the code field and clears its value when hiding it.
- Pasting a text with characters outside `[a-zA-Z0-9]` filters the content on paste; pasting more than 16 characters truncates to 16.
- A request with a non-existent code returns `400` and does not create a user.
- A request with an existing code creates the user with `is_moderator = true` and leaves the code row deleted.
- Two consecutive requests with the same code only manage to create one user; the second returns `400`.

#### `US-28` Operational generation of moderator codes

**Description**  
The operator needs to produce batches of single-use codes to hand out to those who must register as moderators.

**Value delivered**  
Allows the operator to enable moderators without touching the database by hand and without exposing credentials.

**Dependencies**  
`register_codes` table, Prisma client shared with the server.

**Specific functional rules**

- There is a script under `scripts/` that asks on stdin for the number of codes to generate (positive integer).
- Each generated code has exactly 16 characters taken from `[a-zA-Z0-9]` via `crypto.randomInt` (uniform and unpredictable distribution).
- The script inserts all generated codes inside a single Prisma transaction, so that an intermediate failure leaves the table intact.
- After the commit, it prints each code on its own line through stdout.
- In case of error (validation or DB), it prints the error to stderr and exits with a non-zero code, without printing a partial list.

**Acceptance criteria**

- Requesting N codes inserts N rows in `register_codes` and prints N lines on stdout.
- Each generated code measures 16 characters and belongs to `[a-zA-Z0-9]`.
- A DB failure during insertion leaves the table without new rows from the batch.

#### Operational promotion outside the code flow

- The `scripts/bootstrap-admin.js` script provisions an initial user with `is_moderator = true` so that a freshly created base has at least one moderator.
- The script does not touch the `permits` table.
- Outside the bootstrap and the `US-27` flow, promotion to moderator is performed operationally on the database.

## 11. Main use cases

### CU-01 Load a dataset and leave it ready for annotation

1. The administrator logs in.
2. Uploads a valid XML.
3. The system validates and persists dataset and entries.
4. The dataset becomes available to authorized users.

### CU-02 Annotate a section of the dataset

1. The annotator logs in.
2. Consults the accessible datasets.
3. Opens a section of the dataset.
4. Reads triples and references.
5. Writes or corrects Spanish sentences.
6. Runs automatic validation.
7. Saves the annotations.

### CU-03 Detect a quality error before review

1. The annotator inputs a sentence.
2. The system applies basic rules.
3. If appropriate, the system consults the semantic verifier.
4. The system returns validity, reason, and suggestion.

### CU-04 Audit an internal server failure

1. An endpoint returns error 500.
2. The middleware records the error in the daily error file.
3. The technical team consults the trace for diagnosis.

### CU-05 Review and correct an annotation

1. The reviewer accesses the review module.
2. Evaluates the annotation by criteria.
3. Corrects the text if necessary.
4. Briefly documents the reason for the correction.

Note: this use case is functionally defined, but its complete implementation is not yet observed in the current repository.

## 12. What the system does not do today

> This list was corrected on 2026-05-21: several items it previously listed as missing (the human review flow, personal/admin statistics, exclusive section assignment, the dispute flow) are in fact implemented — see `§10.4` (US-13/US-14), `§10.6` (US-21) and `TECHNICAL-DESIGN.md §3`/`§4`. The remaining genuine gaps are below.

In its current state, `lanbench` does not yet cover:

- comprehensive automatic generation of texts or translations ready for editing (US-15/US-16, **discarded** — see `§10.5`).
- analysis of linguistic diversity between sentences (US-18, **discarded**).
- **dynamic configuration of evaluation criteria** (US-24): the `EvaluationCriterion` admin CRUD exists but the reviewer still uses the fixed criteria in `constants/review-criterion.js`; the catalogue has no consumer and cannot yet express the phrase/review-level split (see `PROBLEMS.md §3`).
- **consolidated functional monitoring of user activity** (US-23): request/error logs are written, but there is no panel or endpoint to browse them or aggregate per-user activity.
- a **front-end** for server-role management: the moderator-only `GET/PATCH /api/admin/users` endpoints exist (US-22) but no roster page consumes them yet.
- a second/additional review round driven by `Dataset.hasAdditionalReviews` (the column is persisted but inert).

## 13. Recommended future extensions

The system could evolve along the following lines:

- initial generator of Spanish verbalizations from RDF
- assisted translator with human post-editing
- review panel with sequential criteria and traceability of changes
- productivity and coverage dashboard per role
- automatic section assignment and concurrent work locking
- advanced export of enriched datasets and annotated versions
- detection of linguistic diversity, redundancy, and style
- correction history and learning from recurring errors
- advanced administration of roles, permissions, and teams
- operational observability with a panel over logs, errors, and activity

## 14. Conclusion

`lanbench` responds to a real need for supervised construction of Spanish corpora from RDF triples. The current functional and technical base already supports authentication, dataset upload, segmented access, persistent annotation, assisted validation, and operational auditing. From this base, the next natural priorities to mature the product are to close the review flow, enrich assisted generation, and consolidate the analytical and administrative exploitation of the system.
