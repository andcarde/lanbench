# Auditoría de arquitectura — AUDITORIA-2

**Fecha:** 2026-04-22
**Auditor:** Claude Opus 4.7
**Alcance:** código fuente de `lanbench` (excluye `node_modules/`, `public/`, `test_datasets/`, `logs/`, `views/`).
**Referencia previa:** `AUDITORIA-1.md` (varios hallazgos ya mitigados: separación `spanish-service` / `rule-checker` / `ollama-spanish-checker`; eliminación de `entities/usuario.js`, `routes/annotator.js`, `integration/*`, `pool.js`; `AUTO_INCREMENT` en `Dataset`/`User`; redacción de passwords en logs; `getDatasetText` ya devuelve contenido en memoria).

---

## 1. Identificación de la arquitectura

El sistema es un **monolito Node.js/Express con organización en capas** (layered architecture), con intención parcial de MVC pero sin adherirse de forma estricta. La topología observada es:

```
routes/*            (capa de transporte HTTP — routers Express)
   ↓
business/*          (capa de aplicación — controllers + orquestación)
   ↓
prisma/client.js    (capa de persistencia — ORM)
entities/*          (DTOs / VO anémicos)
utils/*             (helpers: XML, validación, Ollama)
```

No se observan rasgos de **hexagonal** (no hay puertos/adaptadores explícitos, las dependencias de infraestructura —Prisma, filesystem `/tmp`, Ollama HTTP— se consumen directamente desde la capa de aplicación), ni de **microservicios** (un único proceso Express, un único `package.json`, una única BD).

### 1.1 Cohesión por módulo

| Módulo | Cohesión | Observación |
|---|---|---|
| `business/*` | **Media-baja** | Los controllers mezclan validación de payload HTTP, orquestación, consultas Prisma, mapeo a DTO y formateo de respuesta. Un mismo handler acumula 4 responsabilidades. |
| `utils/*` | **Media** | Agrupados por propósito, pero `xml-utils.js` es un shim inútil y `xml-writer.js` diverge en estilo (callback). |
| `routes/*` | **Media-alta** | Routers finos, con separación clara entre páginas (HTML) y API (`/api/...`). |
| `entities/*` | **Baja** | Tres convenciones de export distintas (`User` clase, `Dataset` dos clases en objeto, `Entry` clase suelta sin `'use strict'`). |
| `middlewares/*` | **Alta** | Cada middleware tiene una única responsabilidad bien delimitada. |

### 1.2 Acoplamiento

- **Controllers → Prisma directo** (sin repositorio). Cualquier cambio de ORM toca N controllers.
- **Controllers → filesystem `/tmp`** (acoplamiento a infraestructura del SO; en Windows se crea en raíz del disco).
- **Rutas → controllers con dos estilos de construcción** simultáneos: factoría con DI (`createDatasetsApiRouter({ datasetsController })`) *y* singleton default instanciado como efecto secundario del `require`. **Dualidad no justificada.**
- **Middleware de log ↔ controllers**: contrato implícito vía `response.locals.serverErrorReason`, no todos los controllers lo setean.
- **Session store ↔ config**: credenciales MySQL y secreto de sesión hardcodeados en `config.js` y `routes/session.js`.

### 1.3 Comparación con estándares de la industria

| Principio | Estado | Desviación |
|---|---|---|
| **SRP** (Single Responsibility) | ⚠️ violado | Handlers HTTP mezclan validación + Prisma + mapeo + respuesta. |
| **DIP** (Dependency Inversion) | ⚠️ parcial | La factoría acepta dependencias inyectadas, pero convive con un singleton default → dos grafos de dependencias simultáneos. |
| **OCP / LSP** | ✅ n/a relevante | — |
| **Separación de responsabilidades** | ⚠️ parcial | Ausencia de capa `repositories/` y capa `services/` distinta de la capa `controllers/`. |
| **Modularidad** | ✅ razonable | Directorios bien delimitados, imports relativos limpios. |
| **Secretos en código** | ❌ | MySQL root/'' y session secret en el repo. |
| **Observabilidad** | ⚠️ | `catch (_error)` silencioso en varios handlers sin loggear ni propagar razón. |
| **Gestión de errores Express** | ⚠️ | Tres handlers por status en vez de uno genérico con `err.status`. |

