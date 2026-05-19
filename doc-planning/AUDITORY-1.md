# Code Audit

Claude Opus, after auditing the project, detected the following issues:

1. Duplicated integration layer (Prisma vs. raw MySQL)
Problem. business/datasets-controller.js talks directly to Prisma. In parallel, integration/datasets-integration.js reimplements the same logic (list, get by id, create with transaction) over pool.js (MySQL driver) with manual helpers for acquireConnection, beginTransaction, runQuery, etc. mapDatasetRecordToSource + parseLanguages + toPercent exist twice with minimal variations.

General solution. Decide on a single data access path and remove the other one. Recommended: keep Prisma and delete integration/, pool.js, and the mysql dependency. If preserving the DAO shape is desired, extract a repositories/dataset-repository.js wrapping Prisma and make it the only access point from controllers.

2. Duplicated annotation logic between routes/annotator.js and business/annotations-controller.js
Problem. routes/annotator.js contains almost the same checkSentences, saveSentences, runCheck, runSave, isSendPayloadValid, isStringArray, getErrorMessage as business/annotations-controller.js. Additionally, routes/annotator.js contains a visible typo (reson instead of reason, line 48). usuarios.js also exposes /check, /annotations/check, /send, /annotations/send — four endpoints for two operations.

General solution. Remove routes/annotator.js (or convert it into a thin router that only declares routes and calls the controller). Consolidate into a single annotations-controller.js and expose it through a single router. Remove route aliases.

3. Dynamic collaborator "arity" detection (strong anti-pattern)
Problem. runCheck/runSave in annotations-controller.js and routes/annotator.js inspect SpanishController.check.length to decide whether the call is sync, 2-argument callback, 3-argument callback, or promise-based. This is fragile code, almost impossible to test, and “smells” like fear of breaking tests. It also introduces a strange pattern in finalize that treats the same argument as either an error or a result depending on its shape.

General solution. Define a single async contract for SpanishController.check(sentence, context) and SpanishController.save(rdfId, sentence, reason) that always return a Promise. In callers, use await. Support for “whatever the tests expect” should be achieved with standard mocks (jest/mock), not by inspecting .length.

4. Homemade dependency injection in every module (__setDependenciesForTests / __resetDependenciesForTests)
Problem. annotations-controller, datasets-controller, users-controller, datasets-integration repeat the same structure: mutable dependencies = {…} + two functions __setDependenciesForTests/__resetDependenciesForTests. This exposes mutable global state, forces tests to remember to reset, and couples test code to production code.

General solution. Adopt real dependency injection: each module exports a factory createDatasetsController({ prisma, xmlReader, … }) and app.js builds the graph once. Tests pass mocks into the factory. Delete all __...ForTests functions.

5. Critical security issues
Problem.

