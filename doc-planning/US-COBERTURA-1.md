# User Story Coverage Audit 1

Date: 2026-04-22

Scope:
- Static analysis of the current repository.
- Evidence based on code, data model, routes, existing front end, and tests already present in the repo.
- The test suite was not executed at the explicit request of the user.

Criteria used:
- `Covered`: there is sufficient end-to-end functional support for the story.
- `Partial`: there is implementation in one or more layers, but key pieces, functional restrictions are missing, or the actual flow is decoupled.
- `Not covered`: no identifiable implementation has been found for the story.

## Executive Summary

- Overall coverage on US-01..US-24: 2 covered, 10 partial, 12 not covered.
- The sub-requirements `US-04-R-01`, `US-08-R-01`, `US-13-R-01`, and `US-13-R-02` are audited separately and are not counted in that total.
- The backend has more coverage than the actual front-end experience: `public/js/annotations.js:9` and `public/js/dataset-view.js:4` are still operating in `DEBUG` mode, so several screens do not consume the real flow by default.
- There is no functional layer for human review, role management, operational statistics, download of annotated progress, or criteria configuration.
- Administration is, in practice, reduced today to `logout` and a dataset upload accessible to any authenticated user.

## 1. Coverage By User Story

| Story | Status | Audit result | Main evidence |
| --- | --- | --- | --- |
| US-01 | Covered | There is registration, login, logout, persisted session, and protection of private routes. | `routes/users.js:10-15`, `business/users-controller.js:8-59`, `services/users-service.js:14-58`, `middlewares/auth.js:5-26`, `routes/administrator.js:10-23`, `prisma/schema.prisma:40-46` |
| US-02 | Covered | Accessible datasets are listed and one can navigate to their view or to the task. | `public/js/datasets.js:250-314`, `business/datasets-controller.js:25-35`, `services/datasets-service.js:36-52`, `repositories/datasets-repository.js:10-30` |
| US-03 | Partial | The UI can display triples and source sentences, but the annotation screen loads mock data in `DEBUG`; the XML view is also in `DEBUG`. | `public/js/annotations.js:171-177`, `public/js/annotations.js:240-294`, `public/js/annotations.js:724-742`, `public/js/dataset-view.js:4-6`, `public/js/dataset-view.js:120-129`, `services/datasets-service.js:54-103` |
| US-04 | Partial | Slicing into sections of 10 entries exists, but there is no grouping by complexity or real exclusive assignment per annotator. | `constants/datasets.js:4`, `services/datasets-service.js:54-92`, `prisma/schema.prisma:9-17` |
| US-04-R-01 | Partial | The section size is met (`10`), but not multi-user exclusivity: sections are computed by `slice`, not reserved. | `services/datasets-service.js:65-92`, `repositories/datasets-repository.js:32-64` |
| US-05 | Partial | An annotation form and sentence persistence exist, but the front end by default does not use the real flow because `send` is bypassed by `DEBUG`. | `public/js/annotations.js:240-276`, `public/js/annotations.js:659-707`, `public/js/annotations.js:734-742`, `routes/annotations-api.js:12-15`, `business/annotations-controller.js:23-41`, `repositories/annotations-repository.js:10-53` |
| US-06 | Partial | English reference sentences are shown and passed to the semantic validator, but the real experience remains in `DEBUG`. | `public/js/annotations.js:228-294`, `services/annotations-service.js:10-23`, `services/annotations-service.js:55-64`, `business/ollama-spanish-checker.js:26-45` |
| US-07 | Partial | There is a flow to accept or reject correction suggestions, but there is no initial automatic generation of Spanish sentences to edit. | `public/annotations.html:150-170`, `public/js/annotations.js:427-607`, `public/js/annotations.js:783-821` |
| US-08 | Partial | Automatic alerts and saving of the rejection reason exist, but they are triggered on `CHECK`, not after finishing the work, and there is no reviewer revalidation. | `public/annotations.html:150-170`, `public/js/annotations.js:532-607`, `public/js/annotations.js:610-651`, `business/rule-checker.js:5-45`, `business/ollama-spanish-checker.js:15-78`, `prisma/schema.prisma:165-181` |
| US-08-R-01 | Partial | There is spelling coverage, basic grammatical coverage, and semantic coverage supported by Ollama; the rejection reason is captured, but there is no subsequent human review flow. | `business/rule-checker.js:17-38`, `business/ollama-spanish-checker.js:17-45`, `public/js/annotations.js:569-577`, `public/js/annotations.js:805-821` |
| US-09 | Partial | Each sentence is validated against triples and English reference sentence, but there is no deterministic triple coverage engine or explicit completeness verification. | `services/annotations-service.js:13-20`, `services/annotations-service.js:55-64`, `business/ollama-spanish-checker.js:26-45` |
| US-10 | Partial | Some spelling/grammatical errors and part of the semantic adequacy are corrected, but there is no specific logic for linguistic variety or for specialized RDF errors. | `business/rule-checker.js:17-38`, `business/ollama-spanish-checker.js:17-45` |
| US-11 | Not covered | There are no endpoints, services, or queries for personal annotation statistics. Dataset percentages exist, but they are only read and not recalculated. | `services/datasets-service.js:124-149`, `services/datasets-service.js:253-265`, search for `completedPercent/withoutReviewPercent/remainPercent` |
| US-12 | Not covered | There is no review subsystem that returns the corrected errors to the annotator. | `app.js:52-58`, absence of review models/routes/controllers |
| US-13 | Not covered | There is no reviewer role or flow, no sequential criteria, and no human evaluation form. | `app.js:52-58`, `prisma/schema.prisma` without review/criteria models, absence of dedicated routes |
| US-13-R-01 | Not covered | There are no checks per criterion, no chained acceptance phases, and no sequential gating in front or backend. | absence of implementation in `public`, `routes`, `business`, `services`, `repositories` |
| US-13-R-02 | Not covered | There is no review layer that allows editing reviewed texts with a mandatory comment for re-correction. | absence of `Review`/`Comment` model and associated APIs |
| US-14 | Not covered | There are no review-work statistics. | absence of review routes, services, and persistence |
| US-15 | Not covered | There is no automatic generation of Spanish text from RDF triples; only validation. | `business/spanish-service.js:19-29`, `business/ollama-spanish-checker.js:5-12` |
| US-16 | Not covered | There is no automatic generation of translations from RDF triples. English sentences come from the imported dataset, not from a generator. | `utils/xml-reader.js:116-127`, `services/datasets-service.js:185-199` |
| US-17 | Partial | The system can mark a sentence as invalid against triples and English reference, but there is no dedicated "discrepancy with generated translation" workflow. | `business/spanish-service.js:19-29`, `business/ollama-spanish-checker.js:26-45`, `public/js/annotations.js:610-651` |
| US-18 | Not covered | There is no detection of low linguistic diversity across multiple sentences; validation is sentence by sentence. | `services/annotations-service.js:10-23`, `business/rule-checker.js:5-45` |
| US-19 | Partial | Upload and import of RDF datasets exists, but it is not restricted to administrators: any authenticated user can use it. | `public/datasets.html:25`, `public/js/datasets.js:349-373`, `routes/datasets-api.js:14-20`, `business/datasets-controller.js:96-111`, `services/datasets-service.js:105-149`, `middlewares/auth.js:19-26`, `prisma/schema.prisma:40-46` |
| US-20 | Not covered | There is reading of the dataset XML, but it does not export the annotation progress saved in `Annotation`, nor is there a real download flow or admin restriction. | `services/datasets-service.js:95-103`, `services/datasets-service.js:201-228`, `repositories/datasets-repository.js:32-64`, `repositories/annotations-repository.js:10-53` |
| US-21 | Not covered | There is no calculation or visualization of triple statistics, coverage, corrected errors, or disputes. The progress fields are not updated. | `services/datasets-service.js:124-149`, `services/datasets-service.js:253-265`, `public/js/datasets.js:128-157` |
| US-22 | Not covered | There is no role management. The `User` model only has `email` and `password`, and the routes use simple authentication without role-based authorization. | `prisma/schema.prisma:40-46`, `middlewares/auth.js:19-26`, `routes/datasets-api.js:14-20` |
| US-23 | Not covered | Technical logging of requests/errors exists, but not a monitoring feature accessible to the administrator. | `middlewares/request-log-middleware.js:119-155` |
| US-24 | Not covered | There is no persistence, API, or interface to configure custom evaluation criteria. | absence of criteria models/routes/controllers/services |