---

## 2. Tabla de problemas detectados

| # | Tipo | Scope | Descripción | Complejidad | Modelo mínimo viable |
|---|---|---|---|---|---|
| 1 | Incoherencia | general (raíz) | Coexisten `.eslintrc.js` (config legacy) y `eslint.config.js` (flat config). Ambigüedad sobre cuál aplica; el linter puede usar cualquiera según versión/flag. | Mínima | Claude Haiku Thinking |
| 2 | Redundancia | fichero [app.js](app.js) | `express.static(public)` se registra dos veces ([app.js:17](app.js#L17) con prefijo `/public` y [app.js:33](app.js#L33) sin prefijo). | Mínima | Claude Haiku Thinking |
| 3 | Redundancia | paquete [package.json](package.json) | Dependencias declaradas y no usadas en el código: `cookie-parser`, `morgan`, `mysql` (el ORM es Prisma+MariaDB adapter). | Mínima | Claude Haiku Thinking |
| 4 | Redundancia | fichero [business/datasets-controller.js](business/datasets-controller.js) | `normalizePercent` importado ([L15](business/datasets-controller.js#L15)) sin usar; `writeDataset` inyectado como dependencia ([L11,L31](business/datasets-controller.js#L11)) pero nunca invocado. | Mínima | Claude Haiku Thinking |
| 5 | Redundancia | fichero [business/ollama-spanish-checker.js](business/ollama-spanish-checker.js) | `parseRawResponse` ([L81-98](business/ollama-spanish-checker.js#L81-L98)) exportada pero nunca llamada; el parseo real vive en `ollama-client.parseJsonPayload`. | Mínima | Claude Haiku Thinking |
| 6 | Redundancia | fichero [utils/xml-utils.js](utils/xml-utils.js) | Shim trivial `module.exports = require('./xml-format');` sin ningún cliente directo. Sustituible por import directo. | Mínima | Claude Haiku Thinking |
| 7 | Redundancia | método `createAnnotationsController` en [business/annotations-controller.js](business/annotations-controller.js) | Array `savedAnnotations` ([L8](business/annotations-controller.js#L8)) recibe `push` en `finalizeSavedSentence` pero nunca se lee ni se persiste — persistencia simulada, confunde al lector. | Baja | Claude Haiku Thinking |
| 8 | Acoplamiento | general (seguridad) [config.js](config.js) + [routes/session.js](routes/session.js) | Credenciales MySQL (`user:'root'`, `password:''`) hardcodeadas ([config.js:7-13](config.js#L7-L13)) y secreto de sesión de 640 chars committeado ([session.js:22-31](routes/session.js#L22-L31)); cookie sin flags `httpOnly`/`secure`/`sameSite`. | Media | Claude Sonnet 4.6 Medium |
| 9 | Contrato | fichero [business/users-controller.js](business/users-controller.js) | Passwords almacenadas en claro ([L36](business/users-controller.js#L36)) y comparadas con `!==` ([L65](business/users-controller.js#L65)). Rompe el contrato de confidencialidad; debería usar `bcrypt`/`argon2`. | Media | Claude Sonnet 4.6 Medium |
| 10 | Contrato | paquete (schema) [prisma/schema.prisma](prisma/schema.prisma) + [database/database.sql](database/database.sql) | `User.email` sin `@unique`; la unicidad se comprueba en código con `findFirst` previo a `create`, lo que introduce race condition en concurrencia. | Baja | Claude Haiku Thinking |
| 11 | Acoplamiento | general (filesystem) [middlewares/upload-middleware.js](middlewares/upload-middleware.js) + [business/datasets-controller.js](business/datasets-controller.js) + [utils/xml-reader.js](utils/xml-reader.js) | Dependencia dura al directorio absoluto `/tmp`: `mkdirSync('/tmp')` ([upload-middleware.js:18](middlewares/upload-middleware.js#L18)) crea en raíz del disco en Windows; el namespacing es global. Acopla la aplicación al layout del SO. | Media | Claude Sonnet 4.6 Medium |
| 12 | Incoherencia | paquete `business/` | Tres patrones de export conviven: (a) factoría + singleton default + `__setDependenciesForTests`/`__resetDependenciesForTests` en [datasets-controller.js:367-391](business/datasets-controller.js#L367-L391) y [users-controller.js:130-144](business/users-controller.js#L130-L144); (b) factoría + alias directos del singleton default en [annotations-controller.js:185-191](business/annotations-controller.js#L185-L191); (c) el singleton se instancia como efecto lateral de `require`, aun cuando `app.js` crea una segunda instancia vía factoría que es la realmente montada — **dos grafos de dependencias vivos**. | Alta | Claude Sonnet 4.6 High |
| 13 | Acoplamiento | paquete `business/` | Los controllers mezclan 4 responsabilidades (validación de payload HTTP, orquestación, consulta Prisma, mapeo DTO, formateo de respuesta). Viola SRP y impide tests sin base de datos real. Faltan capas `repositories/` y `services/` separadas de la HTTP. | Alta | Claude Sonnet 4.6 High |
| 14 | Incoherencia | paquete `routes/` | Mezcla de idiomas en nombres: fichero [routes/usuarios.js](routes/usuarios.js) (español) entre el resto en inglés; endpoint `POST /crear-sesion` ([usuarios.js:15](routes/usuarios.js#L15)) frente al resto de endpoints en inglés. Además [routes/administrator.js](routes/administrator.js) solo contiene `/logout`, semánticamente no administrativo. | Baja | Claude Haiku Thinking |
| 15 | Acoplamiento | fichero [app.js](app.js) | Handlers de error separados por status (`error404handler`, `error400handler`, `error500handler` en [app.js:80-105](app.js#L80-L105)) encadenados — el patrón canónico es un único `(err,req,res,next)` que mapea por `err.status`. Frágil al añadir nuevos códigos. | Baja | Claude Sonnet 4.6 Medium |
| 16 | Incoherencia | paquete `entities/` | Tres convenciones de export: `user.js` (`module.exports = User`), `dataset.js` (`module.exports = { DatasetDTO, DatasetListItemDTO }`), `entry.js` (`module.exports = EntryDTO`, sin `'use strict'`, sin estilo común). | Mínima | Claude Haiku Thinking |
| 17 | Contrato | método `save` en [business/spanish-service.js](business/spanish-service.js) + endpoint `POST /api/annotations/send` | `save(rdfId, sentence, reason)` devuelve siempre `{ ok:true, rdfId, sentence, rejectionReason }` ([L18-25](business/spanish-service.js#L18-L25)) sin persistir nada en BD. El endpoint responde 200 al cliente pero no guarda la anotación — promesa rota. | Media | Claude Sonnet 4.6 Medium |
| 18 | Acoplamiento | middleware [middlewares/request-log-middleware.js](middlewares/request-log-middleware.js) ↔ controllers | Contrato implícito vía `response.locals.serverErrorReason`. Solo algunos controllers lo setean (`listDatasets`, `getDatasetText`, `createDataset`), otros no (`getDatasetById`, `getDatasetSection`, `listAllDatasets`, `users-controller.*`). Logging de errores 500 inconsistente. | Baja | Claude Haiku Thinking |
| 19 | Redundancia | método `runCheck`/`runSave` en [business/annotations-controller.js](business/annotations-controller.js) | Guardas defensivas `typeof service.check !== 'function'` ([L62](business/annotations-controller.js#L62)) y `typeof service.save !== 'function'` ([L70](business/annotations-controller.js#L70)) — el servicio es fijo (`require('./spanish-service')`), la comprobación es código muerto resultante del refactor del arity-polymorphism descrito en AUDITORIA-1. | Mínima | Claude Haiku Thinking |
| 20 | Contrato | paquete [prisma/schema.prisma](prisma/schema.prisma) (modelos `Entry`, `Tripleset`, `Triple`, `Lex`, `Dbpedialink`, `Link`) | Seis modelos relacionales definidos en el schema y en `database.sql` pero ningún código de la aplicación los lee ni los escribe. El contenido XML entero vive como BLOB en `Dataset.content`. O schema muerto, o contrato de persistencia pendiente de implementar. | Alta | Claude Sonnet 4.6 High |
| 21 | Acoplamiento | fichero [utils/xml-writer.js](utils/xml-writer.js) | API callback-based `writeDataset(dataset, callback)` ([L64-72](utils/xml-writer.js#L64-L72)) mientras todo el proyecto usa `async/await`. Incoherencia de estilo asincrónico; además la función se inyecta pero nunca se llama. | Baja | Claude Haiku Thinking |
| 22 | Contrato | método `saveSentences` en [business/annotations-controller.js](business/annotations-controller.js) | Asume alineación posicional `sentences[i]` ↔ `rejectionReasons[i]` ([L55-58](business/annotations-controller.js#L55-L58)). `isSendPayloadValid` comprueba igualdad de longitudes pero no semántica: si el cliente reordena uno de los arrays, la correspondencia se pierde silenciosamente. | Baja | Claude Haiku Thinking |
| 23 | Otros (observabilidad) | métodos `register`/`login` en [business/users-controller.js](business/users-controller.js) y varios en [business/datasets-controller.js](business/datasets-controller.js) | `catch (_error)` traga excepciones sin loggear ni propagar razón — el único cliente con trazabilidad es el log middleware vía `serverErrorReason`, y en estos no se setea. Resultan 500 opacos. | Baja | Claude Haiku Thinking |
| 24 | Otros (naming engañoso) | fichero [download_datasets.js](download_datasets.js) | Script de 7 líneas que solo exporta `DATASET_SOURCE_URL` y no realiza ninguna descarga. Nombre del fichero sugiere un ejecutable que no existe. | Mínima | Claude Haiku Thinking |

---

## 3. Justificación de la asignación de modelo

Criterio aplicado: **menor potencia con tasa de éxito ≥ 95%**, considerando tipo+complejidad del problema y capacidad de razonamiento+contexto del modelo.

- **Claude Haiku Thinking** → asignado a tareas mecánicas y locales: eliminación de imports no usados, dead code simple, renombrados, consolidación de convenciones de export, ajustes de schema puntuales. Volumen de contexto reducido (1-2 ficheros), razonamiento directo, bajo riesgo.
- **Claude Sonnet 4.6 Medium** → asignado a tareas con implicación transversal pero acotada: mover secretos a variables de entorno, introducir `bcrypt`, unificar error handler, reemplazar `/tmp` por `os.tmpdir()`, implementar persistencia de anotaciones. Requieren coordinación entre 2-5 ficheros y decisiones de API.
- **Claude Sonnet 4.6 High** → asignado a refactor arquitectónico: unificar el patrón de construcción de controllers (eliminar el singleton default dual), introducir capa `repositories/` y extracción de `services/`, y decidir la estrategia de persistencia de entries (BLOB vs relacional). Estas tareas tocan la forma del dominio y requieren razonamiento estructural sobre el grafo completo.
- **Claude Opus 4.7 Medium / High** y **ChatGPT 5.4** → **no asignados**. No se ha identificado ningún problema que requiera razonamiento más potente: no hay algoritmos complejos, inferencia ambigua de intención, ni volumen de contexto que exceda la ventana de Sonnet 4.6. Escalar a estos modelos sería sobre-dimensionado.

---

## 4. Resumen ejecutivo

- La arquitectura base es **correcta para el tamaño del proyecto** (monolito en capas Express+Prisma) y ha absorbido bien los hallazgos de AUDITORIA-1.
- Las **dos deudas estructurales principales** restantes son:
  1. **Dualidad de instanciación de controllers** (factoría DI + singleton default coexistentes). Es la raíz de la inconsistencia de estilo en `business/` y en `routes/*-api.js`.
  2. **Schema relacional de entries huérfano** (`Entry`/`Tripleset`/`Triple`/`Lex`/`Dbpedialink`/`Link` sin escritores ni lectores).
- Las **prioridades de seguridad** no resueltas desde AUDITORIA-1 son: contraseñas en claro, secret+credenciales hardcodeados y acoplamiento a `/tmp`.
- El resto son olores menores (redundancia, naming, dead deps) resolubles con Haiku Thinking en un solo pase.
