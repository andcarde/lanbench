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
- `US-04`: As an annotator, I want to select triples grouped by complexity and by work sections.
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

### 9.5 Operation and audit

- `US-25`: As a system, I want to record requests with payload to have operational traceability.
- `US-26`: As a system, I want to record 500 errors in a specific file to ease technical diagnosis.

### 9.6 Moderator registration

- `US-27`: As a visitor with a moderator code, I want to register directly as a moderator to access the administration surface without operational intervention.
- `US-28`: As an operator, I want to generate batches of single-use codes to distribute among those who must register as moderators.

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
The dataset must be divided into blocks of 10 entries to organize the work.

**Value delivered**  
Makes the task manageable and favors multi-user operation.

**Dependencies**  
Dataset loading, entry counting, and sectioning logic.

**Specific functional rules**

- The dataset is divided into sections of 10 entries each.
- The section is the minimum unit of work assigned to an annotator.
- The sectioning mechanism guarantees exclusive access to a subset of the dataset, preventing overlap in multi-user environments where several annotators work in parallel on the same dataset.

**Acceptance criteria**

- The system returns the requested section when it exists.
- The system reports the total number of sections and entries.
- A request for a non-existent section is rejected with a controlled error.

**Section size and count**

- Each section generally groups 10 entries.
- The dataset is divided into `ceil(entries / 10)` sections (integer division rounded up).
- If the number of entries is a multiple of 10, all sections have 10 entries; otherwise, the last section contains the remainder.

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
  - **Exit**: redirects to `/tasks`.
  - **Continue**: opens a new session over the next available section of the same dataset. The "Continue" button does not appear when there are no more available sections.

> Implementation details (tables, keys, assignment algorithm) are documented in [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md).

**Lifecycle of an entry**

`Entry.status` starts at `pending` (schema default) and is only modified when closing a review: `reviews-service.finalizeReview` leaves it at `reviewed` (if all criteria are `accepted`) or `disputed` (if any is `rejected` or `needs_fix`). The review queue queries (`repositories/reviews-repository.js`, `repositories/datasets-repository.js:findReviewableEntryDatasetIds`) filter by `status: 'annotated'`, and the `constants/entry-status.js` catalog also enumerates `in_progress` and `under_review`, but **no production flow applies them today**: they are planned states without a writer. While that transition does not exist, eligibility for review depends on populating `Entry.status = 'annotated'` by some other path (manual or future).

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
- **Deterministic per-triple verification** (an explicit verdict of covered / missing / uncertain for each triple) was attempted as `business/triple-coverage-checker.js`; it was removed in the same cleanup described in [doc-planning/AUDITORY-3.md](../doc-planning/AUDITORY-3.md) (finding #9). It is not pursued in the current roadmap: validation stays at the sentence level and delegates full coverage to the contextual LLM.

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

- Acceptance of criteria is mandatory criterion by criterion: it helps keep focus on correctness.
- Each check is a correction phase; until the current criterion is marked, neither the next criterion nor its check option appears. Trying to send a decision for a criterion not yet active is rejected with `code: 'criterion_locked'`.
- Decisions other than `accepted` (`rejected`, `needs_fix`) require a non-empty comment; without it, the server rejects the decision with `code: 'comment_required'`.
- If the reviewer corrects the text of a sentence, the justifying comment is mandatory (also with `code: 'comment_required'`). The comment is used both for re-correction and to return feedback to the annotator.
- The wizard allows **going back and rewriting** a decision already made on a previous criterion; it only blocks moving forward to future criteria before resolving the current one.
- A reviewer **cannot review their own annotations**: the review queue excludes any entry whose annotator matches the requesting reviewer. It is a governance rule that prevents self-review, not a visible UI restriction.
- The review is exclusive: once assigned, no other reviewer receives the same entry. The assignment expires by default after **2 hours**; upon expiration it becomes available again to other reviewers.

**Current status**

- Review flow implemented end to end: exclusive queue, sequential wizard by criteria, commented editing, and closure with terminal mark in `Entry.status`.
- Catalog of criteria persisted in `EvaluationCriterion` and manageable via API (US-24).

#### `US-14` Reviewer statistics

**Description**  
The reviewer must see metrics about their activity.

**Current status**

- No complete functional implementation is observed in this version.

### 10.5 AI and smart assistance block

#### `US-15` Automatic text generation from RDF

**Description**  
The system should propose Spanish text from RDF triples.

**Value delivered**  
Increases production speed and serves as an editable base.

**Current status: discarded**

A draft generator (`business/spanish-draft-generator.js`) and the HTTP surface `POST /api/annotations/drafts` were attempted. The iteration was reverted and the piece was removed from the repository. Reason documented in [doc-planning/AUDITORY-3.md](../doc-planning/AUDITORY-3.md) (finding #9: semantic helpers removed). By default, reintroducing it is not pursued. If it is taken up again in the future, it should start from a new `EPIC-<n>-PLAN.md` and not from the old E3 plan.

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

`business/diversity-checker.js` was attempted to compare sentences within the same entry. It was removed in the same cleanup as US-15/US-16 (see [doc-planning/AUDITORY-3.md](../doc-planning/AUDITORY-3.md), finding #9). Current validation is sentence by sentence and a multi-sentence layer is not pursued as long as there is no firm use case.

### 10.6 Administration and governance block

#### `US-21` Global administration statistics

**Description**  
The administrator must consult coverage, fixed errors, and dispute states.

**Current status**

- No complete functional implementation is observed in this version.

#### `US-22` Role management

**Description**  
The administrator must be able to assign and modify roles.

**Current status**

- The system handles roles in the data model and access control.
- A complete administrative interface or flow for role management is not yet in place.

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

In its current state, `lanbench` does not yet fully cover:

- a complete functional flow of human review with persistence of evaluation by criteria
- comprehensive automatic generation of texts or translations ready for editing
- analysis of linguistic diversity between sentences
- advanced statistics for annotators, reviewers, and administrators
- complete administrative management of roles from a dedicated interface or API
- consolidated functional monitoring of user activity
- dynamic configuration of evaluation criteria
- a closed dispute flow between annotation and review
- an explicit and visible mechanism of persistent exclusive section assignment to annotators

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
