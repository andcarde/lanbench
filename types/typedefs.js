'use strict';

/**
 * @file Shared JSDoc typedefs used across the lanbench codebase.
 *
 * This file exports nothing at runtime — it only declares typedefs so that
 * the rest of the project can annotate parameters and return values with
 * strong types (instead of `*`). Each typedef mirrors the canonical contract
 * documented in `contracts/dtos.json` or a Prisma model.
 *
 * Files that consume these types reference them via JSDoc imports, e.g.:
 *
 *     //{at}typedef {import('../types/typedefs').UserDTO} UserDTO
 *
 * Keeping these definitions in one place makes the eventual TypeScript
 * migration (see `jsconfig.json`) much cheaper: every `* | undefined` can be
 * lifted into an interface without touching consumers.
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/**
 * Positive integer identifier (1..2^31 - 1).
 * @typedef {number} PositiveInteger
 */

/**
 * Non-negative integer identifier (0..2^31 - 1).
 * @typedef {number} NonNegativeInteger
 */

/**
 * Non-empty string after `trim()`.
 * @typedef {string} NonEmptyString
 */

/**
 * ISO-8601 timestamp (`new Date().toISOString()`).
 * @typedef {string} IsoDateString
 */

// ---------------------------------------------------------------------------
// Identity / session
// ---------------------------------------------------------------------------

/**
 * Persisted form of the user in the DB and serialized in the session.
 * Exported as the canonical class in `entities/user.js`.
 *
 * @typedef {Object} UserDTO
 * @property {PositiveInteger} id           - Stable user identifier.
 * @property {NonEmptyString} email         - Email address in lowercase.
 * @property {boolean} isModerator         - Global role (not per-dataset).
 */

/**
 * Payload as it is serialized in `request.session.user`. Matches `UserDTO`
 * but all fields may be missing in legacy/incomplete sessions.
 *
 * @typedef {Partial<UserDTO>} SessionUserPayload
 */

/**
 * Per-dataset roles (`permits` table).
 * @typedef {'annotator'|'reviewer'|'admin'} DatasetRole
 */

// ---------------------------------------------------------------------------
// Dataset / entries
// ---------------------------------------------------------------------------

/**
 * Normalized RDF triple.
 * @typedef {Object} TripleDTO
 * @property {NonEmptyString} subject
 * @property {NonEmptyString} predicate
 * @property {NonEmptyString} object
 */

/**
 * Current user's permissions over a dataset.
 * @typedef {Object} DatasetPermissionsDTO
 * @property {boolean} annotator
 * @property {boolean} reviewer
 * @property {boolean} admin
 * @property {boolean} owner
 * @property {boolean} canAdmin
 */

/**
 * Current user's review state over a dataset.
 * @typedef {Object} DatasetReviewStateDTO
 * @property {boolean} canReview
 * @property {boolean} showReviewButton
 * @property {boolean} reviewAvailable
 * @property {NonNegativeInteger} reviewableCount
 */

/**
 * Options declared at the dataset level (LLM mode, review enabled, etc.).
 * @typedef {Object} DatasetOptionsDTO
 * @property {string} llmMode                      - 'none' | 'local' | 'groq' | ...
 * @property {boolean} isReviewEnabled
 * @property {boolean} hasAdditionalReviews
 */

/**
 * Canonical summary of a dataset (listings and tooltips).
 * @typedef {Object} DatasetListDTO
 * @property {PositiveInteger} id
 * @property {NonEmptyString} name
 * @property {NonNegativeInteger} totalEntries
 * @property {number} completedPercent              - 0..100
 * @property {number} remainPercent                 - 0..100
 * @property {number} [withoutReviewPercent]        - 0..100
 * @property {string[]} [languages]
 * @property {string} [colorClass]
 * @property {DatasetPermissionsDTO} [permissions]
 * @property {DatasetReviewStateDTO} [review]
 * @property {DatasetOptionsDTO} [options]
 */

/**
 * Canonical context of an entry for annotation/validation.
 * @typedef {Object} EntryContextDTO
 * @property {PositiveInteger} entryId
 * @property {TripleDTO[]} triples
 * @property {NonEmptyString[]} englishSentences
 * @property {PositiveInteger} sectionIndex
 * @property {string} [category]
 */

