# User Story Planning

Date: 2026-04-22

Base used:

* Functional audit in `US-COVERAGE-1.md`.
* User stories in `documentation/user_stories.txt`.
* No tests have been executed in this planning.

Plan objective:

* Organize the implementation of `US-01..US-24`.
* Segment each US into tasks.
* Detect dependencies between stories.
* Separate reusable common tasks.
* Group execution into `EPIC TASKS` blocks.
* Move from coarse-grained to fine-grained granularity.

## 1. Coarse-Grained Overview

The recommended planning is organized into 7 `EPIC TASKS` blocks:

| Block | Epic Task                                           | Main US                                                            | Expected Result                                                                                                                          |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| E0    | Core stabilization and cross-cutting architecture   | US-01, US-02, US-03, US-05, US-06, US-19                           | The existing flow stops depending on `DEBUG`, domain contracts are fixed, and the foundation for roles, review, and metrics is prepared. |
| E1    | Access governance, roles, and permissions           | US-22, support for US-13, US-19, US-20, US-21, US-23, US-24        | The app differentiates annotator, reviewer, and admin, and every route is protected by real authorization.                               |
| E2    | End-to-end base annotator workflow                  | US-03, US-04, US-04-R-01, US-05, US-06                             | The annotator can work on real datasets and real sections without mocks.                                                                 |
| E3    | AI assistance and advanced validation               | US-07, US-08, US-08-R-01, US-09, US-10, US-15, US-16, US-17, US-18 | The system generates drafts, validates coverage and diversity, and proposes traceable corrections.                                       |
| E4    | Human review workflow                               | US-12, US-13, US-13-R-01, US-13-R-02                               | A review queue, criteria-based evaluation, commented corrections, and return flow to the annotator exist.                                |
| E5    | Functional dataset administration and configuration | US-19, US-20, US-24                                                | The admin can import datasets, export real progress, and configure evaluation criteria.                                                  |
| E6    | Statistics, reporting, and monitoring               | US-11, US-14, US-21, US-23                                         | The platform exposes role-based metrics, work progress, and operational activity.                                                        |

Recommended execution order:

1. `E0`
2. `E1`
3. `E2`
4. `E3`
5. `E4`
6. `E5`
7. `E6`

Order justification:

* First, the current core must be converted into a reliable foundation and the `DEBUG` decoupling must be removed.
* Then, roles should be introduced so reviewer and administrator stories are not built on top of flat authentication.
* Next, the annotator end-to-end workflow should be completed.
* Once that workflow is stable, advanced AI and later human review make sense.
* Exporting, configuration, and reporting should rely on already persisted annotations and reviews.

## 2. Dependencies Between Stories

### 2.1 Strong dependencies