## 2. Coverage By Feature

| Feature | Status | Affected stories | Observation |
| --- | --- | --- | --- |
| Access, authentication, and session | Covered | US-01 | It is the most consistent block of the current system and the best covered across layers. |
| Catalog of accessible datasets | Covered | US-02 | There is a listing, per-dataset permissions, and basic navigation from the tasks screen. |
| RDF content visualization | Partial | US-03, US-04 | Triples and sections are shown, but the real UX depends on `DEBUG` and there is no grouping by complexity or exclusive block reservation. |
| Annotation writing | Partial | US-05, US-06 | The backend can save annotations; the front end is not wired end-to-end by default. |
| Assisted correction and alerts | Partial | US-07, US-08, US-09, US-10, US-17 | There are suggestions, rejection reasons, and hybrid rules+Ollama validation, but initial generation, deterministic triple coverage, and reviewer flow are missing. |
| Linguistic diversity | Not covered | US-10, US-18 | A set of sentences is not compared with each other and duplicates or low variation are not detected. |
| Human review | Not covered | US-12, US-13, US-14 | There is no functional review domain. |
| Automatic text/translation generation | Not covered | US-15, US-16 | The AI agent only validates; it does not generate drafts. |
| Dataset upload | Partial | US-19 | Importing exists, but without administrator-role restriction. |
| Progress download | Not covered | US-20 | The exposed XML does not incorporate the `Annotation` table, so it does not represent the actual annotation progress. |
| Statistics and reporting | Not covered | US-11, US-14, US-21 | There are progress fields in `Dataset`, but no update logic or dashboards. |
| Governance, roles, and configuration | Not covered | US-22, US-23, US-24 | There are no roles, functional monitoring, or configurable criteria. |