/**
 * Canonical work block: a section of the dataset.
 * @typedef {Object} DatasetSectionDTO
 * @property {PositiveInteger} sectionIndex
 * @property {NonNegativeInteger} totalEntries
 * @property {EntryContextDTO[]} entries
 * @property {PositiveInteger} [datasetId]
 * @property {NonEmptyString} [datasetName]
 * @property {PositiveInteger} [totalSections]
 * @property {PositiveInteger} [sectionSize]
 * @property {PositiveInteger} [startEntry]
 * @property {PositiveInteger} [endEntry]
 * @property {boolean} [isLastSection]
 */

// ---------------------------------------------------------------------------
// Validation / annotation
// ---------------------------------------------------------------------------

/**
 * Severity of an alert produced by validation.
 * @typedef {'info'|'warning'|'error'|'duplicate'|'ok'} ValidationSeverity
 */

/**
 * Issue returned by the validation of a sentence.
 * @typedef {Object} ValidationAlertDTO
 * @property {NonEmptyString} code
 * @property {ValidationSeverity} severity
 * @property {NonEmptyString} message
 * @property {string} [suggestion]
 */

/**
 * Canonical result of validating a sentence.
 * @typedef {Object} SentenceValidationDTO
 * @property {string} sentence
 * @property {boolean} isValid
 * @property {ValidationAlertDTO[]} alerts
 * @property {string[]} rejectionReasons
 * @property {string} [proposal]
 */

/**
 * Session advance returned after persisting an annotation.
 * @typedef {Object} SessionAdvanceDTO
 * @property {boolean} sectionDone
 * @property {PositiveInteger} [sectionNumber]
 * @property {NonNegativeInteger} [entryPosition]
 * @property {PositiveInteger} [entryId]
 * @property {number} [entryIndexInSection]
 * @property {boolean} [moreSectionsAvailable]
 */

/**
 * Canonical response after persisting an annotation.
 * @typedef {Object} SavedAnnotationDTO
 * @property {PositiveInteger} entryId
 * @property {string[]} sentences
 * @property {IsoDateString} savedAt
 * @property {PositiveInteger} [datasetId]
 * @property {boolean|null} [sectionCompleted]
 * @property {SessionAdvanceDTO|null} [sessionAdvance]
 */

// ---------------------------------------------------------------------------
// Review workflow
// ---------------------------------------------------------------------------

/**
 * Valid states of a review.
 * @typedef {'pending'|'in_progress'|'completed'|'disputed'|'released'|'expired'} ReviewStatus
 */

/**
 * Possible decisions on a review.
 * @typedef {'accepted'|'rejected'|'needs_fix'} ReviewDecision
 */

/**
 * Criterion codes recognized in review.
 * @typedef {'criterion_grammar'|'criterion_coverage'|'criterion_diversity'|'criterion_semantic_fidelity'} ReviewCriterionCode
 */

/**
 * Status of a section assignment to the annotator/reviewer.
 * @typedef {'active'|'completed'|'expired'|'released'} AssignmentStatus
 */

/**
 * Status of an entry in the annotation flow.
 * @typedef {'pending'|'in_progress'|'annotated'|'under_review'|'reviewed'|'disputed'} EntryStatus
 */

// ---------------------------------------------------------------------------
// Express-related helpers
// ---------------------------------------------------------------------------

/**
 * Express request, already typed with an optional session.
 * @typedef {import('express').Request} ExpressRequest
 */

/**
 * Express response.
 * @typedef {import('express').Response} ExpressResponse
 */

/**
 * Express `next` function.
 * @typedef {import('express').NextFunction} ExpressNext
 */

/**
 * Standard async-compatible Express handler.
 * @typedef {(request: ExpressRequest, response: ExpressResponse, next: ExpressNext) => (void|Promise<void>)} ExpressHandler
 */

/**
 * Express router.
 * @typedef {import('express').Router} ExpressRouter
 */

/**
 * Prisma client. Kept as `any` so tests are not coupled to generated types.
 * @typedef {*} PrismaClientLike
 */

module.exports = {};
