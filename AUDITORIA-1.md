# Auditoría de código

Claude Opus tras auditar el proyecto ha detectado las siguientes indicencias:

1. Capa de integración duplicada (Prisma vs. mysql crudo)
Problema. business/datasets-controller.js habla con Prisma directamente. En paralelo, integration/datasets-integration.js reimplementa lo mismo (listar, obtener por id, crear con transacción) sobre pool.js (driver mysql) con helpers manuales para acquireConnection, beginTransaction, runQuery, etc. mapDatasetRecordToSource + parseLanguages + toPercent existen dos veces con variaciones mínimas.

Solución general. Decidir una única ruta de acceso a datos y eliminar la otra. Recomendado: quedarse con Prisma y borrar integration/, pool.js y la dependencia mysql. Si se quiere preservar la forma DAO, extraer un repositories/dataset-repository.js que envuelva Prisma y sea el único punto de acceso desde los controllers.

2. Lógica de anotaciones duplicada entre routes/annotator.js y business/annotations-controller.js
Problema. routes/annotator.js contiene casi el mismo checkSentences, saveSentences, runCheck, runSave, isSendPayloadValid, isStringArray, getErrorMessage que business/annotations-controller.js. Además routes/annotator.js tiene un typo visible (reson en vez de reason, línea 48). usuarios.js además expone /check, /annotations/check, /send, /annotations/send — cuatro endpoints para dos operaciones.

Solución general. Eliminar routes/annotator.js (o convertirlo en un router delgado que sólo declare rutas y llame al controller). Consolidar en un único annotations-controller.js y exponerlo desde un único router. Eliminar alias de rutas.

3. Detección dinámica del "arity" del colaborador (anti-patrón fuerte)
Problema. runCheck/runSave en annotations-controller.js y routes/annotator.js inspeccionan SpanishController.check.length para decidir si la llamada es sync, callback de 2, callback de 3 o promesa. Es código frágil, casi imposible de testear y "huele" a miedo a romper tests. Induce también un patrón raro en finalize que trata un mismo argumento como error o como resultado según su forma.

Solución general. Definir un único contrato async para SpanishController.check(sentence, context) y SpanishController.save(rdfId, sentence, reason) que siempre devuelvan Promise. En los callers, await. El soporte para "lo que los tests esperen" se consigue con mocks estándar (jest/mock), no inspeccionando .length.

4. Inyección de dependencias casera en cada módulo (__setDependenciesForTests / __resetDependenciesForTests)
Problema. annotations-controller, datasets-controller, users-controller, datasets-integration repiten la misma estructura: dependencies = {…} mutable + dos funciones __setDependenciesForTests/__resetDependenciesForTests. Esto expone estado global mutable, obliga al test a acordarse de resetear, y acopla código de tests al código de producción.

Solución general. Adoptar inyección real: cada módulo exporta una factoría createDatasetsController({ prisma, xmlReader, … }) y app.js arma el grafo una sola vez. Los tests pasan mocks a la factoría. Borra todas las funciones __...ForTests.

5. Seguridad crítica
Problema.