## 3. Coverage By Layers

Legend:
- `Yes`: the layer exists and is implemented for the area.
- `Partial`: there are pieces, but the flow is not closed or the layer is decoupled from the actual use.
- `No`: no implementation has been found for that layer in the area.

| Area | Front | Handlers / MW | Routers | Controllers | Services | Repos / DB | Integration | Overall status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Access and session | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Covered |
| Dataset catalog | Yes | Yes | Yes | Yes | Yes | Yes | - | Covered |
| Dataset and sections visualization | Partial | Yes | Yes | Yes | Yes | Yes | - | Partial |
| Annotation flow | Partial | Yes | Yes | Yes | Yes | Yes | Partial | Partial |
| Automatic / AI validation | Partial | Yes | Yes | Yes | Yes | No | Partial | Partial |
| Human review | No | No | No | No | No | No | No | Not covered |
| Statistics and reporting | Partial | No | No | No | No | Partial | No | Not covered |
| Advanced administration | Partial | Partial | Partial | Partial | Partial | Partial | No | Partial / incomplete |

Detail per layer:
- Front:
  - There is a real UI for login, registration, and dataset listing.
  - The annotation view (`public/js/annotations.js:9`) and the XML view (`public/js/dataset-view.js:4`) are still in `DEBUG` mode, so today they do not represent the real flow by default.
- Handlers / middleware:
  - `middlewares/auth.js:5-26` protects pages and APIs.
  - `middlewares/request-log-middleware.js:143-155` provides technical logging, but not a monitoring feature for administrators.
- Routers:
  - The actual map of the app is limited to `public`, `users`, `datasets`, `annotations`, and `administrator` with `logout` (`app.js:52-58`).
  - There are no routers for reviewer, statistics, roles, criteria configuration, or progress export.
- Controllers:
  - There are controllers for users, datasets, and annotations.
  - There are no controllers for review, reporting, or user governance.
- Services:
  - `services/datasets-service.js` and `services/annotations-service.js` support the current core.
  - `business/spanish-service.js` only validates and saves; it does not generate content.
- Repositories / persistence:
  - There are repositories for `User`, `Dataset`, and `Annotation`.
  - There are no repositories or tables for `Review`, `Role`, `Criteria`, `UserActivity`, or similar.
  - `Annotation` saves sentences and `rejectionReason`, but `getDatasetText()` does not use those annotations to export progress.
- Integration:
  - There is integration with MySQL/Prisma and with Ollama.
  - The integration with Ollama serves for semantic validation, not for draft generation.

## Relevant Structural Findings

- The current functional coverage is closer to an "MVP of authentication + datasets + assisted annotation" than to the full platform described in `documentation/user_stories.txt`.
- The greatest misalignment between backend and product is on the front end:
  - `public/js/annotations.js:619-629`, `683-687`, `734-742`
  - `public/js/dataset-view.js:126-129`
- The greatest misalignment between stories and data domain is the absence of review, role, criteria, and activity entities.
- The greatest misalignment between reporting and persistence is that dataset percentages exist, but there is no logic that recalculates them after annotating or reviewing.

## Verification Support Already Present In The Repo

There are existing tests that back part of the current technical coverage, although they were not executed in this audit:

- Access and session:
  - `tests/users-controller.test.js`
  - `tests/users-service.test.js`
  - `tests/users-database.test.js`
  - `tests/login-session.test.js`
  - `tests/auth-routing.test.js`
- Datasets:
  - `tests/datasets-controller.test.js`
  - `tests/datasets-service.test.js`
  - `tests/datasets-router.test.js`
- Annotation and validation:
  - `tests/annotations-controller.test.js`
  - `tests/annotations-service.test.js`
  - `tests/annotations-router.test.js`
  - `tests/spanish-service-persistence.test.js`
  - `tests/ollama-spanish-checker.test.js`

No equivalent functional battery has been found for human review, roles, statistics, progress export, or configurable criteria, which is consistent with the absence of those capabilities in the code.

## Conclusion

The current system covers access and the dataset catalog well, and partially covers assisted annotation and automatic validation. The rest of the functional vision defined in the user stories is not yet implemented or only appears hinted at in isolated technical pieces.