| Story      | Depends on                                      | Reason                                                                                                  |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| US-03      | US-02, US-19                                    | To view triples, an imported and selectable dataset must exist first.                                   |
| US-04      | US-03, US-19                                    | Complexity-based selection operates on entries already visible from a real dataset.                     |
| US-04-R-01 | US-04                                           | The work unit by sections is a restriction of the selection mechanism.                                  |
| US-05      | US-03, US-04                                    | Annotation cannot happen without visible entries and a defined work unit.                               |
| US-06      | US-03, US-04                                    | Assisted translation requires RDF context and a loaded English reference.                               |
| US-07      | US-15, US-16, US-05, US-06                      | Editing automatically generated sentences requires generated drafts and an editing UI to already exist. |
| US-08      | US-07, US-09, US-10, US-17, US-18               | Useful alerts depend on validations, quality rules, and discrepancy detection.                          |
| US-09      | US-03, US-05, US-06                             | Coverage validation requires visible triples and candidate text.                                        |
| US-10      | US-08, US-18                                    | Advanced correction reuses alerts and low-diversity detection.                                          |
| US-11      | US-05, US-06, US-07, US-08                      | Annotator statistics depend on real annotation events.                                                  |
| US-12      | US-13                                           | The annotator can only see corrected errors if a review workflow already exists.                        |
| US-13      | US-22, US-05, US-06, US-07, US-08               | Review requires annotated texts and an enabled reviewer role.                                           |
| US-13-R-01 | US-13                                           | Sequential acceptance by criteria is a restriction of the review workflow.                              |
| US-13-R-02 | US-13                                           | Editing and commenting corrections is part of the review process.                                       |
| US-14      | US-13                                           | Reviewer statistics depend on review work.                                                              |
| US-15      | US-03, US-19                                    | Text generation requires available triples and real datasets.                                           |
| US-16      | US-03, US-19                                    | Translation generation starts from the same data context.                                               |
| US-17      | US-16                                           | Discrepancy is defined relative to a generated translation.                                             |
| US-18      | US-05, US-06, US-15, US-16                      | Low diversity requires a set of comparable sentences.                                                   |
| US-20      | US-19, US-05, US-13                             | Exporting real progress depends on loaded datasets and persisted work.                                  |
| US-21      | US-05, US-13, US-15, US-16, US-17, US-18, US-20 | Admin reporting depends on annotation, review, AI, and export workflows.                                |
| US-23      | US-22, US-05, US-13, US-19, US-20               | Activity monitoring requires roles and already instrumented functional events.                          |
| US-24      | US-13, US-22                                    | Configuring criteria only makes sense when review workflows and roles already exist.                    |

### 2.2 Soft dependencies

| Story | Related story | Recommended interpretation                                                                                          |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| US-01 | US-22         | The current login can be maintained, but the user model should later adapt to roles.                                |
| US-02 | US-21         | The listing may later display metrics calculated by reporting.                                                      |
| US-08 | US-12         | The value of dismissing alerts increases significantly when reviewers can revalidate them.                          |
| US-19 | US-22         | Import functionality already exists, but it should be protected by the admin role before being considered complete. |

## 3. Cross-Cutting Common Tasks

These tasks do not belong to a single US and should be executed as shared foundations:

| Code | Common task                                                                                                                       | Reused by                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| C1   | Remove coupling to `DEBUG` in the frontend and replace it with real environment configuration                                     | US-03, US-05, US-06, US-07, US-08, US-19        |
| C2   | Define role and permission models in domain, DB, session, and middleware                                                          | US-13, US-19, US-20, US-21, US-23, US-24        |
| C3   | Define canonical lifecycle states for an entry: pending, in annotation, annotated, under review, reviewed, disputed               | US-04-R-01, US-12, US-13, US-20, US-21          |
| C4   | Create traceability for functional events: dataset creation, assignment, annotation, alert, review, export                        | US-11, US-14, US-21, US-23                      |
| C5   | Create aggregates and recalculation of progress metrics                                                                           | US-11, US-21                                    |
| C6   | Unify DTO and API contracts between frontend, routers, controllers, and services                                                  | US-03 to US-10, US-13, US-20                    |
| C7   | Manage AI engine resilience: timeouts, fallback, retries, and decision auditing                                                   | US-08, US-15, US-16, US-17, US-18               |
| C8   | Design missing domain entities: `Role`, `Review`, `ReviewCriterion`, `ReviewDecision`, `ActivityLog`, `ExportJob`, or equivalents | US-12, US-13, US-14, US-21, US-22, US-23, US-24 |

## 4. US to EPIC TASKS Mapping