Contraseñas en claro: users-controller.register guarda payload.password tal cual; login compara con user.password !== password. La tabla User tampoco tiene UNIQUE en email.
Trap-login abierto: /fake-login en app.js:50-62 otorga sesión sin credenciales. Sigue activo incluso aunque config.debugMode existe.
Secreto de sesión hardcodeado en routes/session.js (committeado al repo) con cookie.secure/httpOnly/sameSite no configurados.
Credenciales MySQL en config.js (user: 'root', password: '') hardcodeadas.
checkSession en app.js deja GET /datasets/* pasar sin sesión (isDatasetsRoute) aunque el router interno sí exige sesión; es redundante y frágil (basta que alguien exponga una ruta nueva para romper el modelo).
/tmp global: datasets-controller.defaultReadFileAsBuffer y upload-middleware usan /tmp compartido por todo el sistema, sin namespacing por usuario. Sobre Windows, mkdirSync('/tmp') se crea en la raíz del disco.
Solución general.

Hashear contraseñas con bcrypt/argon2, añadir UNIQUE(email), rate-limit al login.
Borrar /fake-login (o condicionarlo a NODE_ENV==='test' explícito).
Mover secret y credenciales a variables de entorno (dotenv), con cookies { httpOnly:true, sameSite:'lax', secure: prod }.
Reemplazar checkSession whitelist por un middleware positivo (requireAuth) aplicado explícitamente a cada router privado. Los públicos se montan aparte.
Usar un directorio propio del proyecto (os.tmpdir() o ./tmp/<uuid>/...).
6. app.js es un árbol de cableado con convenciones inconsistentes
Problema. 150+ líneas mezclan: creación de app, registro de middlewares, definición inline de checkSession/error404launcher/error404handler/error400handler/error500handler, rutas de debug, express.static registrado dos veces (líneas 17 y 33), error handlers separados por status en vez de uno único, cadena de rutas montadas con prefijos ambiguos (usuariosRouter montado en /).

Solución general. Mover middlewares y error handlers a middlewares/errors.js, montar rutas en un solo routes/index.js. app.js queda reducido a: crear app, registrar middlewares, montar router raíz, registrar error handler único ((err, req, res, next) que mapea por err.status). Eliminar el duplicado de express.static.

7. xml-utils.js es código muerto/incoherente
Problema. utils/xml-utils.js usa ESM (import/export) en un proyecto CommonJS; importa DAOs (./daos/EntryDAO.js …) que no existen. Duplica DTOs que ya están en entities/entry.js y entities/dataset.js. Si alguien lo carga, el proceso falla.

Solución general. Borrar utils/xml-utils.js completo. Los DTOs ya viven en entities/ y el parsing en xml-reader.js. Si se necesita persistencia, hacerlo desde un repositorio, no desde un parser.

8. Generación de IDs "a mano" (MAX(id)+1) con condición de carrera
Problema. Tanto datasets-controller.createDataset como users-controller.register y integration.createDataset calculan idDataset/idUser vía SELECT MAX(id)+1. En concurrencia produce colisiones (violación de clave primaria). La BD ni siquiera declara las PK como AUTO_INCREMENT (ver database.sql).

Solución general. Declarar idDataset, idUser como AUTO_INCREMENT en DDL, mapearlo en Prisma como @default(autoincrement()) y dejar que la BD asigne el id. Eliminar los cálculos manuales.

9. Filesystem como caché/IPC absurdo
Problema. datasets-controller.getDatasetText escribe el XML en /tmp con nombre aleatorio, sobreescribe, lo lee, lo envía y lo borra — para luego responder un string que ya tenía en memoria (datasetRow.content). Pipeline innecesario con I/O de disco y race entre writeFile y readFile.

Solución general. Responder datasetRow.content directamente (res.type('text/plain').send(content)). Borrar writeDatasetToTemp, defaultOverwriteTempFile, defaultReadTempFileAsText.

10. SpanishController mezcla tres responsabilidades y usa API híbrida sync/async/callback
Problema. SpanishController.check acepta (sentence), (sentence, callback), (sentence, context, callback), promesa o sync. El comentario en spanish-controller.js usa process.nextTick para simular asincronía. Además la clase junta reglas (regex), cliente Ollama, construcción de prompt y parsing de la respuesta.

Solución general. Separar en tres módulos: rule-checker.js (reglas), ollama-spanish-checker.js (LLM) y un servicio de alto nivel spanish-service.js que orquesta los dos con una sola firma async (sentence, context). Borrar todas las ramas de arity/tipo.

11. Entidad Usuario bilingüe; sesión inconsistente
Problema. entities/usuario.js intenta soportar dos idiomas (correo/email, contrasena/password, apellido1/surname1). users-controller.login guarda en sesión { id, email, active }, pero datasets-controller.resolveSessionUserId busca idUser ?? id, y el trap /fake-login crea un Usuario con id:1, correo, contrasena, activo. Es la definición clásica de un bus de formatos inconsistente.

Solución general. Una sola forma en inglés ({ idUser, email }) en sesión, una única clase User. Eliminar aliases y el Usuario bilingüe.

12. Constantes y lógica compartida sin módulo común
Problema. DATASET_COLORS está duplicado en datasets-controller.js y datasets-integration.js. toPositiveInteger, toInteger, normalizePercent, parseLanguages, normalizeDatasetName, isStringArray, getErrorMessage están copiados en varios módulos.

Solución general. Crear utils/validators.js con las funciones genéricas (toPositiveInteger, toInteger, clampPercent, isStringArray, …) y constants/datasets.js con DATASET_COLORS, SECTION_SIZE, DEFAULT_LANGUAGES. Todos los módulos importan de ahí.

13. Manejo de errores opaco
Problema. Los controllers tragan toda excepción con catch (_error) y devuelven 500 genérico, sin loggear. El único rastro es response.locals.serverErrorReason para el middleware de log, y sólo está puesto en algunos sitios. Se pierde visibilidad en producción.

Solución general. Centralizar con un middleware de errores Express ((err, req, res, next) => …): los controllers hacen throw o next(err), el middleware mapea err.status/tipo a la respuesta y siempre loggea. Usar asyncHandler o express-async-errors para no escribir try/catch en cada handler.

14. Rutas frágiles: orden y alias
Problema. En routes/datasets.js el orden importa (/:id vs /:id/view); si alguien reordena se rompe. En routes/usuarios.js hay alias /check y /annotations/check. En public.js hay /registro y /register apuntando al mismo fichero.

Solución general. Mantener una URL canónica por recurso. Eliminar aliases. Separar rutas de vista (HTML estático) de rutas API bajo prefijo distinto (/api/datasets/…) para evitar ambigüedades con /:id.

15. Persistencia XML como BLOB vs. esquema relacional huérfano
Problema. database.sql define entry, tripleset, triple, lex, dbpedialink, link — pero nadie escribe ahí (los DAOs no existen). Lo que se usa es Dataset.content MEDIUMBLOB con el XML entero, y el parsing se hace en cada petición (parseAnnotationEntries).

Solución general. Elegir un modelo:

Opción A (BLOB): borrar las tablas entry/tripleset/triple/lex/dbpedialink/link no usadas; cachear el parseo del XML en memoria o en una tabla derivada.
Opción B (relacional): implementar los repositorios que faltan, persistir entries al subir el XML, y usar BLOB sólo para descarga/export.
16. Otros olores menores
debug-utils.js importa ./log-utils, que no existe en el repo → romperá al ser requerido.
entities/dataset.js exporta DatasetDTO como module.exports = DatasetDTO y a la vez module.exports.DatasetDTO = DatasetDTO — patrón confuso; mejor un module.exports = { DatasetDTO, DatasetListItemDTO } y ajustar el import en xml-reader.js.
cookie-parser se registra, pero también express-session; cookie-parser no es necesario con express-session.
request-log-middleware.js loguea el body crudo, incluidas contraseñas en /register y /crear-sesion (PII en logs).
checkSession retorna response.redirect pero la app sirve HTML y JSON mezclados; clientes JSON reciben un 302 al login.
En saveSentences (annotations-controller) no se valida índice/ordena antes de leer rejectionReasons[index].

Desglose:
16.1. debug-utils → log-utils inexistente	
Buscar import, eliminar o crear archivo
16.2. dataset.js exporta confusamente
Cambio mecánico a destructuring; ya casi hecho en #12
16.3. cookie-parser redundante
Remover middleware de app.js
16.4. request-log-middleware loguea PII
Sanitizar body; decidir qué campos ocultar (scope claro)
16.5. checkSession redirect vs JSON clients
Requiere decisión arquitectónica: ¿Accept header? ¿JSON+302? ¿Content negotiation?
16.6. saveSentences sin validación de índice
Agregar bounds checking en bucle