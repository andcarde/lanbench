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
 * Identificador entero positivo (1..2^31 - 1).
 * @typedef {number} PositiveInteger
 */

/**
 * Identificador entero no negativo (0..2^31 - 1).
 * @typedef {number} NonNegativeInteger
 */

/**
 * Cadena no vacia tras `trim()`.
 * @typedef {string} NonEmptyString
 */

/**
 * Marca temporal ISO-8601 (`new Date().toISOString()`).
 * @typedef {string} IsoDateString
 */

// ---------------------------------------------------------------------------
// Identity / session
// ---------------------------------------------------------------------------

/**
 * Forma persistida del usuario en la BD y serializada en sesion.
 * Se exporta como clase canonica en `entities/user.js`.
 *
 * @typedef {Object} UserDTO
 * @property {PositiveInteger} id           - Identificador estable del usuario.
 * @property {NonEmptyString} email         - Correo electronico en minusculas.
 * @property {boolean} isModerator         - Rol global (no por-dataset).
 */

/**
 * Payload tal cual se serializa en `request.session.user`.
 * Coincide con `UserDTO` pero todos los campos pueden faltar en
 * sesiones legacy/incompletas.
 *
 * @typedef {Partial<UserDTO>} SessionUserPayload
 */

/**
 * Roles por dataset (tabla `permits`).
 * @typedef {'annotator'|'reviewer'|'admin'} DatasetRole
 */

// ---------------------------------------------------------------------------
// Dataset / entries
// ---------------------------------------------------------------------------

/**
 * Triple RDF normalizado.
 * @typedef {Object} TripleDTO
 * @property {NonEmptyString} subject
 * @property {NonEmptyString} predicate
 * @property {NonEmptyString} object
 */

/**
 * Permisos del usuario actual sobre un dataset.
 * @typedef {Object} DatasetPermissionsDTO
 * @property {boolean} annotator
 * @property {boolean} reviewer
 * @property {boolean} admin
 * @property {boolean} owner
 * @property {boolean} canAdmin
 */

/**
 * Estado de revision del usuario actual sobre un dataset.
 * @typedef {Object} DatasetReviewStateDTO
 * @property {boolean} canReview
 * @property {boolean} showReviewButton
 * @property {boolean} reviewAvailable
 * @property {NonNegativeInteger} reviewableCount
 */

/**
 * Opciones declaradas a nivel de dataset (modo LLM, revision activa, etc.).
 * @typedef {Object} DatasetOptionsDTO
 * @property {string} llmMode                      - 'none' | 'local' | 'groq' | ...
 * @property {boolean} isReviewEnabled
 * @property {boolean} hasAdditionalReviews
 */

/**
 * Resumen canonico de un dataset (listados y tooltips).
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
 * Contexto canonico de una entry para anotacion/validacion.
 * @typedef {Object} EntryContextDTO
 * @property {PositiveInteger} entryId
 * @property {TripleDTO[]} triples
 * @property {NonEmptyString[]} englishSentences
 * @property {PositiveInteger} sectionIndex
 * @property {string} [category]
 */

/**
 * Bloque canonico de trabajo: una seccion del dataset.
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
 * Severidad de una alerta producida por validacion.
 * @typedef {'info'|'warning'|'error'|'duplicate'|'ok'} ValidationSeverity
 */

/**
 * Incidencia devuelta por la validacion de una oracion.
 * @typedef {Object} ValidationAlertDTO
 * @property {NonEmptyString} code
 * @property {ValidationSeverity} severity
 * @property {NonEmptyString} message
 * @property {string} [suggestion]
 */

/**
 * Resultado canonico de validar una oracion.
 * @typedef {Object} SentenceValidationDTO
 * @property {string} sentence
 * @property {boolean} isValid
 * @property {ValidationAlertDTO[]} alerts
 * @property {string[]} rejectionReasons
 * @property {string} [proposal]
 */

/**
 * Avance de sesion devuelto tras persistir una anotacion.
 * @typedef {Object} SessionAdvanceDTO
 * @property {boolean} sectionDone
 * @property {PositiveInteger} [sectionNumber]
 * @property {NonNegativeInteger} [entryPosition]
 * @property {PositiveInteger} [entryId]
 * @property {number} [entryIndexInSection]
 * @property {boolean} [moreSectionsAvailable]
 */

/**
 * Respuesta canonica tras persistir una anotacion.
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
 * Estados validos de una review.
 * @typedef {'pending'|'in_progress'|'completed'|'disputed'|'released'|'expired'} ReviewStatus
 */

/**
 * Decisiones posibles sobre una review.
 * @typedef {'accepted'|'rejected'|'needs_fix'} ReviewDecision
 */

/**
 * Codigos de criterio reconocidos en revision.
 * @typedef {'criterion_grammar'|'criterion_coverage'|'criterion_diversity'|'criterion_semantic_fidelity'} ReviewCriterionCode
 */

/**
 * Estado de asignacion de seccion al anotador/revisor.
 * @typedef {'active'|'completed'|'expired'|'released'} AssignmentStatus
 */

/**
 * Estado de una entry en el flujo de anotacion.
 * @typedef {'pending'|'in_progress'|'annotated'|'under_review'|'reviewed'|'disputed'} EntryStatus
 */

// ---------------------------------------------------------------------------
// Express-related helpers
// ---------------------------------------------------------------------------

/**
 * Request de Express ya tipado con session opcional.
 * @typedef {import('express').Request} ExpressRequest
 */

/**
 * Response de Express.
 * @typedef {import('express').Response} ExpressResponse
 */

/**
 * Funcion `next` de Express.
 * @typedef {import('express').NextFunction} ExpressNext
 */

/**
 * Handler estandar de Express compatible con async.
 * @typedef {(request: ExpressRequest, response: ExpressResponse, next: ExpressNext) => (void|Promise<void>)} ExpressHandler
 */

/**
 * Router de Express.
 * @typedef {import('express').Router} ExpressRouter
 */

/**
 * Cliente Prisma. Se mantiene `any` para no acoplar tests a tipos generados.
 * @typedef {*} PrismaClientLike
 */

module.exports = {};