| US         | Main Epic Task | Type of work                         |
| ---------- | -------------- | ------------------------------------ |
| US-01      | E0             | Consolidation                        |
| US-02      | E0             | Consolidation                        |
| US-03      | E2             | Functional completion                |
| US-04      | E2             | New functionality                    |
| US-04-R-01 | E2             | Business rule                        |
| US-05      | E2             | Functional completion                |
| US-06      | E2             | Functional completion                |
| US-07      | E3             | New functionality                    |
| US-08      | E3             | New functionality                    |
| US-08-R-01 | E3             | Business rule                        |
| US-09      | E3             | New functionality                    |
| US-10      | E3             | New functionality                    |
| US-11      | E6             | Reporting                            |
| US-12      | E4             | New functionality                    |
| US-13      | E4             | New functionality                    |
| US-13-R-01 | E4             | Business rule                        |
| US-13-R-02 | E4             | Business rule                        |
| US-14      | E6             | Reporting                            |
| US-15      | E3             | New functionality                    |
| US-16      | E3             | New functionality                    |
| US-17      | E3             | New functionality                    |
| US-18      | E3             | New functionality                    |
| US-19      | E5             | Functional completion and governance |
| US-20      | E5             | New functionality                    |
| US-21      | E6             | Reporting                            |
| US-22      | E1             | New structural functionality         |
| US-23      | E6             | New operational functionality        |
| US-24      | E5             | New configuration functionality      |

## 5. Refined Breakdown by EPIC TASKS

## E0. Core Stabilization and Cross-Cutting Architecture

Included US:

* US-01
* US-02
* foundational support for US-03, US-05, US-06, US-19

Input dependencies:

* None.

Activated common tasks:

* C1
* C6

### Block objectives

* Convert the current workflow into a truly operational foundation.
* Remove happy paths supported only by mocks.
* Freeze API contracts before increasing functionality.

### Medium-grained tasks

1. Consolidate session and user contracts.
2. Externalize `DEBUG` into real configuration and disable it in production.
3. Unify dataset and annotation contracts between frontend and backend.
4. Document current states and known gaps.

### Fine-grained tasks

1. Review `public/js/annotations.js` and `public/js/dataset-view.js` to replace mocks with real API consumption.
2. Maintain an optional demo mode, but decoupled from real mode.
3. Define canonical DTOs for `DatasetList`, `DatasetSection`, `EntryContext`, `SentenceValidation`, and `SavedAnnotation`.
4. Align error messages between frontend and backend.
5. Review navigation between `/tasks`, `/datasets/:id/view`, and `/annotations`.
6. Ensure compatibility between session, auth, and future role claims.

Definition of done for the block:

* The app can run without functionally depending on mocks in core screens.
* Canonical APIs remain stable for the following blocks.

## E1. Access Governance, Roles, and Permissions

Included US:

* US-22
* functional prerequisite for US-13, US-19, US-20, US-21, US-23, US-24

Input dependencies:

* E0

Activated common tasks:

* C2
* C8

### Block objectives

* Introduce real role-based authorization.
* Separate responsibilities between annotator, reviewer, and admin.

### Medium-grained tasks

1. Extend the user model with roles.
2. Incorporate role-based authorization in middleware and routers.
3. Adapt session, login, and frontend to role capabilities.
4. Prepare permissions by dataset and work block.

### Fine-grained tasks

1. Design role tables or relationships and the corresponding migration.
2. Decide whether a user has a single role or multiple roles.
3. Extend `User.toSession()` to include roles or claims.
4. Create `requireRole` middlewares or equivalents.
5. Restrict upload, export, configuration, and monitoring to admin users.
6. Restrict review views and APIs to reviewers.
7. Adjust toolbar, landing pages, and navigation according to roles.
8. Prepare seeds or bootstrap logic for the initial admin.

Definition of done for the block:

* No admin or reviewer functionality is accessible merely by being authenticated.

## E2. End-to-End Base Annotator Workflow

Included US:

* US-03
* US-04
* US-04-R-01
* US-05
* US-06

Input dependencies:

* E0
* E1 recommended
* US-19 as available loading capability

Activated common tasks:

* C3
* C6

### Block objectives

* Complete the real annotator workflow with real datasets, real sections, and real persistence.
* Replace `slice`-based splitting with functional work assignment.

### Medium-grained tasks

1. Redesign work selection by dataset, section, and entry.
2. Implement grouping by complexity.
3. Implement exclusive assignment or temporary reservation of blocks.
4. Persist annotation progress by entry and block.
5. Display triples, references, and real block status in the frontend.