Plain-text passwords: users-controller.register stores payload.password as-is; login compares with user.password !== password. The User table also lacks UNIQUE on email.
Open trap-login: /fake-login in app.js:50-62 grants a session without credentials. It remains active even though config.debugMode exists.
Hardcoded session secret in routes/session.js (committed to the repository) with cookie.secure/httpOnly/sameSite not configured.
MySQL credentials hardcoded in config.js (user: 'root', password: '').
checkSession in app.js lets GET /datasets/* pass without a session (isDatasetsRoute) even though the internal router itself requires a session; redundant and fragile (a newly exposed route could break the model).
Global /tmp: datasets-controller.defaultReadFileAsBuffer and upload-middleware use a shared /tmp for the whole system, without per-user namespacing. On Windows, mkdirSync('/tmp') creates it at the drive root.
General solution.

Hash passwords with bcrypt/argon2, add UNIQUE(email), apply rate-limiting to login.
Delete /fake-login (or condition it explicitly on NODE_ENV==='test').
Move secrets and credentials to environment variables (dotenv), with cookies { httpOnly:true, sameSite:'lax', secure: prod }.
Replace the checkSession whitelist with a positive middleware (requireAuth) explicitly applied to each private router. Public routers should be mounted separately.
Use a project-specific directory (os.tmpdir() or ./tmp/<uuid>/...).

6. app.js is a wiring tree with inconsistent conventions
Problem. 150+ lines mix: app creation, middleware registration, inline definitions of checkSession/error404launcher/error404handler/error400handler/error500handler, debug routes, express.static registered twice (lines 17 and 33), error handlers separated by status instead of a single one, and route chains mounted with ambiguous prefixes (usuariosRouter mounted at /).

General solution. Move middlewares and error handlers to middlewares/errors.js, mount routes in a single routes/index.js. app.js should be reduced to: create app, register middlewares, mount root router, register a single error handler ((err, req, res, next) mapping by err.status). Remove the duplicate express.static.

7. xml-utils.js is dead/inconsistent code
Problem. utils/xml-utils.js uses ESM (import/export) in a CommonJS project; it imports DAOs (./daos/EntryDAO.js …) that do not exist. It duplicates DTOs already present in entities/entry.js and entities/dataset.js. If loaded, the process crashes.

General solution. Delete utils/xml-utils.js entirely. DTOs already live in entities/ and parsing in xml-reader.js. If persistence is needed, implement it from a repository, not from a parser.

8. Handcrafted ID generation (MAX(id)+1) with race condition
Problem. datasets-controller.createDataset, users-controller.register, and integration.createDataset compute idDataset/idUser via SELECT MAX(id)+1. Under concurrency this causes collisions (primary key violation). The database does not even declare PKs as AUTO_INCREMENT (see database.sql).

General solution. Declare idDataset, idUser as AUTO_INCREMENT in the DDL, map them in Prisma as @default(autoincrement()), and let the database assign the ID. Remove manual calculations.

9. Filesystem as absurd cache/IPC
Problem. datasets-controller.getDatasetText writes XML to /tmp with a random name, overwrites it, reads it, sends it, and deletes it — only to respond with a string already present in memory (datasetRow.content). Unnecessary pipeline with disk I/O and a race between writeFile and readFile.

General solution. Respond directly with datasetRow.content (res.type('text/plain').send(content)). Delete writeDatasetToTemp, defaultOverwriteTempFile, defaultReadTempFileAsText.

10. SpanishController mixes three responsibilities and uses a hybrid sync/async/callback API
Problem. SpanishController.check accepts (sentence), (sentence, callback), (sentence, context, callback), promise-based or sync forms. The comment in spanish-controller.js uses process.nextTick to simulate asynchrony. The class also mixes rules (regex), Ollama client, prompt construction, and response parsing.

General solution. Split into three modules: rule-checker.js (rules), ollama-spanish-checker.js (LLM), and a high-level spanish-service.js orchestrating both with a single async signature (sentence, context). Delete all arity/type branches.

11. Bilingual User entity; inconsistent session
Problem. entities/usuario.js attempts to support two languages (correo/email, contrasena/password, apellido1/surname1). users-controller.login stores { id, email, active } in session, but datasets-controller.resolveSessionUserId looks for idUser ?? id, and the /fake-login trap creates a Usuario with id:1, correo, contrasena, activo. This is the classic definition of an inconsistent format bus.

General solution. A single English format ({ idUser, email }) in session, and a single User class. Remove aliases and the bilingual Usuario.

12. Shared constants and logic without a common module
Problem. DATASET_COLORS is duplicated in datasets-controller.js and datasets-integration.js. toPositiveInteger, toInteger, normalizePercent, parseLanguages, normalizeDatasetName, isStringArray, getErrorMessage are copied across several modules.

General solution. Create utils/validators.js with generic functions (toPositiveInteger, toInteger, clampPercent, isStringArray, …) and constants/datasets.js with DATASET_COLORS, SECTION_SIZE, DEFAULT_LANGUAGES. All modules should import from there.

13. Opaque error handling
Problem. Controllers swallow all exceptions with catch (_error) and return generic 500 responses without logging. The only trace is response.locals.serverErrorReason for the logging middleware, and it is only set in some places. Production visibility is lost.

General solution. Centralize with an Express error middleware ((err, req, res, next) => …): controllers should throw or call next(err), the middleware maps err.status/type to the response and always logs. Use asyncHandler or express-async-errors to avoid writing try/catch in every handler.

14. Fragile routes: order and aliases
Problem. In routes/datasets.js order matters (/:id vs /:id/view); if reordered, it breaks. In routes/usuarios.js there are aliases /check and /annotations/check. In public.js there are /registro and /register pointing to the same file.

General solution. Maintain a canonical URL per resource. Remove aliases. Separate view routes (static HTML) from API routes under a different prefix (/api/datasets/…) to avoid ambiguities with /:id.

15. XML persistence as BLOB vs. orphaned relational schema
Problem. database.sql defines entry, tripleset, triple, lex, dbpedialink, link — but nothing writes there (the DAOs do not exist). What is actually used is Dataset.content MEDIUMBLOB with the full XML, and parsing is performed on every request (parseAnnotationEntries).

General solution. Choose one model:

Option A (BLOB): remove unused entry/tripleset/triple/lex/dbpedialink/link tables; cache parsed XML in memory or a derived table.
Option B (relational): implement the missing repositories, persist entries when uploading XML, and use BLOB only for download/export.

16. Other minor smells
debug-utils.js imports ./log-utils, which does not exist in the repository → it will fail when required.
entities/dataset.js exports DatasetDTO as module.exports = DatasetDTO and also module.exports.DatasetDTO = DatasetDTO — confusing pattern; better: module.exports = { DatasetDTO, DatasetListItemDTO } and adjust the import in xml-reader.js.
cookie-parser is registered alongside express-session; cookie-parser is unnecessary with express-session.
request-log-middleware.js logs the raw body, including passwords in /register and /crear-sesion (PII in logs).
checkSession returns response.redirect but the app serves both HTML and JSON; JSON clients receive a 302 to login.
In saveSentences (annotations-controller), the index is not validated before reading rejectionReasons[index].

Breakdown:
16.1. debug-utils → missing log-utils
Find the import, remove it, or create the file.

16.2. dataset.js exports confusingly
Mechanical change to destructuring; almost already done in #12.

16.3. Redundant cookie-parser
Remove middleware from app.js.

16.4. request-log-middleware logs PII
Sanitize the body; decide which fields to hide (clear scope).

16.5. checkSession redirect vs JSON clients
Requires an architectural decision: Accept header? JSON+302? Content negotiation?

16.6. saveSentences without index validation
Add bounds checking inside the loop.