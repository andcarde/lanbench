```
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║                            L A N B E N C H                           ║
║                                                                      ║
║                          Test Documentation                          ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

> **Created:** 20:15 18/05/2026

---

## Introduction

This document is the canonical inventory of the automated test suite that
exercises **Lanbench**, the linguistic-annotation benchmarking platform. The
suite is split into two layers:

- **Unit tests** (`tests/unit/**`) exercise individual modules in isolation —
  controllers, services, repositories, middlewares, entities, DTO mappers and
  pure helpers. Database and HTTP boundaries are stubbed, so each file can be
  run independently and finishes in milliseconds.
- **Integration tests** (`tests/integration/**`) drive whole flows end-to-end:
  registering and authenticating a user, importing a dataset, walking the
  review wizard, etc. They talk to a real Prisma client and exercise the
  Express app as a black box.

At the time the v0.4 snapshot was taken **all 452 tests in the suite passed**
(439 unit + 13 integration). Each row below lists the file it lives in, the
human-readable test name and the user story (from
[documentation/user_stories.md](documentation/user_stories.md)) it most directly
covers. Tests that exercise subsystems outside the scope of the current user
stories (US-1 … US-6, which are about server vs dataset roles) are marked `—`
in the **User Story** column.

> **Current dry-run (2026-06-25):** Mocha collects **783 tests**:
> **732 unit tests** under `tests/unit/**` and **51 integration tests** under
> `tests/integration/**`. The suite currently spans **107 unit test files** and
> **18 integration test files**.
>
> The original v0.4 tables and the [Update — v0.5 additions](#update--v05-additions)
> section are kept as the historical, human-readable map of the suite. They have
> not been regenerated row by row after later refactors; when an exact aggregate
> is needed, the Mocha dry-run commands above are the authoritative source.

---

## Run commands

### Run the full unit suite

```bash
npm run test:unit
```

Runs every file under `tests/unit/**`. This is the default entry point during
development and the one wired into CI.

### Run the full integration suite

```bash
npm run test:integration
```

Runs every file under `tests/integration/**`. Requires a reachable MySQL
instance configured through the usual Prisma environment variables.

### Run both suites at once

```bash
npm run test:all
```

Convenience wrapper that loads `tests/{unit,integration}/**/*.test.js`.

### Run a single file

```bash
npx mocha tests/unit/<path>.test.js --exit
npx mocha tests/integration/<path>.test.js --exit
```

Useful while iterating on a specific module — Mocha will only load the file
you point at, so the feedback loop is sub-second for unit tests.

### Filter by test name

```bash
npx mocha "tests/unit/**/*.test.js" --grep "reviews-service" --exit
```

`--grep` accepts a substring or regular expression and is matched against the
full `describe` + `it` chain.

### Run with the verbose reporter

```bash
npx mocha "tests/unit/**/*.test.js" --reporter spec --exit
```

Switches Mocha to the `spec` reporter, which prints one line per test —
helpful when triaging a regression in CI logs.

### Dry-run / list tests without executing them

```bash
npx mocha "tests/unit/**/*.test.js" --dry-run --reporter min --exit
```

Walks the entire collection and prints the count without running anything —
useful for sanity-checking that new files are picked up.

### Database schema sanity check

```bash
npm run test:db
```

Runs `tests/db/db-schema-check.js`, which compares the live MySQL schema with
the Prisma model. Independent of Mocha — should be run after every
`npx prisma db push`.

---

## Test Suite

### Unit tests

#### Entities

| # | File | Test | User Story |
|---|------|------|------------|
| 1  | tests/unit/users/user-entity.test.js | user entity normalizes persistence data into the canonical session shape including isModerator | US-3 |
| 2  | tests/unit/users/user-entity.test.js | user entity defaults isModerator to false when persistence row has no flag | US-3 |
| 3  | tests/unit/users/user-entity.test.js | user entity preserves isModerator=true from persistence | US-3 |
| 4  | tests/unit/users/user-entity.test.js | user entity defaults isModerator to false when session payload has no flag | US-3 |
| 5  | tests/unit/users/user-entity.test.js | user entity preserves isModerator from session payload | US-3 |
| 6  | tests/unit/users/user-entity.test.js | user entity rejects legacy session payloads that use id instead of userId | US-3 |
| 7  | tests/unit/users/user-entity.test.js | user entity rejects session payloads without email | US-3 |
| 8  | tests/unit/users/user-entity.test.js | user entity toSession throws for invalid users | US-3 |
| 9  | tests/unit/shared/entity-exports.test.js | Entity exports consistency User is exported as destructurable object | — |
| 10 | tests/unit/shared/entity-exports.test.js | Entity exports consistency EntryDTO is exported as destructurable object | — |
| 11 | tests/unit/shared/entity-exports.test.js | Entity exports consistency Dataset exports have both DatasetDTO and DatasetListItemDTO | — |
| 12 | tests/unit/shared/entity-exports.test.js | Entity exports consistency entry.js has use strict directive | — |

#### Authentication & sessions

| # | File | Test | User Story |
|---|------|------|------------|
| 13 | tests/unit/auth/auth-middleware.test.js | auth middleware requirePageAuth permite continuar cuando hay sesión válida | US-2 |
| 14 | tests/unit/auth/auth-middleware.test.js | auth middleware requirePageAuth fija request.user con isModerator al pasar la autenticación | US-3 |
| 15 | tests/unit/auth/auth-middleware.test.js | auth middleware requirePageAuth deja isModerator=false por defecto si la sesión no lo incluye | US-3 |
| 16 | tests/unit/auth/auth-middleware.test.js | auth middleware requirePageAuth redirige a /login y fija cookie de mensaje cuando no hay sesión válida | US-2 |
| 17 | tests/unit/auth/auth-middleware.test.js | auth middleware requireApiAuth responde 401 JSON cuando no hay usuario autenticado | US-2 |
| 18 | tests/unit/auth/auth-middleware.test.js | auth middleware requireApiAuth permite continuar cuando existe usuario canónico en sesión | US-2 |
| 19 | tests/unit/auth/auth-middleware.test.js | auth middleware requireApiAuth fija request.user con isModerator al pasar la autenticación | US-3 |
| 20 | tests/unit/auth/auth-role-middleware.test.js | requireApiModerator rechaza con 401 cuando no hay sesion valida | US-2 |
| 21 | tests/unit/auth/auth-role-middleware.test.js | requireApiModerator rechaza con 403 cuando el usuario no es moderador | US-2 |
| 22 | tests/unit/auth/auth-role-middleware.test.js | requireApiModerator deja pasar cuando el usuario es moderador | US-2 |
| 23 | tests/unit/auth/auth-role-middleware.test.js | requirePageModerator redirige a /login cuando no hay sesion valida | US-2 |
| 24 | tests/unit/auth/auth-role-middleware.test.js | requirePageModerator redirige a /forbidden cuando el usuario no es moderador | US-2 |
| 25 | tests/unit/auth/auth-role-middleware.test.js | requirePageModerator deja pasar cuando el usuario es moderador y fija request.user | US-2 |
| 26 | tests/unit/auth/auth-routing.test.js | auth routing boundary redirige a /login cuando un navegador accede sin sesión a páginas privadas | US-2 |
| 27 | tests/unit/auth/auth-routing.test.js | auth routing boundary responde 401 JSON cuando un cliente API accede sin sesión a endpoints privados | US-2 |
| 28 | tests/unit/auth/bootstrap-admin.test.js | bootstrap-admin crea un usuario nuevo con isModerator=true cuando el email no existe | US-4 |
| 29 | tests/unit/auth/bootstrap-admin.test.js | bootstrap-admin promueve a moderador un usuario existente sin tocar contrasena | US-4 |
| 30 | tests/unit/auth/bootstrap-admin.test.js | bootstrap-admin rechaza emails vacios o contrasenas cortas | US-4 |
| 31 | tests/unit/auth/bootstrap-admin.test.js | bootstrap-admin runFromEnv usa BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD | US-4 |
| 32 | tests/unit/auth/session-me-api.test.js | GET /api/session/me devuelve 401 si no hay sesion | US-3 |
| 33 | tests/unit/auth/session-me-api.test.js | GET /api/session/me devuelve el usuario canonico con isModerator=true | US-3 |
| 34 | tests/unit/auth/session-me-api.test.js | GET /api/session/me devuelve el usuario canonico con isModerator=false | US-3 |
| 35 | tests/unit/auth/session-me-api.test.js | GET /api/session/me por defecto rellena isModerator=false si la sesion no trae el flag | US-3 |

#### Users

| # | File | Test | User Story |
|---|------|------|------------|
| 36 | tests/unit/users/users-controller.test.js | users-controller register normaliza el email y delega en usersService | US-1 |
| 37 | tests/unit/users/users-controller.test.js | users-controller register devuelve 409 cuando el servicio detecta email duplicado | US-1 |
| 38 | tests/unit/users/users-controller.test.js | users-controller login guarda el usuario de sesión canónico devuelto por usersService | US-1 |
| 39 | tests/unit/users/users-controller.test.js | users-controller login devuelve 401 cuando el servicio rechaza las credenciales | US-1 |
| 40 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator happy path: 201 y delega en service.registerModeratorUser con email normalizado | US-5 |
| 41 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator 400 si el payload base es invalido (email mal formado) | US-5 |
| 42 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator 400 invalid moderator register code si el codigo no cumple [A-Za-z0-9]{16} | US-5 |
| 43 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator 400 cuando el servicio rechaza con invalid_register_code | US-5 |
| 44 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator 409 cuando el servicio rechaza con email_taken | US-5 |
| 45 | tests/unit/users/users-controller-register-moderator.test.js | users-controller registerModerator 500 ante errores inesperados del servicio | US-5 |
| 46 | tests/unit/users/users-repository-nick.test.js | users-repository exact nick lookup normaliza espacios y mayusculas para buscar por email operativo | — |
| 47 | tests/unit/users/users-repository-nick.test.js | users-repository exact nick lookup devuelve null si el nick queda vacio | — |
| 48 | tests/unit/users/users-repository-role.test.js | users-repository isModerator projection findByEmail incluye isModerator en el select de Prisma | US-3 |
| 49 | tests/unit/users/users-repository-role.test.js | users-repository isModerator projection setIsModerator actualiza el flag en Prisma | US-3 |
| 50 | tests/unit/users/users-router-endpoints.test.js | users router endpoints (renamed from usuarios) should have /create-session endpoint instead of /crear-sesion | — |
| 51 | tests/unit/users/users-router-endpoints.test.js | users router endpoints (renamed from usuarios) should not have legacy /crear-sesion endpoint | — |
| 52 | tests/unit/users/users-router-endpoints.test.js | users router endpoints (renamed from usuarios) should export createUsersRouter (not createUsuariosRouter) | — |
| 53 | tests/unit/users/users-service.test.js | users-service registerUser hashea la contraseña antes de persistirla | US-1 |
| 54 | tests/unit/users/users-service.test.js | users-service authenticateUser valida contraseñas hasheadas y devuelve el usuario de sesión | US-1 |
| 55 | tests/unit/users/users-service.test.js | users-service authenticateUser migra contraseñas legacy en claro a hash al iniciar sesión | US-1 |
| 56 | tests/unit/users/users-service.test.js | users-service authenticateUser rechaza credenciales inválidas | US-1 |
| 57 | tests/unit/users/users-service-register-moderator.test.js | users-service registerModeratorUser happy path: consume el codigo y crea el usuario con isModerator=true | US-5 |
| 58 | tests/unit/users/users-service-register-moderator.test.js | users-service registerModeratorUser rechaza si el codigo tiene forma invalida sin tocar ningun repositorio | US-5 |
| 59 | tests/unit/users/users-service-register-moderator.test.js | users-service registerModeratorUser email ya registrado: 409 SIN consumir el codigo (garantia no-burn) | US-5 |
| 60 | tests/unit/users/users-service-register-moderator.test.js | users-service registerModeratorUser codigo no encontrado: 400 invalid_register_code y no crea usuario | US-5 |
| 61 | tests/unit/users/users-service-role-propagation.test.js | users-service isModerator propagation propaga isModerator=true desde DB hasta el payload de sesion | US-3 |
| 62 | tests/unit/users/users-service-role-propagation.test.js | users-service isModerator propagation propaga isModerator=false desde DB hasta el payload de sesion | US-3 |

#### Datasets

| # | File | Test | User Story |
|---|------|------|------------|
| 63  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service caso 4 reanuda una sesion activa existente | — |
| 64  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service caso 4 crea sesion si ya existe una seccion activa asignada al usuario | — |
| 65  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service caso 5 asigna la siguiente seccion secuencial usando max sectionIndex + 1 | — |
| 66  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service caso 3 avisa si no quedan secciones sin asignar | — |
| 67  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service advanceSession avanza la entry dentro de la seccion | — |
| 68  | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service advanceSession borra la sesion al terminar la seccion e indica si se puede seguir | — |
| 69  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration marca boton de revision cuando el usuario es reviewer y el dataset no esta completo | — |
| 70  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration activa el boton si el usuario ya tiene una review activa del dataset | — |
| 71  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration lista permisos cuando el usuario actual es admin del dataset | — |
| 72  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration rechaza la administracion si el usuario no tiene permiso admin en el dataset | — |
| 73  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration anade por nick exacto con permiso annotator por defecto | — |
| 74  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration borra la fila cuando se desmarcan los tres permisos | — |
| 75  | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration normaliza helpers del frontend | — |
| 76  | tests/unit/datasets/dataset-statistics.test.js | dataset statistics calcula rankings, porcentajes truncados, tiempo medio y precision | — |
| 77  | tests/unit/datasets/dataset-statistics.test.js | dataset statistics trunca porcentajes sin redondear | — |
| 78  | tests/unit/datasets/datasets-admin-front.test.js | datasets admin frontend helpers (E5) normaliseRole solo activa administracion para admin | US-3 |
| 79  | tests/unit/datasets/datasets-admin-front.test.js | datasets admin frontend helpers (E5) buildDatasetExportUrl valida ids positivos y normaliza formato | US-2 |
| 80  | tests/unit/datasets/datasets-admin-front.test.js | datasets admin frontend helpers (E5) buildDatasetDeleteUrl valida ids positivos | US-2 |
| 81  | tests/unit/datasets/datasets-admin-front.test.js | datasets admin frontend helpers (E5) normaliseCriterion tolera entradas parciales | — |
| 82  | tests/unit/datasets/datasets-api-role.test.js | datasets API role protection (T1.3) POST /api/datasets responde 403 para un usuario normal | US-2 |
| 83  | tests/unit/datasets/datasets-api-role.test.js | datasets API role protection (T1.3) POST /api/datasets responde 401 si no hay sesion | US-2 |
| 84  | tests/unit/datasets/datasets-api-role.test.js | datasets API role protection (T1.3) GET /api/datasets sigue disponible para un usuario normal | US-2 |
| 85  | tests/unit/datasets/datasets-api-role.test.js | datasets API role protection (T1.3) POST /api/datasets deja pasar al controlador cuando el usuario es moderador | US-2 |
| 86  | tests/unit/datasets/datasets-controller.test.js | datasets-controller listAllDatasets devuelve 403 cuando la sesión no es válida | — |
| 87  | tests/unit/datasets/datasets-controller.test.js | datasets-controller listAllDatasets devuelve el listado canónico desde datasetsService | — |
| 88  | tests/unit/datasets/datasets-controller.test.js | datasets-controller getDatasetById devuelve 400 cuando id no es entero positivo | — |
| 89  | tests/unit/datasets/datasets-controller.test.js | datasets-controller getDatasetById devuelve 400 cuando id es un entero negativo | — |
| 90  | tests/unit/datasets/datasets-controller.test.js | datasets-controller getDatasetSection devuelve la carga canónica construida por datasetsService | — |
| 91  | tests/unit/datasets/datasets-controller.test.js | datasets-controller continueDataset delega en continueDatasetService y devuelve el caso calculado | — |
| 92  | tests/unit/datasets/datasets-controller.test.js | datasets-controller getDatasetText devuelve el XML original como text/plain | — |
| 93  | tests/unit/datasets/datasets-controller.test.js | datasets-controller createDataset devuelve 400 si no se sube fichero | — |
| 94  | tests/unit/datasets/datasets-controller.test.js | datasets-controller createDataset delega en datasetsService y responde 201 | — |
| 95  | tests/unit/datasets/datasets-controller.test.js | datasets-controller deleteDataset delega en datasetsService y responde 200 | — |
| 96  | tests/unit/datasets/datasets-controller.test.js | datasets-controller deleteDataset devuelve 400 cuando id no es entero positivo | — |
| 97  | tests/unit/datasets/datasets-repository-delete.test.js | datasets-repository deleteDatasetRecursively borra el grafo dependiente antes de eliminar el dataset | — |
| 98  | tests/unit/datasets/datasets-repository-delete.test.js | datasets-repository createOwnedDataset usa una transacción amplia y divide las inserciones masivas en lotes | — |
| 99  | tests/unit/datasets/datasets-router.test.js | datasets router integration expone POST /api/datasets como endpoint canónico de creación | — |
| 100 | tests/unit/datasets/datasets-router.test.js | datasets router integration expone DELETE /api/datasets/:id como endpoint de borrado total | — |
| 101 | tests/unit/datasets/datasets-router.test.js | datasets router integration devuelve el listado canónico en GET /api/datasets | — |
| 102 | tests/unit/datasets/datasets-router.test.js | datasets router integration obtiene las entries canónicas correspondientes a un dataset y sección dados en GET /api/datasets/1/sections/1 | — |
| 103 | tests/unit/datasets/datasets-router.test.js | datasets router integration sirve el listado canónico datasets.html en GET /datasets | — |
| 104 | tests/unit/datasets/datasets-router.test.js | datasets router integration sirve la página dataset-view.html en GET /datasets/1/view | — |
| 105 | tests/unit/datasets/datasets-router.test.js | datasets router integration devuelve el texto del dataset en GET /api/datasets/1/text | — |
| 106 | tests/unit/datasets/datasets-service.test.js | datasets-service createDataset importa el XML a entryRecords y los persiste junto al dataset | — |
| 107 | tests/unit/datasets/datasets-service.test.js | datasets-service createDataset persiste las opciones de creacion normalizadas | — |
| 108 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetSection lee las entries desde el modelo relacional y devuelve DatasetSection canónico | — |
| 109 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetText reconstruye el XML desde el modelo relacional | — |
| 110 | tests/unit/datasets/datasets-service.test.js | datasets-service deleteDataset exige administracion y delega el borrado recursivo | — |
| 111 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity devuelve false para array vacío | — |
| 112 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity devuelve false para complejidad desconocida | — |
| 113 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity low: mayoría de tamaños 1-2 → true | — |
| 114 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity low: mayoría de tamaños > 2 → false | — |
| 115 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity medium: mayoría de tamaños 3-5 → true | — |
| 116 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service sectionMatchesComplexity high: mayoría de tamaños ≥ 6 → true | — |
| 117 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service requestSection devuelve la asignación activa existente sin crear otra | — |
| 118 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service requestSection asigna la primera sección no ocupada cuando complexity=any | — |
| 119 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service requestSection lanza ServiceError 404 si el dataset no existe | — |
| 120 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service requestSection lanza ServiceError 404 si todas las secciones están ocupadas | — |
| 121 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service releaseSection actualiza el estado de la asignación a released | — |
| 122 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service resumeSection devuelve la asignación activa existente | — |
| 123 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service resumeSection devuelve null si no hay asignación activa | — |
| 124 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service completeAssignmentIfSectionDone devuelve false si no hay asignación activa para el usuario | — |
| 125 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service completeAssignmentIfSectionDone devuelve false si la asignación es de otra sección | — |
| 126 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service completeAssignmentIfSectionDone devuelve false si no hay entries en la sección | — |
| 127 | tests/unit/datasets/section-assignment-service.test.js | section-assignment-service completeAssignmentIfSectionDone marca la asignación como completada y devuelve true cuando todas las entries están anotadas | — |
| 128 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository findActiveAssignment llama a prisma con los filtros correctos | — |
| 129 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository findActiveSectionIndexes devuelve un Set con los índices de sección activos | — |
| 130 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository findActiveSectionIndexes devuelve Set vacío si no hay asignaciones activas | — |
| 131 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository createAssignment persiste la asignación con status active | — |
| 132 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository expireStaleAssignments actualiza a expired las asignaciones activas vencidas | — |
| 133 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository updateUserDatasetAssignmentStatus actualiza con los filtros correctos de usuario y dataset | — |
| 134 | tests/unit/datasets/toolbar-role.test.js | toolbar isModerator-aware rendering un usuario normal recibe "Datasets" y "Mis estadísticas" sin badge | US-3 |
| 135 | tests/unit/datasets/toolbar-role.test.js | toolbar isModerator-aware rendering un moderador recibe enlaces a /reviewer, /datasets, /my-stats y badge | US-3 |
| 136 | tests/unit/datasets/toolbar-role.test.js | toolbar isModerator-aware rendering todo usuario autenticado recibe Datasets y estadísticas personales | US-3 |

#### Annotations

| # | File | Test | User Story |
|---|------|------|------------|
| 137 | tests/unit/annotations/annotations-controller.test.js | annotations-controller check acepta EntryContext canónico y devuelve SentenceValidation canónico | — |
| 138 | tests/unit/annotations/annotations-controller.test.js | annotations-controller check devuelve 400 cuando el payload es inválido | — |
| 139 | tests/unit/annotations/annotations-controller.test.js | annotations-controller send acepta ids canónicos y devuelve SavedAnnotation canónico | — |
| 140 | tests/unit/annotations/annotations-controller.test.js | annotations-controller check no aplica reglas de longitud: oraciones cortas se delegan en el servicio | — |
| 141 | tests/unit/annotations/annotations-controller.test.js | annotations-controller send devuelve 403 si no hay sesión válida | — |
| 142 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatStatusLabel mapea completed a Aceptada y disputed a En disputa | — |
| 143 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFailedCriteria devuelve Ninguno cuando no hay fallos | — |
| 144 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFailedCriteria lista codigos y decisiones separados por coma | — |
| 145 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatCorrections devuelve Sin cambios cuando no hay correcciones | — |
| 146 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatCorrections proyecta sentenceIndex y correctedSentence | — |
| 147 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFeedbackRow review disputed con criterio fallido devuelve string con codigo | — |
| 148 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFeedbackRow review completed sin criterios fallidos devuelve etiqueta Aceptada | — |
| 149 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFeedbackRow review con texto corregido lo refleja en correctionsSummary | — |
| 150 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) formatFeedbackRow null o no objeto devuelve null | — |
| 151 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) renderFeedbackTable mensaje informativo cuando no hay feedback | — |
| 152 | tests/unit/annotations/annotations-feedback.test.js | annotations-feedback (T4.6) renderFeedbackTable genera una tabla con una fila por revision | — |
| 153 | tests/unit/annotations/annotations-router.test.js | annotations router integration mantiene POST /api/annotations/check y POST /api/annotations/send enlazados al controller | — |
| 154 | tests/unit/annotations/annotations-router.test.js | annotations router integration deja las rutas de anotaciones sólo en el router dedicado y sin aliases legacy | — |
| 155 | tests/unit/annotations/annotations-service.test.js | annotations-service checkSentences usa checkBatch cuando el spanishService lo soporta | — |
| 156 | tests/unit/annotations/annotations-service.test.js | annotations-service checkSentences devuelve SentenceValidation canónico y construye el contexto por índice | — |
| 157 | tests/unit/annotations/annotations-service.test.js | annotations-service checkSentences conserva proposal en el SentenceValidation canónico | — |
| 158 | tests/unit/annotations/annotations-service.test.js | annotations-service saveSentences delega la persistencia y devuelve SavedAnnotation canónico | — |
| 159 | tests/unit/annotations/annotations-service.test.js | annotations-service saveSentences propaga errores de guardado envueltos en { error } | — |
| 160 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentsRepository inyectado lanza 403 si no hay asignación activa para la sección | — |
| 161 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentsRepository inyectado lanza 403 si la asignación activa es de otra sección | — |
| 162 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentsRepository inyectado guarda correctamente cuando la asignación coincide | — |
| 163 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentsRepository inyectado omite la validación de asignación si no hay sectionNumber | — |
| 164 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentService inyectado propaga sectionCompleted=true cuando el servicio lo confirma | — |
| 165 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentService inyectado propaga sectionCompleted=false cuando quedan entries por anotar | — |
| 166 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow saveSentences con sectionAssignmentService inyectado trata errores del sectionAssignmentService como sectionCompleted=false | — |

#### Reviews

| # | File | Test | User Story |
|---|------|------|------------|
| 167 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) fetchNextReview hace POST a /api/reviews/request | — |
| 168 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) fetchNextReview envia datasetId cuando se acota a dataset | — |
| 169 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) fetchReviewContext hace GET con id en path | — |
| 170 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) submitDecision serializa body como JSON | — |
| 171 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) submitCorrection apunta a /corrections | — |
| 172 | tests/unit/reviews/reviewer-actions.test.js | reviewer-actions (T4.5) finalizeReview y releaseReview hacen POST | — |
| 173 | tests/unit/reviews/reviewer-router.test.js | reviewer router page (T1.5) redirige a /login si no hay sesion | US-2 |
| 174 | tests/unit/reviews/reviewer-router.test.js | reviewer router page (T1.5) sirve la pagina a un usuario normal autenticado (gating per-dataset aguas abajo) | US-2 |
| 175 | tests/unit/reviews/reviewer-router.test.js | reviewer router page (T1.5) sirve la pagina al moderador autenticado | US-2 |
| 176 | tests/unit/reviews/reviewer-router.test.js | reviewer router page (T1.5) sirve la pagina a otro usuario normal autenticado | US-2 |
| 177 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) buildCriteriaState marca como decided los criterios con decision previa | — |
| 178 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) buildCriteriaState soporta inputs vacios | — |
| 179 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) computeNextActiveCriterion devuelve null si todos estan decididos | — |
| 180 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) computeNextActiveCriterion devuelve el primer no decidido | — |
| 181 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) computeNextActiveCriterion soporta arrays vacios sin lanzar | — |
| 182 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) canFinalize solo true cuando todos los criterios estan decididos | — |
| 183 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) sentence review helpers construye estado de frases desde anotaciones y correcciones previas | — |
| 184 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) sentence review helpers solo permite terminar con todas las frases decididas y alternativas completas | — |
| 185 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) sentence review helpers resume las frases rechazadas para la decision global | — |
| 186 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) requiresComment rejected y needs_fix exigen comentario | — |
| 187 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) isCriterionUnlocked el primero siempre esta desbloqueado | — |
| 188 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) isCriterionUnlocked un criterio se desbloquea cuando los anteriores estan decididos | — |
| 189 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) isCriterionUnlocked codigo desconocido devuelve false | — |
| 190 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) escapeHtml escapa los caracteres peligrosos | — |
| 191 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) requestNext responde 200 con la review devuelta por el servicio | — |
| 192 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) requestNext propaga el status del ServiceError | — |
| 193 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) requestNext responde 401 si no hay usuario en sesion | — |
| 194 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) submitDecision rechaza payload incompleto con 400 | — |
| 195 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) submitDecision llama al servicio con campos normalizados | — |
| 196 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) submitCorrection rechaza si falta sentenceIndex o correctedSentence | — |
| 197 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) submitCorrection responde 200 con la lista de comentarios | — |
| 198 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) finalize responde 409 cuando faltan criterios | — |
| 199 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) release responde 204 sin body cuando se libera correctamente | — |
| 200 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) feedbackForAnnotator llama al servicio con annotatorId del usuario | — |
| 201 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) findActiveReviewByReviewer filtra por reviewerId y solo estados pending/in_progress | — |
| 202 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) findReviewableEntries excluye entries del propio reviewer y entries con review activa o terminal | — |
| 203 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) createReview crea con status pending y currentCriterionIndex 0 | — |
| 204 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) expireStaleReviews solo afecta a reviews activas con expiresAt < cutoff | — |
| 205 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) upsertDecision usa upsert con clave compuesta (reviewId, criterionCode) | — |
| 206 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) createComment persiste el comentario con todos sus campos | — |
| 207 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) findCompletedReviewsForAnnotator filtra por annotatorId y por estados terminales | — |
| 208 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) findCompletedReviewsForAnnotator omite el filtro de dataset cuando no se proporciona | — |
| 209 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) updateReviewProgress actualiza currentCriterionIndex y opcionalmente status | — |
| 210 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) updateReviewStatus actualiza status y completedAt cuando se proporciona | — |
| 211 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) updateReviewStatus no incluye completedAt cuando no se proporciona | — |
| 212 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) POST /api/reviews/request sin sesion devuelve 401 | US-2 |
| 213 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) POST /api/reviews/request sin datasetId y sin moderador devuelve 403 | US-2 |
| 214 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) POST /api/reviews/request con datasetId pasa al controller aun sin ser moderador | US-2 |
| 215 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) POST /api/reviews/request con moderador devuelve 200 | US-2 |
| 216 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) GET /api/reviews/feedback accesible para cualquier usuario autenticado | US-2 |
| 217 | tests/unit/reviews/reviews-router.test.js | reviews-api router (T4.4) POST /api/reviews/:id/decisions pasa al controller | — |
| 218 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview crea una review nueva cuando no hay activa y existe candidato | — |
| 219 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview devuelve la review activa existente sin crear otra | — |
| 220 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview lanza no_review_available cuando no hay candidatos | — |
| 221 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview lanza annotator_missing si la entry no tiene annotations | — |
| 222 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview acota la busqueda al dataset si el usuario tiene permiso de reviewer | — |
| 223 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) requestNextReview rechaza dataset acotado si el usuario no es reviewer del dataset | — |
| 224 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision rechaza con criterion_locked si se salta criterios | — |
| 225 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision rechaza con comment_required si decision rechazada sin comentario | — |
| 226 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision rechaza con review_not_assigned cuando otro reviewer intenta operar | — |
| 227 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision avanza currentCriterionIndex y pasa a in_progress | — |
| 228 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision permite reabrir un criterio anterior sin avanzar el indice | — |
| 229 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitTextCorrection lanza comment_required si falta comentario | — |
| 230 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitTextCorrection persiste el comentario cuando hay corrected y comment | — |
| 231 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview rechaza con criteria_incomplete si faltan decisiones | — |
| 232 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview marca completed + entry reviewed si todo es accepted | — |
| 233 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview marca disputed + entry disputed si alguna decision no es accepted | — |
| 234 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) releaseReview marca como released cuando pertenece al reviewer | — |
| 235 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) releaseReview rechaza ajeno con review_not_assigned | — |
| 236 | tests/unit/reviews/reviews-service.test.js | reviews-service buildFeedbackEntry proyecta criterios fallidos y comentarios | — |
| 237 | tests/unit/reviews/reviews-service.test.js | reviews-service buildFeedbackEntry devuelve arrays vacios cuando no hay decisiones ni comentarios | — |
| 238 | tests/unit/reviews/reviews-service.test.js | reviews-service buildReviewContextDTO aplana triples y filtra lex inglesas | — |
| 239 | tests/unit/reviews/reviews-service.test.js | reviews-service buildReviewContextDTO soporta entry null sin lanzar | — |

#### Admin

| # | File | Test | User Story |
|---|------|------|------------|
| 240 | tests/unit/admin/admin-api-router.test.js | admin api router (E5) exige rol moderator para consultar resumen de datasets | US-2 |
| 241 | tests/unit/admin/admin-api-router.test.js | admin api router (E5) permite a moderator consultar resumen, exportar y mantener criterios | US-2 |
| 242 | tests/unit/admin/admin-service.test.js | admin-service (E5) calcula resumen administrativo normalizado de datasets | US-2 |
| 243 | tests/unit/admin/admin-service.test.js | admin-service (E5) exporta avances reales en JSON incluyendo anotaciones y decisiones | US-2 |
| 244 | tests/unit/admin/admin-service.test.js | admin-service (E5) exporta avances reales en XML simple | US-2 |
| 245 | tests/unit/admin/admin-service.test.js | admin-service (E5) rechaza formatos de exportacion desconocidos | US-2 |
| 246 | tests/unit/admin/admin-service.test.js | admin-service (E5) crea criterios de evaluacion validos | US-2 |
| 247 | tests/unit/admin/admin-service.test.js | admin-service (E5) actualizar un criterio delega versionado al repositorio | US-2 |
| 248 | tests/unit/admin/admin-service.test.js | admin-service (E5) rechaza criterios con clave vacia o invalida | US-2 |

#### Spanish & linguistic checks

| # | File | Test | User Story |
|---|------|------|------------|
| 249 | tests/unit/spanish/diversity-checker.test.js | diversity-checker detecta baja diversidad entre frases muy parecidas | — |
| 250 | tests/unit/spanish/diversity-checker.test.js | diversity-checker no genera alertas con una sola frase | — |
| 251 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts no añade alerta si no hay previousSentences | — |
| 252 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts no añade alerta si previousSentences esta vacio | — |
| 253 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts añade alerta repeated_sentence cuando la oracion coincide exactamente | — |
| 254 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts la comparacion es case-insensitive | — |
| 255 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts ignora espacios iniciales y finales en la comparacion | — |
| 256 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts no añade alerta cuando las oraciones son distintas | — |
| 257 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts solo marca las oraciones que coinciden cuando hay varias | — |
| 258 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts conserva las alertas previas del LLM y añade repeated_sentence ademas | — |
| 259 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts no añade alerta para oraciones vacias | — |
| 260 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection injectDuplicateAlerts ignora entradas no-string en previousSentences | — |
| 261 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection checkSentences con previousSentences en entryContext inyecta alerta duplicate cuando una oracion ya fue enviada | — |
| 262 | tests/unit/spanish/repeated-sentence-detection.test.js | repeated-sentence-detection checkSentences con previousSentences en entryContext no inyecta alerta si previousSentences no esta en el contexto | — |
| 263 | tests/unit/spanish/rule-checker.test.js | rule-checker marca como fallo inmediato las oraciones vacías | — |
| 264 | tests/unit/spanish/rule-checker.test.js | rule-checker detecta error ortográfico en "ago" sin marcarlo como fallo inmediato | — |
| 265 | tests/unit/spanish/rule-checker.test.js | rule-checker rechaza oraciones claramente inglesas o mezcladas | — |
| 266 | tests/unit/spanish/rule-checker.test.js | rule-checker acepta oraciones bien formadas con puntuación final | — |
| 267 | tests/unit/spanish/spanish-draft-generator.test.js | spanish-draft-generator resolveMode prioriza translate cuando hay referencia inglesa | — |
| 268 | tests/unit/spanish/spanish-draft-generator.test.js | spanish-draft-generator resolveMode degrada translate a verbalize cuando no hay referencia | — |
| 269 | tests/unit/spanish/spanish-draft-generator.test.js | spanish-draft-generator buildFallbackDrafts genera borradores a partir de triples si no hay referencias | — |
| 270 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion no genera incomplete_sentence para "ejerce el liderazgo" | — |
| 271 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion no genera relation_missing para "ejerce el liderazgo" | — |
| 272 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion valida como correcta sin alertas de error cuando el LLM tambien la acepta | — |
| 273 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion suprime rdf_error del LLM cuando la oracion cubre el triple con sinonimos validos | — |
| 274 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion reconoce "ejerce" como marcador de oracion completa | — |
| 275 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service "ejerce el liderazgo" regresion sigue detectando errores reales: objeto cambiado en leaderTitle | — |
| 276 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence checkBatch fusiona reglas locales con alertas semanticas de Ollama | — |
| 277 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence checkBatch degrada falsos relation_missing de leaderTitle a aviso cuando la relacion esta cubierta | — |
| 278 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence checkBatch suprime falsos positivos del LLM cuando la cobertura determinista es completa | — |
| 279 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence checkBatch mantiene error determinista cuando falta el objeto del triple | — |
| 280 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence checkBatch pide otra respuesta a Ollama y adjunta proposal cuando el LLM rechaza una oracion | — |
| 281 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence save persiste anotaciones ligadas a entry y user mediante el repositorio | — |
| 282 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence buildAnnotationRow consolida varias frases en una sola anotacion por entry y dataset | — |
| 283 | tests/unit/spanish/triple-coverage-checker.test.js | triple-coverage-checker marca un triple como cubierto cuando aparecen sujeto, predicado y objeto | — |
| 284 | tests/unit/spanish/triple-coverage-checker.test.js | triple-coverage-checker marca un triple como ausente cuando falta información relevante | — |

#### Ollama

| # | File | Test | User Story |
|---|------|------|------------|
| 285 | tests/unit/ollama/ollama-client.test.js | ollama-client normaliza host y parsea el JSON contenido en response | — |
| 286 | tests/unit/ollama/ollama-client.test.js | ollama-client lanza error detallado cuando Ollama responde con status no satisfactorio | — |
| 287 | tests/unit/ollama/ollama-client.test.js | ollama-client lanza error cuando el payload no contiene response textual | — |
| 288 | tests/unit/ollama/ollama-client.test.js | ollama-client transforma AbortError en mensaje de timeout de Ollama | — |
| 289 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker getSystemPrompt debe devolver el prompt del sistema | — |
| 290 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker getSystemPrompt debe devolver el prompt de lote con validations | — |
| 291 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker getSystemPrompt debe devolver el prompt de propuestas con proposals | — |
| 292 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker buildCheckPrompt genera prompt con todos los campos | — |
| 293 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker buildCheckPrompt genera prompt con campos mínimos | — |
| 294 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker buildCheckPrompt genera prompt de lote con indices, referencias y triples | — |
| 295 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker buildCheckPrompt genera prompt de propuesta solo para validaciones rechazadas | — |
| 296 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker normalizeOllamaResult devuelve válido si el resultado es válido | — |
| 297 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker normalizeOllamaResult devuelve inválido con razón y sugerencia | — |
| 298 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker normalizeOllamaResult rellena valores por defecto si faltan campos | — |
| 299 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker normalizeOllamaResult normaliza validaciones de lote con alertas | — |
| 300 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker normalizeOllamaResult normaliza propuestas de correccion por indice | — |
| 301 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker parseRawResponse parsea un JSON válido | — |
| 302 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker parseRawResponse lanza error si no hay JSON | — |
| 303 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker parseRawResponse lanza error si el JSON es inválido | — |
| 304 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker check devuelve el resultado normalizado | — |
| 305 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker check checkBatch llama a Ollama una sola vez y normaliza por indice | — |
| 306 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker check proposeCorrectionsBatch llama a Ollama y devuelve propuestas por indice | — |

#### XML

| # | File | Test | User Story |
|---|------|------|------------|
| 307 | tests/unit/xml/xml-format.test.js | xml-format shared helpers expone la lista canónica de tags XML que siempre deben tratarse como array | — |
| 308 | tests/unit/xml/xml-format.test.js | xml-format shared helpers crea un parser que normaliza tags singleton como arrays | — |
| 309 | tests/unit/xml/xml-format.test.js | xml-format shared helpers normaliza valores opcionales a array | — |
| 310 | tests/unit/xml/xml-format.test.js | xml-format shared helpers extrae texto desde strings y nodos parseados | — |
| 311 | tests/unit/xml/xml-format.test.js | xml-format shared helpers parsea triples separados por pipes conservando pipes adicionales en el objeto | — |
| 312 | tests/unit/xml/xml-reader-parsing.test.js | xml-reader parsing with shared xml-format helpers parseDatasetXml acepta XML inline y devuelve DTOs del dominio | — |
| 313 | tests/unit/xml/xml-reader-parsing.test.js | xml-reader parsing with shared xml-format helpers parseDatasetImport produce un grafo canónico con hijos y orden estable | — |
| 314 | tests/unit/xml/xml-reader-parsing.test.js | xml-reader parsing with shared xml-format helpers parseAnnotationEntries reutiliza el parser compartido para triples y frases en inglés | — |
| 315 | tests/unit/xml/xml-reader-parsing.test.js | xml-reader parsing with shared xml-format helpers xml-writer sigue exportando la operación de escritura tras la migración al módulo común | — |
| 316 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() devuelve una instancia de DatasetDTO | — |
| 317 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() entries es un Array | — |
| 318 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() contiene las 790 entries del fichero ru_dev.xml | — |
| 319 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() cada entry es una instancia de EntryDTO | — |
| 320 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() eid y size son números | — |
| 321 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() primera entry tiene los campos correctos | — |
| 322 | tests/unit/xml/xml-reader.test.js | xml-reader readDataset() shape y shapeType son null cuando el atributo está ausente | — |
| 323 | tests/unit/xml/xml-writer.test.js | xml-writer integración round-trip writeDataset serializa el dataset y devuelve un nombre de 32 caracteres | — |
| 324 | tests/unit/xml/xml-writer.test.js | xml-writer integración round-trip el DatasetDTO resultante es idéntico al original (round-trip completo) | — |
| 325 | tests/unit/xml/xml-writer.test.js | xml-writer integración round-trip cada entry del fichero generado conserva eid, category, shape, shapeType y size | — |
| 326 | tests/unit/xml/xml-writer-async.test.js | xml-writer async/await API writeDataset should be an async function | — |
| 327 | tests/unit/xml/xml-writer-async.test.js | xml-writer async/await API writeDataset should return a Promise | — |

#### Operator tools

| # | File | Test | User Story |
|---|------|------|------------|
| 328 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes genera N codigos con longitud 16 y charset [A-Za-z0-9] | US-6 |
| 329 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes todos los codigos dentro del batch son unicos | US-6 |
| 330 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes llama insertCodes exactamente una vez con el mismo array devuelto | US-6 |
| 331 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes respeta la fuente de aleatoriedad inyectada (determinismo) | US-6 |
| 332 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes rechaza count invalido sin llamar al repositorio | US-6 |
| 333 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes generateRegisterCodes propaga errores del repositorio (no hay salida parcial) | US-6 |
| 334 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes runFromStdin imprime cada codigo en una linea propia en stdout | US-6 |
| 335 | tests/unit/tools/generate-register-codes.test.js | generate-register-codes runFromStdin rechaza count no entero sin escribir en stdout | US-6 |

#### Contracts, mappers & shared

| # | File | Test | User Story |
|---|------|------|------------|
| 336 | tests/unit/shared/app-error-handler.test.js | app error handler sirve not-found.html para errores 404 | — |
| 337 | tests/unit/shared/app-error-handler.test.js | app error handler sirve bad-request.html para errores 400 | — |
| 338 | tests/unit/shared/app-error-handler.test.js | app error handler sirve problema.html y conserva la razón para errores 500 | — |
| 339 | tests/unit/shared/assignment-status-constants.test.js | assignment-status constants exporta los cuatro valores de estado de asignación | — |
| 340 | tests/unit/shared/assignment-status-constants.test.js | assignment-status constants ALL_ASSIGNMENT_STATUSES contiene exactamente los cuatro estados | — |
| 341 | tests/unit/shared/database-health.test.js | database health checkDatabaseConnection devuelve true cuando la conexión se abre | — |
| 342 | tests/unit/shared/database-health.test.js | database health checkDatabaseConnection devuelve false cuando la conexión falla | — |
| 343 | tests/unit/shared/database-health.test.js | database health warnIfDatabaseInactive muestra el mensaje pedido si la conexión no está activa | — |
| 344 | tests/unit/shared/database-health.test.js | database health warnIfDatabaseInactive no avisa si la conexión está activa | — |
| 345 | tests/unit/shared/dto-contracts.test.js | dto contracts define los DTOs canónicos requeridos en contracts/dtos.json | — |
| 346 | tests/unit/shared/dto-contracts.test.js | dto contracts documenta obligatorios y opcionales en los DTOs nucleares | — |
| 347 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO normaliza tanto forma legacy como canónica | — |
| 348 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO conserva el estado de revision del dataset | — |
| 349 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO expone las opciones de LLM del dataset | — |
| 350 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetSectionDTO aplana la estructura legacy a DatasetSection canónico | — |
| 351 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetSectionDTO corrige Airport a Place si los triples no son de aeropuerto | — |
| 352 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetSectionDTO conserva Airport cuando los triples si son de aeropuerto | — |
| 353 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapSentenceValidationDTOs produce alerts canónicas desde resultados legacy | — |
| 354 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapSentenceValidationDTOs conserva proposal opcional | — |
| 355 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapSavedAnnotationDTO devuelve la estructura canónica de guardado | — |
| 356 | tests/unit/shared/dto-mappers.test.js | dto-mappers normalizeIncomingEntryContext acepta EntryContext canónico | — |
| 357 | tests/unit/shared/dto-mappers.test.js | dto-mappers normalizeIncomingEntryContext corrige la categoria Airport inconsistente del caso Punjab | — |
| 358 | tests/unit/shared/entry-status-constants.test.js | entry-status constants exporta los tres valores base de estado de entrada | — |
| 359 | tests/unit/shared/entry-status-constants.test.js | entry-status constants exporta los tres estados de revision (E4) | — |
| 360 | tests/unit/shared/entry-status-constants.test.js | entry-status constants los estados de revision no colisionan con los de anotacion | — |
| 361 | tests/unit/shared/entry-status-constants.test.js | entry-status constants ALL_ENTRY_STATUSES contiene exactamente los seis estados | — |
| 362 | tests/unit/shared/navigation-contract.test.js | navigation contract datasets.js mantiene el contrato de navegación con datasetId y sectionIndex | — |
| 363 | tests/unit/shared/navigation-contract.test.js | navigation contract annotations.js documenta y conserva datasetId, sectionIndex y entryId en la URL | — |
| 364 | tests/unit/shared/navigation-contract.test.js | navigation contract dataset-view expone volver al listado y transición explícita a anotación | — |
| 365 | tests/unit/shared/navigation-contract.test.js | navigation contract annotations.html ofrece un botón de vuelta estable al listado | — |
| 366 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal datasets-controller.js should not import normalizePercent | — |
| 367 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal datasets-controller.js should not import writeDataset | — |
| 368 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal package.json should not have cookie-parser dependency | — |
| 369 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal package.json should not have morgan dependency | — |
| 370 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal xml-utils.js shim should be removed | — |
| 371 | tests/unit/shared/redundant-imports-removal.test.js | Redundant imports removal download_datasets.js should be removed | — |
| 372 | tests/unit/shared/request-log-middleware-contract.test.js | Request log middleware contract middleware should have documented serverErrorReason contract | — |
| 373 | tests/unit/shared/request-log-middleware-contract.test.js | Request log middleware contract users-controller should handle errors (either directly or via service) | — |
| 374 | tests/unit/shared/request-log-middleware-contract.test.js | Request log middleware contract datasets-controller should set serverErrorReason on errors | — |
| 375 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) exporta los cuatro codigos de criterio con prefijo coherente | — |
| 376 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) ALL_CRITERION_CODES lista los cuatro codigos | — |
| 377 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getOrderedCriteria devuelve objetos con code, label y description | — |
| 378 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) el primer criterio del orden es criterion_grammar | — |
| 379 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) isValidCriterionCode acepta solo codigos conocidos | — |
| 380 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getCriterionIndex devuelve la posicion ordenada o -1 si no existe | — |
| 381 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getOrderedCriteria devuelve copias mutables sin afectar el original | — |
| 382 | tests/unit/shared/review-decision-constants.test.js | review-decision constants (T4.1) exporta cada decision con el string esperado | — |
| 383 | tests/unit/shared/review-decision-constants.test.js | review-decision constants (T4.1) ALL_REVIEW_DECISIONS enumera las tres decisiones | — |
| 384 | tests/unit/shared/review-decision-constants.test.js | review-decision constants (T4.1) isValidReviewDecision filtra valores no listados | — |
| 385 | tests/unit/shared/review-decision-constants.test.js | review-decision constants (T4.1) decisionRequiresComment es true para rejected y needs_fix | — |
| 386 | tests/unit/shared/review-status-constants.test.js | review-status constants (T4.1) exporta cada estado en minusculas con el string esperado | — |
| 387 | tests/unit/shared/review-status-constants.test.js | review-status constants (T4.1) ALL_REVIEW_STATUSES enumera los seis estados | — |
| 388 | tests/unit/shared/review-status-constants.test.js | review-status constants (T4.1) ACTIVE_REVIEW_STATUSES solo incluye estados en curso | — |
| 389 | tests/unit/shared/review-status-constants.test.js | review-status constants (T4.1) TERMINAL_REVIEW_STATUSES solo incluye estados terminales con resultado | — |
| 390 | tests/unit/shared/review-status-constants.test.js | review-status constants (T4.1) isValidReviewStatus rechaza valores no listados | — |
| 391 | tests/unit/shared/roles-constants.test.js | constants/roles expone los tres roles canonicos | US-3 |
| 392 | tests/unit/shared/roles-constants.test.js | constants/roles ALL_ROLES contiene los tres roles y es inmutable | US-3 |
| 393 | tests/unit/shared/roles-constants.test.js | constants/roles isValidRole devuelve true solo para roles del catalogo | US-3 |
| 394 | tests/unit/shared/roles-constants.test.js | constants/roles isValidRole rechaza valores fuera del catalogo o de tipo incorrecto | US-3 |
| 395 | tests/unit/shared/routes-canonical.test.js | canonical routes public router expone sólo las rutas canónicas sin alias de registro | — |
| 396 | tests/unit/shared/routes-canonical.test.js | canonical routes datasets router expone el redirect al listado y la vista HTML del dataset | — |
| 397 | tests/unit/shared/routes-canonical.test.js | canonical routes datasets api router concentra los endpoints de datos bajo /api/datasets | — |
| 398 | tests/unit/shared/routes-canonical.test.js | canonical routes annotations separa la vista HTML de la API canónica bajo /api/annotations | — |
| 399 | tests/unit/shared/routes-canonical.test.js | canonical routes administrator expone la operación JSON de logout bajo su router API | — |
| 400 | tests/unit/shared/service-error.test.js | service-error aplica valores por defecto de status y code | — |
| 401 | tests/unit/shared/service-error.test.js | service-error permite sobreescribir status y code | — |
| 402 | tests/unit/shared/temp-storage.test.js | temp-storage usa un directorio temporal namespaced bajo os.tmpdir() | — |
| 403 | tests/unit/shared/temp-storage.test.js | temp-storage resuelve ficheros temporales dentro del namespace de la aplicación | — |
| 404 | tests/unit/shared/temp-storage.test.js | temp-storage mantiene compatibilidad de lectura con el path legacy /tmp | — |
| 405 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo usa el mensaje fijo del catalogo para spelling_error sin explanation | — |
| 406 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo concatena explanation al mensaje fijo del catalogo | — |
| 407 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo usa el mensaje fijo para grammar_error | — |
| 408 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo usa el severity del catalogo aunque el LLM devuelva uno diferente | — |
| 409 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo usa el tipo del catalogo | — |
| 410 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo maneja codigo desconocido usando explanation como mensaje | — |
| 411 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo usa el campo message del LLM como fallback si no hay explanation ni catalogo | — |
| 412 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo getBatchSystemPrompt incluye los nuevos codigos | — |
| 413 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo getBatchSystemPrompt instruye al LLM a usar explanation en lugar de message | — |
| 414 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog normalizeBatchOllamaResult con codigos del catalogo getBatchSystemPrompt no incluye repeated_sentence ni ok | — |
| 415 | tests/unit/shared/validation-codes.test.js | validation-codes VALIDATION_CODES contiene todos los codigos base requeridos | — |
| 416 | tests/unit/shared/validation-codes.test.js | validation-codes VALIDATION_CODES cada entrada tiene severity, type y messageTemplate | — |
| 417 | tests/unit/shared/validation-codes.test.js | validation-codes VALIDATION_CODES repeated_sentence tiene severity duplicate | — |
| 418 | tests/unit/shared/validation-codes.test.js | validation-codes VALIDATION_CODES ok tiene severity ok | — |
| 419 | tests/unit/shared/validation-codes.test.js | validation-codes ALL_CODES contiene todos los codigos de VALIDATION_CODES | — |
| 420 | tests/unit/shared/validation-codes.test.js | validation-codes ERROR_CODES solo contiene codigos de severidad error | — |
| 421 | tests/unit/shared/validation-codes.test.js | validation-codes ERROR_CODES incluye spelling_error y semantic_mismatch | — |
| 422 | tests/unit/shared/validation-codes.test.js | validation-codes ERROR_CODES no incluye warning ni duplicate | — |
| 423 | tests/unit/shared/validation-codes.test.js | validation-codes WARNING_CODES solo contiene codigos de severidad warning | — |
| 424 | tests/unit/shared/validation-codes.test.js | validation-codes WARNING_CODES incluye accent_error, missing_comma y unnatural_expression | — |
| 425 | tests/unit/shared/validation-codes.test.js | validation-codes DUPLICATE_CODES contiene repeated_sentence | — |
| 426 | tests/unit/shared/validation-codes.test.js | validation-codes DUPLICATE_CODES solo contiene codigos de severidad duplicate | — |
| 427 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage devuelve el messageTemplate sin explicacion | — |
| 428 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage concatena la explicacion al messageTemplate | — |
| 429 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage ignora explicacion vacia | — |
| 430 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage devuelve la explicacion si el codigo no existe | — |
| 431 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage devuelve mensaje generico si codigo y explicacion son desconocidos | — |
| 432 | tests/unit/shared/validation-codes.test.js | validation-codes resolveMessage devuelve el mensaje de repeated_sentence sin explicacion | — |
| 433 | tests/unit/shared/validation-codes.test.js | validation-codes isKnownCode devuelve true para codigos validos | — |
| 434 | tests/unit/shared/validation-codes.test.js | validation-codes isKnownCode devuelve false para codigos desconocidos | — |
| 435 | tests/unit/shared/validators.test.js | validators toPositiveInteger devuelve enteros positivos y rechaza valores no válidos | — |
| 436 | tests/unit/shared/validators.test.js | validators toIntegerNormalized trunca números y normaliza negativos o no numéricos a 0 | — |
| 437 | tests/unit/shared/validators.test.js | validators normalizePercent limita el rango a 0..100 | — |
| 438 | tests/unit/shared/validators.test.js | validators isStringArray acepta arrays de cadenas con contenido y rechaza el resto | — |
| 439 | tests/unit/shared/validators.test.js | validators getErrorMessage devuelve mensaje por defecto cuando no existe error.message | — |

---

### Integration tests

| # | File | Test | User Story |
|---|------|------|------------|
| 440 | tests/integration/admin/admin-api.test.js | admin api integration (E5) integra resumen, exportacion y criterios bajo /api/admin para rol admin | US-2 |
| 441 | tests/integration/admin/admin-api.test.js | admin api integration (E5) bloquea /api/admin para un usuario normal autenticado | US-2 |
| 442 | tests/integration/annotations/annotation-workflow.test.js | annotation workflow integration flujo completo: login → crear dataset → anotar 2 entries → estadísticas | US-1 |
| 443 | tests/integration/datasets/dataset-lifecycle.test.js | dataset lifecycle integration crea un dataset desde ru_dev.xml, verifica sus filas y lo borra comprobando el borrado en cascada | — |
| 444 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 1 — reviewer pide siguiente y recibe entry anotada | — |
| 445 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 2 — wizard secuencial bloquea saltos y exige comentario | — |
| 446 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 3 — correccion de texto exige comentario | — |
| 447 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 4 — finalizacion clasifica entry como disputed cuando hay rechazo | — |
| 448 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 5 — annotator consulta feedback con criterios fallidos y correcciones | — |
| 449 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 6 — exclusividad y expiracion entre dos reviewers | — |
| 450 | tests/integration/users/login-session.test.js | login session integration stores request.session.user after successful login | US-1 |
| 451 | tests/integration/users/register-moderator.test.js | register-moderator integration registers a moderator using a code produced by the generator script | US-5 |
| 452 | tests/integration/users/users-database.test.js | users database integration registers, logs in, logs out and deletes a user | US-1 |

---

## Update — v0.5 additions

Tests added after the v0.4 snapshot above. This section is retained as a historical map of additions since v0.4. The current aggregate verified by Mocha on 2026-06-25 is **783** tests (**732 unit + 51 integration**); the rows below have not been regenerated as a complete append-only inventory after later refactors.

### Entities (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 1 | tests/unit/shared/entity-exports.test.js | Entity exports consistency Dataset exports expose DatasetDTO as the single canonical class | — |
| 2 | tests/unit/users/user-entity.test.js | user entity rejects session payloads that use legacy userId key | — |

### Users (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 3 | tests/unit/users/users-repository-email.test.js | users-repository exact email lookup normaliza espacios y mayusculas para buscar por email | — |
| 4 | tests/unit/users/users-repository-email.test.js | users-repository exact email lookup devuelve null si el email queda vacio | — |
| 5 | tests/unit/users/users-router-endpoints.test.js | users router endpoints (renamed from usuarios) expone /register y /register/moderator pero no /create-session (movido a /api/session) | — |

### Datasets (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 6 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service bloquea con 409 llm_credential_required cuando llmMode=correction y no hay credencial activa | — |
| 7 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service procede normalmente cuando llmMode=correction y hay una credencial activa | — |
| 8 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service.getNextEntry devuelve la entry apuntada por la sesion activa con su contexto de seccion | — |
| 9 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service.getNextEntry marca isLastEntryInSection=false cuando la entry no es la ultima | — |
| 10 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service.getNextEntry lanza 409 no_active_session si no hay sesion activa | — |
| 11 | tests/unit/datasets/continue-dataset-service.test.js | continue-dataset-service.getNextEntry lanza 404 entry_not_found si la posicion no existe en la seccion | — |
| 12 | tests/unit/datasets/dataset-admin-check.test.js | credential check — buildCheckResultText (modal text) returns the model message on success | — |
| 13 | tests/unit/datasets/dataset-admin-check.test.js | credential check — buildCheckResultText (modal text) falls back to a default success line when no message is provided | — |
| 14 | tests/unit/datasets/dataset-admin-check.test.js | credential check — buildCheckResultText (modal text) returns the server error on failure | — |
| 15 | tests/unit/datasets/dataset-admin-check.test.js | credential check — buildCheckResultText (modal text) falls back to a default error line for empty/odd payloads | — |
| 16 | tests/unit/datasets/dataset-admin-check.test.js | credential check — controller error-log flagging flags a failed check (200 {ok:false}) for the error log | — |
| 17 | tests/unit/datasets/dataset-admin-check.test.js | credential check — controller error-log flagging does not flag a successful check | — |
| 18 | tests/unit/datasets/dataset-admin-tabs.test.js | dataset-admin — computeTabVisibilityState (P2) hides the Revisión tab when review is disabled and keeps Anotación active | — |
| 19 | tests/unit/datasets/dataset-admin-tabs.test.js | dataset-admin — computeTabVisibilityState (P2) shows the Revisión tab when review is enabled, still resetting to Anotación | — |
| 20 | tests/unit/datasets/dataset-creation-rules.test.js | applyNewDatasetFormRules (P6, pure) review off ⇒ additional hidden + off (R1) | — |
| 21 | tests/unit/datasets/dataset-creation-rules.test.js | applyNewDatasetFormRules (P6, pure) review on ⇒ additional shown, value preserved | — |
| 22 | tests/unit/datasets/dataset-creation-rules.test.js | applyNewDatasetFormRules (P6, pure) review on, additional off ⇒ shown but off | — |
| 23 | tests/unit/datasets/dataset-creation-rules.test.js | applyNewDatasetFormRules (P6, pure) generation + review off ⇒ additional off (R1, no R2) | — |
| 24 | tests/unit/datasets/dataset-creation-rules.test.js | applyNewDatasetFormRules (P6, pure) correction forces review + additional, both locked (R2) | — |
| 25 | tests/unit/datasets/dataset-creation-rules.test.js | createDataset server-side rule normalisation (P6, T6.3) correction ⇒ review + additional forced true even if the request says otherwise | — |
| 26 | tests/unit/datasets/dataset-creation-rules.test.js | createDataset server-side rule normalisation (P6, T6.3) review disabled ⇒ additional reviews forced false | — |
| 27 | tests/unit/datasets/dataset-creation-rules.test.js | createDataset server-side rule normalisation (P6, T6.3) review enabled (non-correction) keeps the requested additional flag | — |
| 28 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) upsertByProvider keys by (datasetId, provider), creates inactive and does not touch isActive on update | — |
| 29 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) listByDataset never selects the cipher | — |
| 30 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) setActive deactivates the rest and activates the chosen one (exactly one active) | — |
| 31 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) setActive returns 0 when the provider does not exist | — |
| 32 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) findActiveByDataset returns null when none is active | — |
| 33 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) deleteByProvider removes the matching row | — |
| 34 | tests/unit/datasets/dataset-llm-credentials-repository.test.js | dataset-llm-credentials-repository (T3) findDatasetLlmMode returns the dataset llm_mode, or null when the dataset is missing | — |
| 35 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) POST creates a credential (201) and the response is masked (no clear key) | — |
| 36 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) GET lists masked credentials for an admin (200) | — |
| 37 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) non-admin gets 403 on list and create | — |
| 38 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) no session returns 401 | — |
| 39 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) PATCH activate and DELETE work for an admin | — |
| 40 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) POST check returns the model message | — |
| 41 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) invalid payload (missing apiKey) returns 400 | — |
| 42 | tests/unit/datasets/dataset-llm-credentials-router.test.js | dataset-llm-credentials router (T7) with llm_mode = none, GET returns [] and POST is rejected (409) | — |
| 43 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) rejects a non-admin with a 403 ServiceError | — |
| 44 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) saveCredential returns a masked DTO that never contains the clear key nor the cipher | — |
| 45 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) rejects an invalid payload (missing apiKey) with 400 | — |
| 46 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) resolveActiveProviderConfig decrypts the active credential, and returns null when none is active | — |
| 47 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) with llm_mode = "none": listForAdmin returns [] and resolveActiveProviderConfig returns null even with rows | — |
| 48 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) with llm_mode = "none": writes and check are rejected with 409 | — |
| 49 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) checkCredential calls the model with the decrypted key and returns its message | — |
| 50 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) checkCredential returns { ok:false, error } without leaking the key on provider failure | — |
| 51 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) saveCredential rejects an apiBase pointing to Groq website (console.groq.com / groq.com) with 400 | — |
| 52 | tests/unit/datasets/dataset-llm-credentials-service.test.js | dataset-llm-credentials-service (T4) activate and delete reject an unknown provider with 404 | — |
| 53 | tests/unit/datasets/dataset-naming.test.js | dataset naming — createDataset usa el nombre proporcionado por el usuario (recortado) | — |
| 54 | tests/unit/datasets/dataset-naming.test.js | dataset naming — createDataset cae al nombre del fichero cuando no se proporciona nombre | — |
| 55 | tests/unit/datasets/dataset-naming.test.js | dataset naming — createDataset rechaza con 409 cuando el usuario ya posee un dataset con ese nombre | — |
| 56 | tests/unit/datasets/dataset-naming.test.js | dataset naming — createDataset rechaza con 400 cuando el nombre supera el máximo de caracteres | — |
| 57 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (service) exige admin, comprueba duplicados del propietario y renombra | — |
| 58 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (service) rechaza con 409 cuando el propietario ya tiene otro dataset con ese nombre | — |
| 59 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (service) propaga 403 cuando el actor no es administrador del dataset | — |
| 60 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (service) rechaza con 400 cuando el nombre nuevo está vacío | — |
| 61 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (controller) delega en datasetsService y responde 200 | — |
| 62 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (controller) devuelve 400 cuando el id no es un entero positivo | — |
| 63 | tests/unit/datasets/dataset-naming.test.js | dataset naming — renameDataset (controller) devuelve 401 sin sesión válida | — |
| 64 | tests/unit/datasets/dataset-naming.test.js | dataset naming — frontend pure helpers deriveDatasetNameFromFile quita la extensión .xml y recorta | — |
| 65 | tests/unit/datasets/dataset-naming.test.js | dataset naming — frontend pure helpers normaliseDatasetName recorta cadenas y degrada valores no string a "" | — |
| 66 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration anade por email exacto con permiso annotator por defecto | — |
| 67 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration anade respetando los permisos solicitados en el payload | — |
| 68 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration descarta el permiso reviewer al anadir si el dataset no tiene revision | — |
| 69 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration rechaza con no_role_selected si solo se pide reviewer en dataset sin revision | — |
| 70 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration rechaza el alta si los permisos solicitados son todos falsos | — |
| 71 | tests/unit/datasets/dataset-permissions.test.js | dataset permissions administration descarta el permiso reviewer al actualizar si el dataset no tiene revision | — |
| 72 | tests/unit/datasets/dataset-review-availability.test.js | getAccessibleDatasetItem review availability (P5) surfaces reviewAvailable=true when the reviewer has reviewable entries | — |
| 73 | tests/unit/datasets/dataset-review-availability.test.js | getAccessibleDatasetItem review availability (P5) keeps reviewAvailable=false when no entries are pending review | — |
| 74 | tests/unit/datasets/dataset-review-availability.test.js | getAccessibleDatasetItem review availability (P5) flags blockedBySelfAnnotation when every candidate entry was annotated by the reviewer | — |
| 75 | tests/unit/datasets/dataset-review-availability.test.js | getAccessibleDatasetItem review availability (P5) does not flag self-annotation when reviewable entries also exist | — |
| 76 | tests/unit/datasets/dataset-section-size.test.js | resolveSectionSize (P4 helper, DECOUPLE-0) returns the explicit positive value | — |
| 77 | tests/unit/datasets/dataset-section-size.test.js | resolveSectionSize (P4 helper, DECOUPLE-0) falls back to the default for legacy/garbage rows | — |
| 78 | tests/unit/datasets/dataset-section-size.test.js | createDataset persists & partitions by the declarative section size (T4.1) persists sectionSize=25 from the body and partitions 30 entries into 2 sections | — |
| 79 | tests/unit/datasets/dataset-section-size.test.js | createDataset persists & partitions by the declarative section size (T4.1) defaults a missing or invalid sectionSize to 10 | — |
| 80 | tests/unit/datasets/dataset-section-size.test.js | getAccessibleDatasetSection honours a non-default section size (T4.2) partitions 10 entries into sections of 4 | — |
| 81 | tests/unit/datasets/dataset-section-size.test.js | dataset progress uses the section size (T4.3) counts reviewed entries by completedSections * sectionSize | — |
| 82 | tests/unit/datasets/dataset-section-size.test.js | dataset progress uses the section size (T4.3) defaults to a size of 10 when none is given | — |
| 83 | tests/unit/datasets/dataset-section-size.test.js | continue-dataset-service uses the dataset section size (T4.3) resumes an active session computing entryIndexInSection with a non-10 size | — |
| 84 | tests/unit/datasets/dataset-section-size.test.js | frontend normaliseDatasetOptions / normaliseSectionSize (T4.4) parses the section size, defaulting/clamping to 10 | — |
| 85 | tests/unit/datasets/dataset-section-size.test.js | frontend normaliseDatasetOptions / normaliseSectionSize (T4.4) normaliseDatasetOptions returns the parsed size | — |
| 86 | tests/unit/datasets/datasets-controller.test.js | datasets-controller listAllDatasets devuelve 401 cuando la sesión no es válida | — |
| 87 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetXml descarga el XML como adjunto con su filename | — |
| 88 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetXml devuelve 400 cuando id no es entero positivo | — |
| 89 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetXml devuelve 401 sin sesión válida | — |
| 90 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetAnnotatedXml descarga el XML extendido con filename <name>-extended.xml | — |
| 91 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetAnnotatedXml propaga el 409 dataset_not_completed del service | — |
| 92 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetAnnotatedXml devuelve 400 cuando id no es entero positivo | — |
| 93 | tests/unit/datasets/datasets-controller.test.js | datasets-controller downloadDatasetAnnotatedXml devuelve 401 sin sesión válida | — |
| 94 | tests/unit/datasets/datasets-review-button.test.js | reviewButtonTitle shows "Abrir revisión" when there is something to review | — |
| 95 | tests/unit/datasets/datasets-review-button.test.js | reviewButtonTitle explains the self-review rule when the reviewer annotated every candidate entry | — |
| 96 | tests/unit/datasets/datasets-review-button.test.js | reviewButtonTitle falls back to the generic message when there is simply nothing annotated yet | — |
| 97 | tests/unit/datasets/datasets-review-button.test.js | reviewButtonTitle prefers the open-review wording even if the self-annotation flag is set | — |
| 98 | tests/unit/datasets/datasets-review-button.test.js | reviewButtonTitle tolerates a missing/invalid review object | — |
| 99 | tests/unit/datasets/datasets-review-button.test.js | normaliseDatasetReviewState normalises blockedBySelfAnnotation to a boolean | — |
| 100 | tests/unit/datasets/datasets-router.test.js | datasets router integration expone GET /api/datasets/:id/download como descarga adjunta del XML | — |
| 101 | tests/unit/datasets/datasets-router.test.js | datasets router integration expone GET /api/datasets/:id/download/annotated como descarga adjunta del XML extendido | — |
| 102 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetXmlDownload devuelve filename, body y contentType | — |
| 103 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetXmlDownload rechaza con 404 cuando el dataset no tiene entries | — |
| 104 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetAnnotatedXmlDownload devuelve filename, body y contentType al 100% completado | — |
| 105 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetAnnotatedXmlDownload rechaza con 409 dataset_not_completed cuando faltan secciones | — |
| 106 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetAnnotatedXmlDownload rechaza con 409 si sectionsPending > 0 aunque sectionsCompleted iguale el total | — |
| 107 | tests/unit/datasets/datasets-service.test.js | datasets-service getAccessibleDatasetAnnotatedXmlDownload rechaza con 404 dataset_without_entries cuando no hay entries | — |
| 108 | tests/unit/datasets/new-dataset-button-role.test.js | canCreateDataset (moderator gate) permite crear datasets a un moderador | US-3 |
| 109 | tests/unit/datasets/new-dataset-button-role.test.js | canCreateDataset (moderator gate) lo niega a un usuario no moderador | US-3 |
| 110 | tests/unit/datasets/new-dataset-button-role.test.js | canCreateDataset (moderator gate) lo niega cuando falta el flag isModerator | US-3 |
| 111 | tests/unit/datasets/new-dataset-button-role.test.js | canCreateDataset (moderator gate) lo niega para sesiones ausentes o no booleanas | US-3 |
| 112 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository addTimeToActiveAssignment incrementa timeSpentSeconds de la asignación activa | — |
| 113 | tests/unit/datasets/section-assignments-repository.test.js | section-assignments-repository addTimeToActiveAssignment es un no-op cuando los segundos no son positivos | — |
| 114 | tests/unit/datasets/toolbar-role.test.js | toolbar isModerator-aware rendering un moderador recibe enlaces a /datasets, /reviewer, /my-stats y badge | US-3 |
| 115 | tests/unit/datasets/toolbar-role.test.js | toolbar isActiveToolbarLink (P7 active-item highlight) matches the exact route only | US-3 |
| 116 | tests/unit/datasets/toolbar-role.test.js | toolbar isActiveToolbarLink (P7 active-item highlight) tolerates trailing slashes and query/hash | US-3 |
| 117 | tests/unit/datasets/toolbar-role.test.js | toolbar isActiveToolbarLink (P7 active-item highlight) matches nested routes under the link path | US-3 |
| 118 | tests/unit/datasets/toolbar-role.test.js | toolbar isActiveToolbarLink (P7 active-item highlight) does not match when on a different page | US-3 |

### Annotations (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 119 | tests/unit/annotations/annotations-controller.test.js | annotations-controller send devuelve 401 si no hay sesión válida | — |
| 120 | tests/unit/annotations/annotations-controller.test.js | annotations-controller continue delega en continueDatasetService y devuelve el caso calculado | — |
| 121 | tests/unit/annotations/annotations-controller.test.js | annotations-controller continue devuelve 401 si no hay sesión válida | — |
| 122 | tests/unit/annotations/annotations-controller.test.js | annotations-controller continue devuelve 400 si el datasetId es inválido | — |
| 123 | tests/unit/annotations/annotations-controller.test.js | annotations-controller next delega en continueDatasetService.getNextEntry y devuelve el payload | — |
| 124 | tests/unit/annotations/annotations-controller.test.js | annotations-controller next devuelve 401 si no hay sesión válida | — |
| 125 | tests/unit/annotations/annotations-controller.test.js | annotations-controller next devuelve 400 si el datasetId es inválido | — |
| 126 | tests/unit/annotations/annotations-credential-propagation.test.js | annotations-service credential propagation (T6) injects providerConfig into the check context when the dataset has an active credential | — |
| 127 | tests/unit/annotations/annotations-credential-propagation.test.js | annotations-service credential propagation (T6) does not inject providerConfig when no datasetId is given (legacy global behaviour) | — |
| 128 | tests/unit/annotations/annotations-credential-propagation.test.js | annotations-service credential propagation (T6) does not inject providerConfig when the dataset has no active credential | — |
| 129 | tests/unit/annotations/annotations-credential-propagation.test.js | annotations-service credential propagation (T6) degrades to the global provider (no throw) when credential resolution fails, but only after access is granted | — |
| 130 | tests/unit/annotations/annotations-credential-propagation.test.js | annotations-service credential propagation (T6) rejects when the user has no access to the requested dataset, without calling the checker | — |
| 131 | tests/unit/annotations/annotations-repository-status.test.js | annotations-repository — entry lifecycle transition marca la entry como annotated cuando se guarda al menos una frase | — |
| 132 | tests/unit/annotations/annotations-repository-status.test.js | annotations-repository — entry lifecycle transition revierte la entry a pending cuando se borran todas las frases | — |
| 133 | tests/unit/annotations/annotations-repository-status.test.js | annotations-repository — entry lifecycle transition no toca el estado cuando la entry no es accesible | — |
| 134 | tests/unit/annotations/annotations-router.test.js | annotations router integration mantiene POST /api/annotations/check, /send, /:datasetId/continue y GET /:datasetId/next enlazados al controller | — |
| 135 | tests/unit/annotations/annotations-service.test.js | annotations-service saveSentences acumula el tiempo de anotación en la asignación activa | — |
| 136 | tests/unit/annotations/annotations-service.test.js | annotations-service saveSentences no registra tiempo cuando es cero | — |
| 137 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentsRepository inyectado lanza 403 si no hay asignación activa para la sección | — |
| 138 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentsRepository inyectado lanza 403 si la asignación activa es de otra sección | — |
| 139 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentsRepository inyectado guarda correctamente cuando la asignación coincide | — |
| 140 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentsRepository inyectado omite la validación de asignación si no hay sectionNumber | — |
| 141 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentService inyectado propaga sectionCompleted=true cuando el servicio lo confirma | — |
| 142 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentService inyectado propaga sectionCompleted=false cuando quedan entries por anotar | — |
| 143 | tests/unit/annotations/annotations-workflow.test.js | annotations-workflow (integración de asignación de sección) saveSentences con sectionAssignmentService inyectado propaga el error del sectionAssignmentService y revierte la transacción de cierre | — |

### Reviews (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 144 | tests/unit/reviews/reviewer-ui.test.js | reviewer request-button state (P5 affordance) is enabled ("siguiente") when there is no open review — lets the reviewer pull a candidate | — |
| 145 | tests/unit/reviews/reviewer-ui.test.js | reviewer request-button state (P5 affordance) is disabled while fetching or while a review is open with criteria pending | — |
| 146 | tests/unit/reviews/reviewer-ui.test.js | reviewer request-button state (P5 affordance) shows "finalizado" (disabled) right after a finalized review | — |
| 147 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) activeCriterionIndex devuelve la posicion del primer criterio no decidido | — |
| 148 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) activeCriterionIndex devuelve la longitud cuando todos estan decididos | — |
| 149 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) canFinalize solo true cuando hay criterios y todos estan decididos | — |
| 150 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) predictedOutcome completed si todo es accepted, disputed en otro caso | — |
| 151 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) buildSentenceState construye estado por frase desde anotaciones y correcciones previas | — |
| 152 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) requiresComment solo "rejected" ("No") exige comentario | — |
| 153 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) readDatasetIdFromLocation lee datasetId de la query string | — |
| 154 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) readDatasetIdFromLocation devuelve null sin datasetId valido (cola global) | — |
| 155 | tests/unit/reviews/reviewer-ui.test.js | reviewer UI helpers (T4.5) messageFromResult extrae message o code del resultado | — |
| 156 | tests/unit/reviews/reviews-controller.test.js | reviews-controller (T4.4) submitDecision normaliza sentenceIndex ausente a null (criterio de nivel review) | — |
| 157 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) upsertDecision crea una decision nueva con (reviewId, sentenceIndex, criterionCode) | — |
| 158 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) upsertDecision actualiza la decision existente sin crear otra | — |
| 159 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) upsertDecision normaliza sentenceIndex ausente a null (criterio de nivel review) | — |
| 160 | tests/unit/reviews/reviews-repository.test.js | reviews-repository (T4.2) findAnnotatedSentenceIndexes devuelve los indices de frase anotados por el annotator | — |
| 161 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision rechaza con criterion_locked si se salta criterios de la frase | — |
| 162 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision rechaza criterio de frase enviado como nivel de review | — |
| 163 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision registra el primer criterio y pasa la review a in_progress | — |
| 164 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision registra el criterio de review (diversity) con sentenceIndex null | — |
| 165 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitDecision permite redecidir un criterio ya resuelto de la misma frase | — |
| 166 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitTextCorrection persiste la correccion aunque no se aporte comentario | — |
| 167 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitTextCorrection rechaza con invalid_correction si el texto corregido esta vacio | — |
| 168 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) submitTextCorrection persiste corrected y comment cuando se aporta justificacion | — |
| 169 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview rechaza con criteria_incomplete si faltan decisiones de la frase | — |
| 170 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview exige diversity cuando hay mas de una frase | — |
| 171 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview registra timeSpentSeconds (acotado a la ventana de reserva) al finalizar | — |
| 172 | tests/unit/reviews/reviews-service.test.js | reviews-service (T4.3) finalizeReview acota timeSpentSeconds desorbitado a la ventana de reserva | — |
| 173 | tests/unit/reviews/reviews-service.test.js | buildFeedbackEntry proyecta criterios fallidos y comentarios | — |
| 174 | tests/unit/reviews/reviews-service.test.js | buildFeedbackEntry devuelve arrays vacios cuando no hay decisiones ni comentarios | — |
| 175 | tests/unit/reviews/reviews-service.test.js | buildReviewContextDTO expone catalogos de frase y review, aplana triples y filtra lex inglesas | — |
| 176 | tests/unit/reviews/reviews-service.test.js | buildReviewContextDTO mapea sentenceIndex de las decisiones (null = nivel review) | — |
| 177 | tests/unit/reviews/reviews-service.test.js | buildReviewContextDTO soporta entry null sin lanzar | — |

### Admin (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 178 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management listUsers expone id/email/isModerator y nunca el password | US-3 |
| 179 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management setUserModerator promueve a un usuario | US-3 |
| 180 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management rechaza un userId inválido con 400 | US-3 |
| 181 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management rechaza isModerator no booleano con 400 (semántica estricta) | US-3 |
| 182 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management impide que un moderador se auto-degrade (409 cannot_self_demote) | US-3 |
| 183 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management permite que un moderador se promueva a sí mismo (idempotente) | US-3 |
| 184 | tests/unit/admin/admin-user-roles.test.js | admin-service — US-22 server-role management traduce P2025 a 404 user_not_found | US-3 |

### My statistics (Me) (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 185 | tests/unit/me/me-api-router.test.js | me API router (US-14) exige meController | — |
| 186 | tests/unit/me/me-api-router.test.js | me API router (US-14) GET /api/me/stats responde 401 sin sesión y 200 autenticado | — |
| 187 | tests/unit/me/me-controller.test.js | me-controller (US-14) responde 200 con las estadísticas del usuario de la sesión | — |
| 188 | tests/unit/me/me-controller.test.js | me-controller (US-14) responde 401 cuando no hay usuario en sesión | — |
| 189 | tests/unit/me/me-controller.test.js | me-controller (US-14) propaga el status de un ServiceError | — |
| 190 | tests/unit/me/me-statistics-service.test.js | me-statistics-service (US-14) buildMyStatisticsDTO agrega por dataset, totales y medias (en general y por dataset) | — |
| 191 | tests/unit/me/me-statistics-service.test.js | me-statistics-service (US-14) buildMyStatisticsDTO excluye datasets sin anotaciones ni revisiones (solo > 0) | — |
| 192 | tests/unit/me/me-statistics-service.test.js | me-statistics-service (US-14) buildMyStatisticsDTO la media general de anotación ignora tiempo sin anotaciones | — |
| 193 | tests/unit/me/me-statistics-service.test.js | me-statistics-service (US-14) buildMyStatisticsDTO devuelve estructura vacía coherente sin actividad | — |
| 194 | tests/unit/me/me-statistics-service.test.js | me-statistics-service (US-14) getMyStatistics orquesta el repositorio y resuelve nombres de dataset | — |
| 195 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) formatDuration formatea minutos y segundos | — |
| 196 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) formatDuration devuelve un guion sin actividad | — |
| 197 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) buildSummaryCards proyecta los seis indicadores globales en orden | — |
| 198 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) buildSummaryCards tolera totales ausentes | — |
| 199 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) messageFromResult extrae message/code o un fallback HTTP | — |
| 200 | tests/unit/me/own-stads-ui.test.js | own-stads UI helpers (US-14) escapeHtml escapa caracteres peligrosos | — |

### Spanish & linguistic checks (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 201 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion no genera incomplete_sentence para "ejerce el liderazgo" | — |
| 202 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion no genera relation_missing para "ejerce el liderazgo" | — |
| 203 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion valida como correcta sin alertas de error cuando el LLM tambien la acepta | — |
| 204 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion suprime rdf_error del LLM cuando la oracion cubre el triple con sinonimos validos | — |
| 205 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion reconoce "ejerce" como marcador de oracion completa | — |
| 206 | tests/unit/spanish/spanish-service-ejerce-liderazgo.test.js | spanish-service — "ejerce el liderazgo" regresion sigue detectando errores reales: objeto cambiado en leaderTitle | — |
| 207 | tests/unit/spanish/spanish-service-persistence.test.js | spanish-service persistence buildAnnotationRows emite una fila por sentenceIndex de la entry | — |

### Ollama & LLM clients (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 208 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) routes generateJson by providerConfig.provider (anthropic) | — |
| 209 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) routes openai-compatible / groq providers to the generic client | — |
| 210 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) routes local/ollama providerConfig to the ollama client, mapping apiBase to host | — |
| 211 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) falls back to the global client when there is no providerConfig (cloud → groq) | — |
| 212 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) falls back to ollama when global model is local | — |
| 213 | tests/unit/ollama/llm-client-dispatch.test.js | llm-client dispatch (T5) generateText routes by providerConfig and returns the raw text | — |
| 214 | tests/unit/ollama/llm-logger.test.js | llm-logger writes one REQUEST and one matching RESPONSE block to YYYY-MM-DD-llm.txt | — |
| 215 | tests/unit/ollama/llm-logger.test.js | llm-logger supports Anthropic and Ollama request/response shapes | — |
| 216 | tests/unit/ollama/llm-logger.test.js | llm-logger logs an (error) line in the RESPONSE block when the request times out or fails before reaching the server | — |
| 217 | tests/unit/ollama/llm-logger.test.js | llm-logger is a no-op when disabled | — |
| 218 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker check devuelve el resultado normalizado a partir del JSON del LLM | — |
| 219 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker check rellena valores por defecto si el LLM devuelve un payload vacío | — |
| 220 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker checkBatch llama a Ollama una sola vez y normaliza el resultado por sentenceIndex | — |
| 221 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker checkBatch marca como inválida una oración cuyo alert lleve language_not_spanish | — |
| 222 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker proposeCorrectionsBatch devuelve propuestas por sentenceIndex | — |
| 223 | tests/unit/ollama/ollama-spanish-checker.test.js | ollama-spanish-checker proposeCorrectionsBatch no llama al LLM cuando no hay validaciones inválidas y devuelve null por slot | — |
| 224 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) generateJson posts to /chat/completions with the bearer key and json mode, returning parsed JSON | — |
| 225 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) generateText omits response_format and returns the raw content | — |
| 226 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) omits the system message when no system prompt is given (credential "check" path) | — |
| 227 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) replaces an HTML error body with a hint about the wrong URL (console.groq.com / groq.com) | — |
| 228 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) includes the system message when a system prompt is given | — |
| 229 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) writes a paired REQUEST/RESPONSE entry to the daily LLM log on every call | — |
| 230 | tests/unit/ollama/openai-compatible-client.test.js | openai-compatible-client (T5) throws a clear error when the API key is missing | — |
| 231 | tests/unit/ollama/openai-compatible-client.test.js | anthropic-client (T5) generateJson posts to /v1/messages with x-api-key and normalises text blocks to JSON | — |
| 232 | tests/unit/ollama/openai-compatible-client.test.js | anthropic-client (T5) generateText concatenates the text blocks | — |
| 233 | tests/unit/ollama/openai-compatible-client.test.js | anthropic-client (T5) honours a custom apiBase override | — |

### XML (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 234 | tests/unit/xml/correction-fixtures.test.js | AI-correction example fixtures (P3, T3.2) the input fixture exposes triples and a Spanish candidate per entry | — |
| 235 | tests/unit/xml/correction-fixtures.test.js | AI-correction example fixtures (P3, T3.2) the expected fixture corrects each Spanish candidate while keeping the triples | — |
| 236 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) the corpora nest: correction-10 ⊂ 20 ⊂ 30 ⊂ 40 (same eids/candidates) | — |
| 237 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) covers all three verdict families (acceptance, warning, error) in every size | — |
| 238 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 10 input XML parses to 10 entries, each with triples + a Spanish candidate | — |
| 239 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 10 expected JSON aligns 1:1 with the input and uses valid severities | — |
| 240 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 10 counts in the expected file match the severities of its entries | — |
| 241 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 20 input XML parses to 20 entries, each with triples + a Spanish candidate | — |
| 242 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 20 expected JSON aligns 1:1 with the input and uses valid severities | — |
| 243 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 20 counts in the expected file match the severities of its entries | — |
| 244 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 30 input XML parses to 30 entries, each with triples + a Spanish candidate | — |
| 245 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 30 expected JSON aligns 1:1 with the input and uses valid severities | — |
| 246 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 30 counts in the expected file match the severities of its entries | — |
| 247 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 40 input XML parses to 40 entries, each with triples + a Spanish candidate | — |
| 248 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 40 expected JSON aligns 1:1 with the input and uses valid severities | — |
| 249 | tests/unit/xml/correction-suite.test.js | AI-correction evaluation corpus (correction-{10,20,30,40}) size 40 counts in the expected file match the severities of its entries | — |
| 250 | tests/unit/xml/dataset-xml-annotated.test.js | buildAnnotatedDatasetXml inserta un Spanish lex emparejado con el lid del english lex al mismo sentenceIndex | — |
| 251 | tests/unit/xml/dataset-xml-annotated.test.js | buildAnnotatedDatasetXml respeta el orden por sentenceIndex y empareja cada Spanish lex con el lid del english correspondiente | — |
| 252 | tests/unit/xml/dataset-xml-annotated.test.js | buildAnnotatedDatasetXml marca como free las annotations sin english lex emparejable y usa lid="id<sentenceIndex+1>" | — |
| 253 | tests/unit/xml/dataset-xml-annotated.test.js | buildAnnotatedDatasetXml no añade lex extra si la entry no tiene annotations | — |
| 254 | tests/unit/xml/dataset-xml-annotated.test.js | buildAnnotatedDatasetXml preserva el resto de la estructura XML (triplesets y links) | — |
| 255 | tests/unit/xml/xml-format.test.js | xml-format shared helpers renderAttrs formatea pares atributo/valor escapando todos los reservados XML | — |
| 256 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() devuelve una instancia de DatasetDTO | — |
| 257 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() entries es un Array | — |
| 258 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() contiene las 790 entries del fichero ru_dev.xml | — |
| 259 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() cada entry es una instancia de EntryDTO | — |
| 260 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() eid y size son números | — |
| 261 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() primera entry tiene los campos correctos | — |
| 262 | tests/unit/xml/xml-reader.test.js | xml-reader — readDataset() shape y shapeType son null cuando el atributo está ausente | — |

### Contracts, mappers & shared (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 263 | tests/unit/shared/dataset-progress.test.js | dataset-progress cuenta entries anotadas dentro de secciones aun no completas (sin revision) | — |
| 264 | tests/unit/shared/dataset-progress.test.js | dataset-progress combina secciones completadas y anotaciones parciales (sin revision) | — |
| 265 | tests/unit/shared/dataset-progress.test.js | dataset-progress separa entries revisadas y anotadas no revisadas cuando hay revision | — |
| 266 | tests/unit/shared/dataset-progress.test.js | dataset-progress cae a calculo por secciones cuando no se conocen entries anotadas | — |
| 267 | tests/unit/shared/dataset-progress.test.js | dataset-progress devuelve 100% pendiente cuando el dataset esta vacio | — |
| 268 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO produce el DatasetListDTO canonico | — |
| 269 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO propaga blockedBySelfAnnotation (regla de auto-revision) | — |
| 270 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetListDTO propaga hasActiveCredential cuando viene definido | — |
| 271 | tests/unit/shared/dto-mappers.test.js | dto-mappers mapDatasetSectionDTO produce el DatasetSectionDTO canonico desde la forma plana | — |
| 272 | tests/unit/shared/navigation-contract.test.js | navigation contract annotations.js solo lee datasetId de la URL y delega seccion/entry al servidor | — |
| 273 | tests/unit/shared/request-log-anomaly.test.js | request-log middleware — shouldLogAsServerError logs every 500 regardless of flags | — |
| 274 | tests/unit/shared/request-log-anomaly.test.js | request-log middleware — shouldLogAsServerError does not log ordinary 2xx/4xx responses | — |
| 275 | tests/unit/shared/request-log-anomaly.test.js | request-log middleware — shouldLogAsServerError logs a handled anomaly opted-in by the controller (e.g. failed credential check returning 200) | — |
| 276 | tests/unit/shared/request-log-middleware-contract.test.js | Request log middleware contract api-error-payload should set serverErrorReason on 5xx responses | — |
| 277 | tests/unit/shared/request-log-redaction.test.js | request-log redaction (T8) redacts AI credential secrets (apiKey/api_key/credential) and the legacy ones | — |
| 278 | tests/unit/shared/request-log-redaction.test.js | request-log redaction (T8) does NOT redact the legitimate masked field keyLast4 (no bare "key" token) | — |
| 279 | tests/unit/shared/request-log-redaction.test.js | request-log redaction (T8) returns non-object payloads unchanged | — |
| 280 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) expone los cinco criterios de frase en orden | — |
| 281 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) expone diversity como unico criterio de nivel de review | — |
| 282 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) ALL_CRITERION_CODES concatena criterios de frase y de review | — |
| 283 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getPhraseCriteria devuelve objetos con code, label y description | — |
| 284 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) el primer criterio de frase es naturalness | — |
| 285 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) isPhraseCriterion / isReviewCriterion clasifican por familia | — |
| 286 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getPhraseCriterionIndex devuelve la posicion ordenada o -1 si no existe | — |
| 287 | tests/unit/shared/review-criterion-constants.test.js | review-criterion constants (T4.1) getPhraseCriteria devuelve copias mutables sin afectar el original | — |
| 288 | tests/unit/shared/routes-canonical.test.js | canonical routes session-api expone el recurso REST de sesion bajo /api/session | — |
| 289 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) round-trips unicode and long strings | — |
| 290 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) produces a different ciphertext each time (random IV) but decrypts to the same value | — |
| 291 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) throws when the ciphertext is tampered with (GCM authentication) | — |
| 292 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) throws when the auth tag is tampered with | — |
| 293 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) throws on a malformed payload | — |
| 294 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) fails explicitly when no secret is configured | — |
| 295 | tests/unit/shared/secret-crypto.test.js | secret-crypto (T2) a credential encrypted with one secret cannot be decrypted with another | — |
| 296 | tests/unit/shared/service-error.test.js | service-error ServiceError.datasetNotFound produce 404 dataset_not_found canónico | — |
| 297 | tests/unit/shared/service-error.test.js | service-error ServiceError.emailTaken produce 409 email_taken canónico | — |
| 298 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) usa el mensaje fijo del catálogo para spelling_error sin explanation | — |
| 299 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) concatena explanation al mensaje fijo del catálogo | — |
| 300 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) usa el mensaje fijo para grammar_error | — |
| 301 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) usa el severity del catálogo aunque el LLM devuelva uno diferente | — |
| 302 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) usa el tipo del catálogo | — |
| 303 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) maneja código desconocido usando explanation como mensaje | — |
| 304 | tests/unit/shared/validation-alert-catalog.test.js | validation-alert-catalog (vía checkBatch) usa el campo message del LLM como fallback si no hay explanation ni catálogo | — |
| 305 | tests/unit/shared/validators.test.js | validators trimmedOr recorta cadenas no vacías y devuelve fallback en cualquier otro caso | — |
| 306 | tests/unit/shared/validators.test.js | validators normalizeEmail aplica trim+lowercase y devuelve fallback en valores inválidos | — |
| 307 | tests/unit/shared/validators.test.js | validators toBoolean acepta booleanos nativos, 0/1 numéricos y los tokens true/1/false/0 | — |
| 308 | tests/unit/shared/validators.test.js | validators toBoolean devuelve fallback para valores no reconocidos (incluidos null/undefined y tokens descartados) | — |

### Integration (new)

| # | File | Test | User Story |
|---|------|------|------------|
| 309 | tests/integration/admin/admin-api.test.js | admin api integration (E5) US-22 — un moderador lista usuarios y promueve a otro a moderador | — |
| 310 | tests/integration/admin/admin-api.test.js | admin api integration (E5) US-22 — el moderador no puede auto-degradarse (409) | — |
| 311 | tests/integration/admin/admin-api.test.js | admin api integration (E5) US-22 — un usuario normal no puede listar usuarios (403) | — |
| 312 | tests/integration/datasets/dataset-admin-stats.test.js | dataset statistics endpoint — review bucket (P2 integration) returns an empty review array for a review-enabled dataset with no reviews | — |
| 313 | tests/integration/datasets/dataset-admin-stats.test.js | dataset statistics endpoint — review bucket (P2 integration) returns review rows when terminal reviews exist | — |
| 314 | tests/integration/datasets/dataset-creation-rules.test.js | dataset creation rules (P6 integration) correction ⇒ review + additional forced true, never rejected | — |
| 315 | tests/integration/datasets/dataset-creation-rules.test.js | dataset creation rules (P6 integration) review disabled ⇒ additional reviews forced false | — |
| 316 | tests/integration/datasets/dataset-creation-rules.test.js | dataset creation rules (P6 integration) generation + review on keeps the requested additional flag | — |
| 317 | tests/integration/datasets/dataset-download.test.js | dataset download integration GET /api/datasets/:id/download devuelve el XML reconstruido como adjunto con nombre <name>.xml | — |
| 318 | tests/integration/datasets/dataset-download.test.js | dataset download integration GET /api/datasets/:id/download/annotated devuelve 409 dataset_not_completed cuando el dataset no está al 100% | — |
| 319 | tests/integration/datasets/dataset-download.test.js | dataset download integration GET /api/datasets/:id/download/annotated genera el XML extendido con Spanish lex emparejados al 100% | — |
| 320 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) Scenario 4 — security: admin manages credentials, responses are masked, non-admin is rejected | — |
| 321 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) requires authentication (no session → 401) | — |
| 322 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) Scenario 5 — check: the server calls the model with the decrypted key and returns its message | — |
| 323 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) Scenario 6 — llm_mode none: GET returns [] and writes are rejected (409) | — |
| 324 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) Scenario 5b — failed check: returns 200 {ok:false}, records an error-log line, and never leaks the API key (P1) | — |
| 325 | tests/integration/datasets/dataset-llm-credentials.test.js | US-31 per-dataset LLM credentials (integration) full admin lifecycle through the real app: create → activate → check → delete | — |
| 326 | tests/integration/datasets/dataset-section-size.test.js | dataset section size endpoint (P4 integration) GET /:id/sections/1 returns sectionSize entries for a dataset declared with sectionSize=4 | — |
| 327 | tests/integration/gemini/gemini-api.test.js | gemini-api live key validation responde 200 y devuelve texto generado con la clave proporcionada | — |
| 328 | tests/integration/madure/lifecycle.test.js | madure lifecycle (create → download → annotate section → review) lifecycle over ru_dev.xml | — |
| 329 | tests/integration/madure/lifecycle.test.js | madure lifecycle (create → download → annotate section → review) lifecycle over ru_dev_2.xml | — |
| 330 | tests/integration/me/me-stats.test.js | me stats integration (US-14) rejects an unauthenticated request with 401 | — |
| 331 | tests/integration/me/me-stats.test.js | me stats integration (US-14) returns the session user's aggregated totals and per-dataset breakdown | — |
| 332 | tests/integration/me/me-stats.test.js | me stats integration (US-14) returns empty totals for a user with no activity | — |
| 333 | tests/integration/reviews/annotation-review-handoff.test.js | annotation → review handoff integration before annotating, the review queue is empty (404 no_review_available) | — |
| 334 | tests/integration/reviews/annotation-review-handoff.test.js | annotation → review handoff integration saving an annotation flips the entry to "annotated" | — |
| 335 | tests/integration/reviews/annotation-review-handoff.test.js | annotation → review handoff integration the reviewer is now served that annotated entry, with the right annotator | — |
| 336 | tests/integration/reviews/annotation-review-handoff.test.js | annotation → review handoff integration an annotated entry in a review-disabled dataset is never served (Fix B) | — |
| 337 | tests/integration/reviews/annotation-review-handoff.test.js | full-section → review handoff (P5) annotating every entry of the section flips them all to "annotated" | — |
| 338 | tests/integration/reviews/annotation-review-handoff.test.js | full-section → review handoff (P5) every entry of the completed section is independently reviewable, then the queue drains | — |
| 339 | tests/integration/reviews/annotation-review-handoff.test.js | reviewer who is also an annotator (self-review exclusion) both users annotate their own entry | — |
| 340 | tests/integration/reviews/annotation-review-handoff.test.js | reviewer who is also an annotator (self-review exclusion) the reviewer-annotator is served the OTHER person's entry, never their own | — |
| 341 | tests/integration/reviews/annotation-review-handoff.test.js | reviewer who is also an annotator (self-review exclusion) the reviewer-annotator's own entry is still reviewable by a different reviewer | — |
| 342 | tests/integration/reviews/reviews-workflow.test.js | reviews workflow integration (T4.7) Escenario 3 — correccion de texto: comentario opcional, texto obligatorio | — |

---

Current dry-run totals (2026-06-25): 732 unit + 51 integration = **783** tests in the suite.