### Fine-grained tasks

1. Decide the complexity rule: by `size`, number of triples, or custom taxonomy.
2. Persist the relationship between user and reserved block.
3. Add reservation expiration, release, and recovery.
4. Expose an endpoint to request the next available block.
5. Expose an endpoint to resume an in-progress block.
6. Display complexity, block status, and section progress in the UI.
7. Ensure `send` also stores the workflow state of the entry.
8. Resolve multi-user concurrency on the same dataset.
9. Add navigation between entries within the same block and across consecutive blocks.

Definition of done for the block:

* An annotator can enter, reserve real work, annotate multiple sentences, and continue exactly where they left off.

## E3. AI Assistance and Advanced Validation

Included US:

* US-07
* US-08
* US-08-R-01
* US-09
* US-10
* US-15
* US-16
* US-17
* US-18

Input dependencies:

* E2

Activated common tasks:

* C6
* C7

### Block objectives

* Move from basic validation to complete intelligent assistance.
* Generate drafts, compare outputs, detect low diversity, and record user decisions.

### Medium-grained tasks

1. Create an automatic Spanish sentence generation engine.
2. Create a translation or initial verbalization engine based on triples.
3. Improve the triple coverage validation engine.
4. Introduce multi-sentence linguistic diversity rules.
5. Convert alerts into a workflow step between draft generation and final submission.

### Fine-grained tasks

1. Design an endpoint to request AI drafts by entry.
2. Store the origin of each sentence: manual, generated, edited, reviewed.
3. Add persistence for alerts and their resolution.
4. Define a triple coverage strategy:

   * deterministic heuristic
   * LLM support
   * combination of both
5. Define a diversity strategy:

   * lexical similarity
   * structural similarity
   * configurable thresholds
6. Differentiate spelling, grammar, semantic, coverage, and diversity alerts.
7. Associate each dismissed alert with a persisted justification.
8. Create a regeneration suggestion flow and partial acceptance flow.
9. Record discrepancies between AI output and final annotator output for later reporting.

Definition of done for the block:

* The annotator receives drafts, classified alerts, and traceable suggestions before submitting the final version.

## E4. Human Review Workflow

Included US:

* US-12
* US-13
* US-13-R-01
* US-13-R-02

Input dependencies:

* E1
* E2
* E3

Activated common tasks:

* C3
* C8

### Block objectives

* Introduce a complete and traceable review domain.
* Make reviewer feedback visible to the annotator.

### Medium-grained tasks

1. Design the review and criteria-based decision model.
2. Build the reviewer work queue.
3. Create a sequential criteria evaluation UI.
4. Allow reviewed text editing with mandatory comments.
5. Propagate feedback to the annotator history.

### Fine-grained tasks

1. Create entities `Review`, `ReviewCriterion`, `ReviewDecision`, `ReviewComment`, or equivalents.
2. Define states `annotated`, `under_review`, `reviewed`, `disputed`.
3. Build an endpoint listing items pending review.
4. Show the reviewer the complete context:

   * triples
   * English sentences
   * annotator final sentence
   * dismissed alerts and reasons
5. Implement a sequential criteria wizard for `US-13-R-01`.
6. Block advancement to the next criterion until the current one is resolved.
7. Allow reviewed text modification only when a comment is provided.
8. Store comments visible for re-correction and for the annotator.
9. Create an annotator view with corrected errors and recurring recommendations.

Definition of done for the block:

* A reviewer can accept or correct an annotation, justify the correction, and return useful learning feedback to the annotator.

## E5. Functional Dataset Administration and Configuration

Included US:

* US-19
* US-20
* US-24

Input dependencies:

* E1
* E2
* E4 recommended

Activated common tasks:

* C2
* C6
* C8

### Block objectives

* Complete the administrator role beyond logout.
* Make dataset and criteria lifecycle management possible.

### Medium-grained tasks

1. Harden dataset import as an admin-only functionality.
2. Create export functionality for real progress.
3. Configure evaluation criteria reused by the review workflow.

### Fine-grained tasks

1. Add a dataset administration screen.
2. Display status by dataset: total entries, reserved, annotated, reviewed, disputed.
3. Design export format:

   * enriched XML
   * canonical XML + attached annotations
   * intermediate working JSON
4. Decide whether export is generated on demand or as an asynchronous job.
5. Include in exports:

   * annotator final sentences
   * alert dismissal reasons
   * reviewer corrections
   * minimal traceability
6. Create a UI to create, activate, order, and version evaluation criteria.
7. Ensure the review workflow consumes configured criteria instead of a hardcoded list.

Definition of done for the block:

* The administrator can govern datasets and criteria without modifying code.

## E6. Statistics, Reporting, and Monitoring

Included US:

* US-11
* US-14
* US-21
* US-23

Input dependencies:

* E2
* E3
* E4
* E5 partial

Activated common tasks:

* C4
* C5

### Block objectives

* Expose reliable metrics for annotators, reviewers, and administrators.
* Separate technical observability from functional monitoring.

### Medium-grained tasks

1. Instrument functional events.
2. Calculate aggregated metrics by user, dataset, and period.
3. Create role-based dashboards.
4. Create operational monitoring views for admins.

### Fine-grained tasks

1. Record reservation, annotation, validation, alert dismissal, review, dispute, and export events.
2. Design aggregate tables or recalculation jobs for:

   * completed annotations
   * reviewed annotations
   * coverage by dataset
   * corrected AI errors
   * annotation errors corrected during review
   * disputes
3. Update `completedPercent`, `withoutReviewPercent`, and `remainPercent` with real logic.
4. Create annotator dashboards with volume, productivity, and error patterns.
5. Create reviewer dashboards with reviewed volume, times, and correction types.
6. Create an admin dashboard with the complete dataset funnel.
7. Create a user activity screen based on functional events, not only technical logs.
8. Add filters by date range, dataset, user, and state.

Definition of done for the block:

* The platform provides explainable and consistent metrics aligned with actually persisted work.

## 6. Recommended Execution Path

### Stage 1. Convert partial implementation into a stable foundation

Includes:

* E0
* E1
* part of E2

Result:

* The app stops depending on mocks.
* Every actor has real permissions.
* The annotator can already work with a real workflow.

### Stage 2. Complete the assisted annotation product

Includes:

* remaining E2
* E3

Result:

* The product is no longer just an editing UI, but a full AI-assisted platform with rich validation.

### Stage 3. Close the quality loop

Includes:

* E4
* E5

Result:

* Annotated work is reviewed, governed, and exportable.

### Stage 4. Exploit operational information

Includes:

* E6

Result:

* The platform gains management and monitoring value.

## 7. Practical Prioritization

Priority `P0`:

* E0
* E1
* E2

Priority `P1`:

* E3
* E4

Priority `P2`:

* E5
* E6

Priority interpretation:

* `P0` turns the current state into a minimally coherent operational product.
* `P1` adds quality and real differentiation.
* `P2` adds governance, export, and data exploitation.

## 8. Planning Risks

1. Implementing review before roles would generate rework in permissions and navigation.
2. Implementing metrics before modeling functional events would lead to unreliable dashboards.
3. Implementing export before consolidating annotation and review models would produce transitional formats.
4. Keeping `DEBUG` active while functionality grows would significantly increase integration debt.
5. Solving block exclusivity too late would endanger `US-04-R-01` and multi-user consistency.

## 9. Final Recommendation

The best sequence is not to implement the US in numerical order, but in real dependency order:

1. stabilize the core
2. introduce roles
3. complete the annotator workflow
4. add advanced AI
5. add human review
6. complete administration
7. finalize reporting and monitoring

With this sequence, partially covered stories are consolidated first, and currently missing stories are built on a coherent foundation instead of isolated patches.
