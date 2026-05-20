# IA-CLOUD-TASK — Credenciales LLM por dataset

Fecha: 2026-05-20

Fuentes usadas:
- `documentation/USER-STORIES.md` — catalogo funcional (ultima US existente: `US-30`; la nueva sera `US-31`).
- `documentation/TECHNICAL-DESIGN.md` — modelo de datos y convenciones de capas.
- `prisma/schema.prisma` — fuente de verdad del modelo de datos.
- `DOCUMENTATION.md` §4 (plantilla `EPIC-<n>-PLAN.md`) y §5/§6 (convenciones de ficheros numerados / planificacion).
- `CLAUDE.md` — metodologia de desarrollo (fase 0: planificar y validar antes de ejecutar) y nota de sincronizacion Prisma.
- Estado real del repositorio a fecha de hoy (cadena de invocacion LLM trazada).

> **Estado: PLAN PENDIENTE DE VALIDACION (fase 0).** Este documento es el entregable de planificacion. No se ha modificado todavia `USER-STORIES.md`, `TECHNICAL-DESIGN.md`, el schema ni el codigo. La documentacion canonica (US-31 + diseno tecnico) se redacta en **T0**, una vez validado el enfoque. Al cerrar el bloque, las reglas de negocio y de implementacion migran a `USER-STORIES.md` / `TECHNICAL-DESIGN.md` y este fichero se elimina (DOCUMENTATION.md §6).

---

## Introduccion

Hoy el proveedor LLM y su clave son **globales y unicos** para toda la aplicacion: `MODEL` selecciona `local`/`cloud` en [config.js:97](../config.js#L97) y la clave de Groq sale de `GROQ_API_KEY` en [config.js:108](../config.js#L108). Un unico despachador, [utils/llm-client.js:21-26](../utils/llm-client.js#L21), enruta a `groq-client` u `ollama-client` segun ese valor global.

Este bloque introduce **credenciales de IA por dataset**: el administrador de un dataset registra una clave (Groq u otro proveedor de IA) y la validacion asistida por IA de **ese** dataset usa esa credencial, sin afectar a los demas datasets ni a la configuracion global.

Es un bloque complejo y sensible por seguridad (almacenamiento de secretos). La metodologia de verificacion es: tests unitarios por tarea (cifrado, repositorio, servicio, despachador) + tests de integracion al cierre. No colisiona con otros bloques en curso conocidos.

---

## Resumen Del Bloque

| Campo                       | Valor                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Bloque                      | IA-CLOUD                                                                     |
| Nombre                      | Credenciales LLM por dataset                                                |
| Prioridad                   | P1                                                                           |
| Dependencias de entrada     | Ninguna dura. Reutiliza permisos de dataset y el cliente OpenAI-compatible existente. |
| Dependencias recomendadas   | Ninguna                                                                      |
| Dependencias de salida      | Habilita futura ejecucion de generacion/traduccion (US-15/US-16) con clave propia del dataset. |
| Tareas comunes activadas    | Redaccion de secretos en logs (transversal de seguridad)                    |

---

## US Incluidas

| US     | Titulo                                          | Estado actual                                                                 |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| US-31  | Credencial de IA por dataset (admin del dataset) | Sin implementar — no existe tabla, endpoint ni propagacion de clave por dataset. |

Texto propuesto (se redacta formalmente en T0):

> `US-31`: As a dataset administrator, I want to register and manage one or more AI provider API keys (Groq or another provider) for my dataset, choosing which one is active and being able to "check" each one, so that the AI-assisted validation of that dataset uses my own credential instead of the global one.

Criterios de aceptacion (resumen; se formalizan en T0):
- Solo el admin del dataset ve y opera el panel "Credenciales de IA".
- **El panel completo se oculta cuando `Uso de LLMs` = `Ninguna` (`llm_mode = 'none'`).** En ese estado no se muestra el formulario de alta **ni** las credenciales ya existentes. Hoy `llm_mode` solo se fija en la creacion y no es editable, asi que en la practica no puede darse un dataset con credenciales que pase a `Ninguna`; aun asi el ocultado debe aplicarse de forma defensiva por si tal estado existiera hipoteticamente (p.ej. si `llm_mode` pasa a ser editable o por inconsistencia de datos).
- La clave nunca se muestra completa: solo enmascarada (`••••last4`).
- Cada credencial de la lista tiene una accion **"check"** que verifica que el modelo responde (ver Decision 4 y T4/T7/T9).

---

## Decisiones De Diseno (validadas con el usuario)

1. **Cardinalidad 1:N con una credencial activa.** Una tabla `dataset_llm_credentials` con varias filas por dataset (una por proveedor) y un flag `is_active` que designa la usada. Unicidad `[dataset_id, provider]`. La regla "como mucho una activa por dataset" se garantiza en la capa servicio/repositorio dentro de una transaccion (al activar una, se desactivan las demas), porque MySQL/Prisma no ofrece indice unico parcial comodo.
2. **Abstraccion de proveedor: generico OpenAI-compatible + adaptadores nativos.** El cliente generico (base URL + model + key) cubre Groq/OpenAI/Together/OpenRouter/servidores locales OpenAI-compatibles reutilizando la forma actual de [utils/groq-client.js](../utils/groq-client.js). Ademas se deja un adaptador nativo por proveedor no compatible (p.ej. Anthropic Messages API, esquema distinto) con normalizacion de respuesta propia.
3. **Cifrado en reposo obligatorio.** La clave nunca se persiste en claro: AES-256-GCM con secreto de entorno. Nunca se devuelve al cliente en claro (solo `provider`, `apiBase`, `model`, `keyLast4`, `isActive`).
4. **`llm_mode = 'none'` oculta el panel y las credenciales.** La gestion de credenciales (formulario + lista) solo es visible cuando el dataset usa LLM (`llm_mode != 'none'`). El backend tambien debe negar/ocultar de forma coherente: con `llm_mode = 'none'` el listado no expone credenciales aunque existieran. La credencial gobierna *que proveedor/clave* se usa; `llm_mode` decide *si* hay asistencia IA y, por tanto, *si* el panel aplica.
5. **Accion "check" por credencial.** Cada credencial puede probarse: el servidor llama al modelo con el prompt `Respond "I'm <model> and I am ready to work"` (sustituyendo `<model>` por el `model` de la credencial) usando la clave descifrada, y devuelve el texto recibido del modelo. La UI muestra ese texto en un **modal**. Nota tecnica: los clientes actuales devuelven JSON (`generateJson` con `response_format: json_object`); el check requiere texto libre, por lo que se añade un camino de generacion de texto (o se pide al modelo un JSON `{"reply":"..."}` y se extrae `reply`). Se mostrara el mensaje recibido tal cual.

---

## Estado Actual Relevante

### Base ya disponible

1. El cliente Groq ya acepta overrides por llamada `{ apiKey, apiBase, model, timeoutMs }` y cae a `config.groq.*` si faltan — [utils/groq-client.js:22-26](../utils/groq-client.js#L22). El "carril" de clave por llamada ya existe, pero hoy **nadie lo usa**.
2. El despachador centraliza la seleccion de cliente — [utils/llm-client.js:21-26](../utils/llm-client.js#L21).
3. Los datasets ya tienen metadato LLM por dataset (`llm_mode`) — [prisma/schema.prisma:26](../prisma/schema.prisma#L26), fijado en creacion en [services/datasets-service.js:643-657](../services/datasets-service.js#L643) y expuesto en el DTO en [services/datasets-service.js:627-631](../services/datasets-service.js#L627).
4. Existe autorizacion de admin de dataset reutilizable: `assertDatasetAdminPermission` — [services/datasets-permissions-service.js](../services/datasets-permissions-service.js), usada en [services/datasets-service.js:396](../services/datasets-service.js#L396).
5. El log de peticiones ya redacta campos sensibles — [middlewares/request-log-middleware.js:153-167](../middlewares/request-log-middleware.js#L153).
6. Las rutas REST de dataset estan centralizadas en [routes/datasets-api.js:34-45](../routes/datasets-api.js#L34) (todas tras `requireApiAuth`).

### Problemas reales que este bloque debe resolver

1. **No hay clave por dataset.** El unico consumidor LLM llama sin overrides: [domain/spanish/ollama-spanish-checker.js:28-31](../domain/spanish/ollama-spanish-checker.js#L28) (y los `checkBatch`/`proposeCorrectionsBatch` analogos), por lo que siempre se usa la clave global.
2. **El flujo `/check` no transporta `datasetId`.** El controlador construye el contexto solo con entryId/category/triples/englishSentences — [controllers/annotations-controller.js:204-220](../controllers/annotations-controller.js#L204) — y `checkSentences` no recibe dataset — [services/annotations-service.js:67-91](../services/annotations-service.js#L67). Sin `datasetId` el sistema no puede resolver "que clave usar".
3. **`/check` esta autenticado pero no valida acceso al dataset** (`requireApiAuth` en [routes/annotations-api.js:25-27](../routes/annotations-api.js#L25), y `check` no resuelve `userId` ni comprueba acceso). Si se añade `datasetId`, hay que validar que el usuario tiene acceso a ese dataset antes de cargar/usar su credencial.
4. **No existe ni persistencia, ni capa de cifrado, ni endpoints** para credenciales.
5. **Despachador acoplado a config global**: [utils/llm-client.js:21-26](../utils/llm-client.js#L21) decide proveedor solo por `config.model`; no sabe enrutar por una credencial concreta.

---

## Objetivos Del Bloque

1. El admin de un dataset puede dar de alta, listar (enmascarada), activar y borrar credenciales LLM de su dataset; no puede hacerlo quien no es admin del dataset.
2. La validacion IA de un dataset con credencial activa usa esa credencial y proveedor; si no hay credencial activa, se mantiene el comportamiento global actual (sin regresion).
3. La clave se almacena cifrada (AES-256-GCM) y nunca sale al cliente ni a los logs en claro.
4. Soporte de proveedor generico OpenAI-compatible y, como minimo, un adaptador nativo de ejemplo (Anthropic) verificable.
5. Cobertura de tests: cifrado (round-trip + deteccion de manipulacion), repositorio (unicidad y activacion exclusiva), servicio (autorizacion + enmascarado), despachador (seleccion por credencial), e integracion del flujo `/check`.

---

## Modelo De Datos Propuesto

Nuevo modelo en `prisma/schema.prisma` (aplicar con `npx prisma db push`; sin migraciones versionadas, BD de prototipado):

```prisma
model DatasetLlmCredential {
  id           Int      @id @default(autoincrement())
  datasetId    Int      @map("dataset_id")
  provider     String   @db.VarChar(40)            // 'groq' | 'openai-compatible' | 'anthropic' | ...
  apiBase      String?  @map("api_base") @db.VarChar(255)
  model        String   @db.VarChar(120)
  apiKeyCipher String   @map("api_key_cipher") @db.Text   // AES-256-GCM: iv:authTag:ciphertext (base64)
  keyLast4     String   @map("key_last4") @db.VarChar(8)  // ultimos 4 chars para mostrar enmascarada
  isActive     Boolean  @default(false) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(0)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.DateTime(0)

  dataset Dataset @relation(fields: [datasetId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@unique([datasetId, provider], map: "uq_dataset_llm_credentials_dataset_provider")
  @@index([datasetId], map: "idx_dataset_llm_credentials_dataset")
  @@map("dataset_llm_credentials")
}
```

Y en `model Dataset` añadir la relacion inversa: `llmCredentials DatasetLlmCredential[]`.

---

## Tareas

### T0 — Documentacion previa (US-31 + diseno tecnico)

**Alcance:** US-31

**Problema que resuelve:** dejar la regla de negocio y el contrato tecnico documentados antes de implementar (metodologia, paso 2).

**Archivos afectados:**
- `documentation/USER-STORIES.md` — añadir `US-31` (rol administrador del dataset) con criterios de aceptacion (alta/listado/activacion/borrado, solo admin, clave nunca visible).
- `documentation/TECHNICAL-DESIGN.md` — añadir el modelo `DatasetLlmCredential`, el contrato REST de credenciales, la abstraccion de proveedor y la precedencia "credencial de dataset > config global".

**Trabajo concreto:**
1. Redactar US-31 en ingles (convencion de USER-STORIES.md, DOCUMENTATION.md §5).
2. Documentar tabla, claves/constraints, endpoints y reglas en TECHNICAL-DESIGN.md en ingles.

**Condicion de verificacion:** US-31 y la seccion tecnica existen y describen el comportamiento que implementaran T1–T9.

**Dependencia:** ninguna (primera tras la validacion del enfoque).

---

### T1 — Modelo de datos `DatasetLlmCredential`

**Alcance:** US-31

**Problema que resuelve:** persistencia de credenciales por dataset (problema #4).

**Archivos afectados:**
- `prisma/schema.prisma` — nuevo modelo + relacion inversa en `Dataset`.
- (si aplica) `tests/db/db-schema-check.js` — incluir la nueva tabla en la comprobacion de schema.

**Trabajo concreto:**
1. Añadir el modelo del apartado "Modelo de datos propuesto".
2. `npx prisma db push` (preferentemente `docker compose exec app npx prisma db push`).
3. Regenerar cliente Prisma si procede.

**Condicion de verificacion:** la tabla `dataset_llm_credentials` existe con la unicidad `[dataset_id, provider]` y FK con `onDelete: Cascade`.

**Informacion para tests unitarios:**
- Borrar un dataset elimina sus credenciales en cascada.
- Insertar dos filas con el mismo `[dataset_id, provider]` falla por unicidad.

**Dependencia:** T0.

---

### T2 — Cifrado en reposo (`utils/secret-crypto.js`)

**Alcance:** US-31 (seguridad)

**Problema que resuelve:** las claves no pueden almacenarse en claro.

**Archivos afectados:**
- `utils/secret-crypto.js` — `encryptSecret(plain)` / `decryptSecret(cipher)` con AES-256-GCM (formato `iv:authTag:ciphertext` en base64).
- `config.js` — leer `CREDENTIALS_ENCRYPTION_KEY` (32 bytes). Recomendacion: derivar la clave con `scrypt` desde `CREDENTIALS_ENCRYPTION_KEY` (o, en su defecto, desde `SESSION_SECRET`) para no exigir formato exacto de 32 bytes.
- `.env.example` — documentar `CREDENTIALS_ENCRYPTION_KEY`.

**Trabajo concreto:**
1. Implementar cifrado/descifrado autenticado con `node:crypto`.
2. Si no hay secreto configurado, fallar de forma explicita al escribir credenciales (no cifrar con secreto efimero, que invalidaria datos tras reinicio).

**Condicion de verificacion:** `decryptSecret(encryptSecret(x)) === x` y un texto cifrado manipulado lanza error.

**Informacion para tests unitarios:**
- Round-trip con caracteres unicode y cadenas largas.
- Manipular un byte del ciphertext/authTag debe lanzar (GCM).
- Ausencia de secreto -> error claro.

**Dependencia:** ninguna (puede ir en paralelo a T1).

---

### T3 — Repositorio `dataset-llm-credentials-repository.js`

**Alcance:** US-31

**Problema que resuelve:** acceso a datos de credenciales con la regla de "una activa".

**Archivos afectados:**
- `repositories/dataset-llm-credentials-repository.js` (nuevo).

**Trabajo concreto:**
1. `upsertByProvider({ datasetId, provider, apiBase, model, apiKeyCipher, keyLast4 })`.
2. `listByDataset(datasetId)` (devuelve metadatos, nunca el cipher al exterior).
3. `findActiveByDataset(datasetId)` (incluye `apiKeyCipher` para uso interno).
4. `setActive({ datasetId, provider })` dentro de `$transaction`: pone `is_active=false` al resto y `true` a la elegida.
5. `deleteByProvider({ datasetId, provider })`.

**Condicion de verificacion:** tras `setActive`, exactamente una fila del dataset queda activa.

**Informacion para tests unitarios:**
- Activar B desactiva A.
- `findActiveByDataset` sin activas devuelve null.
- `upsert` actualiza la fila existente sin duplicar.

**Dependencia:** T1.

---

### T4 — Servicio `dataset-llm-credentials-service.js`

**Alcance:** US-31

**Problema que resuelve:** logica de negocio, autorizacion, cifrado y enmascarado.

**Archivos afectados:**
- `services/dataset-llm-credentials-service.js` (nuevo).
- `contracts/dto-mappers.js` — mapper de credencial enmascarada (`{ provider, apiBase, model, keyLast4, isActive }`).

**Trabajo concreto:**
1. Toda operacion de escritura/listado exige admin del dataset via `assertDatasetAdminPermission`.
2. Al guardar: validar `provider`/`apiBase`/`model`, cifrar la clave (T2), calcular `keyLast4`.
3. Al listar/responder: devolver solo DTO enmascarado, nunca cipher ni clave.
4. `resolveActiveProviderConfig(datasetId)` (uso interno del flujo de anotacion): descifra y devuelve `{ provider, apiBase, model, apiKey }` o `null`. Con `llm_mode = 'none'` devuelve `null` (no se usa credencial aunque exista).
5. `listForAdmin(datasetId)`: con `llm_mode = 'none'` devuelve lista vacia (coherencia con el ocultado del panel, Decision 4); en otro caso, DTOs enmascarados.
6. `checkCredential({ datasetId, provider })`: descifra la credencial, llama al modelo con el prompt `Respond "I'm <model> and I am ready to work"` (sustituyendo `<model>` por `credential.model`) y devuelve `{ ok, message }` con el texto recibido del modelo (sin persistir nada). Errores de red/clave -> `{ ok:false, error }` sin filtrar la clave.

**Condicion de verificacion:** un no-admin recibe error de permisos; el DTO devuelto jamas contiene la clave.

**Informacion para tests unitarios:**
- No-admin -> ServiceError de autorizacion.
- DTO sin campos de clave en claro/cipher.
- `resolveActiveProviderConfig` descifra correctamente; sin activa devuelve null.
- Con `llm_mode = 'none'`: `listForAdmin` devuelve `[]` y `resolveActiveProviderConfig` devuelve `null` aunque existan filas.
- `checkCredential` con mock del cliente devuelve `{ ok:true, message }`; ante error del proveedor devuelve `{ ok:false, error }` sin exponer la clave.

**Dependencia:** T2, T3, T5 (para `checkCredential`).

---

### T5 — Abstraccion de proveedor (despachador + cliente generico + adaptador nativo)

**Alcance:** US-31

**Problema que resuelve:** enrutar por credencial concreta, no solo por config global (problema #5).

**Archivos afectados:**
- `utils/llm-client.js` — aceptar `providerConfig` explicito en `generateJson(options)`; si viene, enrutar por `providerConfig.provider`; si no, mantener el comportamiento global actual (sin regresion).
- `utils/openai-compatible-client.js` — generalizacion de [utils/groq-client.js](../utils/groq-client.js) (Groq pasa a ser un caso de `apiBase`+`model`). Conservar `groq-client.js` como alias/config por defecto o migrar sus usos.
- `utils/anthropic-client.js` (nuevo) — adaptador nativo Messages API con normalizacion de respuesta a JSON.

**Trabajo concreto:**
1. Definir el contrato `providerConfig = { provider, apiBase, model, apiKey, timeoutMs? }`.
2. Mapa `provider -> cliente`: `openai-compatible`/`groq` -> generico; `anthropic` -> nativo; `local`/`ollama` -> ollama.
3. Normalizar todas las respuestas a JSON ya parseado (como hoy con `extractJsonPayload`) para el flujo de validacion.
4. Añadir un camino de **texto libre** para el "check" (Decision 5): `generateText({ providerConfig, system?, prompt })` que devuelve el texto crudo del modelo, sin forzar `response_format: json_object`. Cada cliente (generico, anthropic, ollama) implementa su normalizacion a texto.

**Condicion de verificacion:** con `providerConfig` de proveedor X se llama al cliente X; sin `providerConfig` se respeta `config.model`.

**Informacion para tests unitarios:**
- Despacho por `provider` (mock de fetch por cliente).
- Fallback a global cuando no hay `providerConfig`.
- Anthropic: respuesta nativa -> JSON normalizado equivalente.
- `generateText` devuelve el texto crudo del modelo (no JSON) para el check.

**Dependencia:** T2 (para nada directo) / independiente de T3-T4; recomendable tras T0. Puede ir en paralelo a T3/T4.

---

### T6 — Propagacion de `datasetId` y credencial activa por el flujo `/check`

**Alcance:** US-31

**Problema que resuelve:** llevar la credencial del dataset hasta la llamada LLM (problemas #1, #2, #3).

**Archivos afectados:**
- `controllers/annotations-controller.js` — aceptar `datasetId` en el body de `/check`; resolver `userId`; validar acceso del usuario al dataset antes de usar su clave.
- `contracts/dto-mappers.js` — `normalizeIncomingEntryContext` admite/propaga `datasetId`.
- `services/annotations-service.js` — `checkSentences` resuelve `providerConfig` activa via servicio de credenciales (inyectado como dependencia) y lo pasa en el `context` a `spanishService`.
- `domain/spanish/spanish-service.js` — propaga `context.providerConfig` al `semanticChecker`.
- `domain/spanish/ollama-spanish-checker.js` — pasa `providerConfig` a `llm-client.generateJson` en `check`/`checkBatch`/`proposeCorrectionsBatch`.

**Trabajo concreto:**
1. Validar acceso al dataset (reutilizar el control de dataset accesible) para el `datasetId` recibido.
2. Resolver credencial activa; si no hay, no pasar `providerConfig` (comportamiento global, sin regresion).
3. Inyectar `providerConfig` por el contexto hasta el cliente.

**Condicion de verificacion:** un dataset con credencial activa de proveedor X hace que `/check` llame a X con esa clave; sin credencial usa el proveedor global.

**Informacion para tests unitarios:**
- `checkSentences` con credencial activa inyecta `providerConfig`.
- Sin credencial -> sin `providerConfig`.
- `datasetId` de dataset no accesible -> rechazo (no se usa la clave).

**Dependencia:** T4, T5.

---

### T7 — Controlador + rutas REST de credenciales

**Alcance:** US-31

**Problema que resuelve:** superficie HTTP para administrar credenciales.

**Archivos afectados:**
- `controllers/datasets-controller.js` (o nuevo `dataset-llm-credentials-controller.js`).
- `routes/datasets-api.js` — montar endpoints bajo `/:id/llm-credentials`.

**Trabajo concreto (endpoints, todos admin del dataset):**
1. `GET    /api/datasets/:id/llm-credentials` — lista enmascarada.
2. `POST   /api/datasets/:id/llm-credentials` — alta/actualizacion de proveedor (`provider`, `apiBase?`, `model`, `apiKey`).
3. `PATCH  /api/datasets/:id/llm-credentials/:provider/activate` — marcar activa.
4. `DELETE /api/datasets/:id/llm-credentials/:provider` — borrar.
5. `POST   /api/datasets/:id/llm-credentials/:provider/check` — accion "check" (Decision 5): el servidor llama al modelo con `Respond "I'm <model> and I am ready to work"` y devuelve `{ ok, message }` con el texto recibido (para mostrar en modal). No expone la clave.

Nota de coherencia con Decision 4: con `llm_mode = 'none'`, `GET` devuelve lista vacia y las operaciones de escritura/`check` se rechazan (el panel no aplica).

**Condicion de verificacion:** las operaciones funcionan para un admin y devuelven error de permiso para no-admin; `check` devuelve el mensaje del modelo; ninguna respuesta contiene la clave.

**Informacion para tests unitarios:**
- Cada endpoint con admin (200/201) y con no-admin (error).
- Body sin `apiKey` -> invalid payload.
- `check` con cliente mockeado -> `{ ok:true, message:"I'm <model> and I am ready to work"}` (o el texto que devuelva el modelo).
- Con `llm_mode = 'none'` -> `GET` lista vacia; escritura/`check` rechazadas.

**Dependencia:** T4.

---

### T8 — Endurecimiento de seguridad transversal

**Alcance:** US-31 (seguridad)

**Problema que resuelve:** evitar fugas de la clave por logs o mensajes de error.

**Archivos afectados:**
- `middlewares/request-log-middleware.js:157` — añadir `apikey`, `api_key`, `apibase`(no), `key`, `credential` a la lista `sensitive` (cuidando no enmascarar campos legitimos como `keyLast4`; usar coincidencia controlada).
- Revisar mensajes de error de los nuevos clientes/servicios para no incluir la clave.

**Condicion de verificacion:** un `POST` con `apiKey` aparece como `[REDACTED]` en el log; ningun error eco de la clave.

**Informacion para tests unitarios:**
- `sanitizePayload({ apiKey: 'x' })` -> redactado; `{ keyLast4: 'abcd' }` -> no redactado.

**Dependencia:** T7 (o en paralelo).

---

### T9 — UI de administracion (gestion de credenciales)

**Alcance:** US-31 (front)

**Problema que resuelve:** que el admin opere las credenciales desde la pagina de administracion del dataset.

**Archivos afectados:**
- `public/js/dataset-admin.js` y su HTML/seccion correspondiente — formulario de alta, lista enmascarada, seleccion de activa, borrado, boton "check" y modal de resultado.
- `front-mocks/` — mock de las acciones si procede para pruebas de front.

**Trabajo concreto:**
1. Seccion "Credenciales de IA" visible solo a admins del dataset.
2. **Ocultar el panel completo cuando `Uso de LLMs` = `Ninguna` (`llm_mode = 'none'`)**: ni formulario de alta ni la lista de credenciales existentes. Aplicar el ocultado de forma defensiva aunque hoy no exista escenario real (opciones fijas en creacion); si hipoteticamente hubiera credenciales con `llm_mode = 'none'`, tampoco se muestran.
3. Mostrar clave siempre enmascarada (`••••last4`).
4. Cada credencial de la lista tiene un boton **"check"** que llama a `POST .../:provider/check` y muestra el texto recibido del modelo en un **modal** (exito o error).

**Condicion de verificacion:** con `llm_mode != 'none'` el admin gestiona credenciales y el boton "check" abre un modal con la respuesta del modelo; con `llm_mode = 'none'` el panel y las credenciales no aparecen; la clave nunca se muestra completa.

**Dependencia:** T7.

---

### T10 — Verificacion: tests de integracion

**Alcance:** cierre del bloque (ver seccion dedicada).

**Dependencia:** T6, T7, T8 (y T9 si entra en alcance).

---

## Orden De Ejecucion Recomendado

```text
T0 -> T1 -> (T2 ∥ ...) -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 (integracion)
```

T2 y T5 pueden adelantarse en paralelo a T1/T3 porque no dependen del schema.

---

## Verificacion: Tests De Integracion

Tarea de cierre. Se ejecuta cuando pasan todos los unitarios previos.

### Escenario 1 — La credencial del dataset gobierna `/check`

1. Crear dataset y registrar credencial proveedor `groq` (clave ficticia) como activa.
2. Hacer `POST /api/annotations/check` con `datasetId` del dataset (mockeando fetch del cliente generico).
3. Verificar que se llamo al cliente OpenAI-compatible con esa `apiBase`/`model` y la clave descifrada.

### Escenario 2 — Sin credencial activa no hay regresion

1. Dataset sin credenciales.
2. `POST /check` -> se usa el proveedor global (`config.model`), como hoy.

### Escenario 3 — Activacion exclusiva y proveedor nativo

1. Registrar `groq` y `anthropic`; activar `anthropic`.
2. `POST /check` -> se invoca el adaptador nativo Anthropic y se normaliza la respuesta.
3. Verificar que `groq` quedo inactiva.

### Escenario 4 — Seguridad

1. Listar credenciales -> respuesta enmascarada, sin clave ni cipher.
2. No-admin intenta crear/activar/borrar -> error de permisos.
3. El log de la peticion de alta muestra `apiKey` como `[REDACTED]`.

### Escenario 5 — Accion "check"

1. Registrar una credencial y llamar a `POST .../:provider/check` (mock del cliente devolviendo `I'm <model> and I am ready to work`).
2. Verificar que el servidor llamo al modelo con el prompt `Respond "I'm <model> and I am ready to work"` usando la clave descifrada.
3. Verificar que la respuesta incluye el texto del modelo (que el front mostraria en el modal).

### Escenario 6 — `Uso de LLMs = Ninguna` oculta credenciales

1. Dataset con `llm_mode = 'none'` (e, hipoteticamente, una fila de credencial existente).
2. `GET /api/datasets/:id/llm-credentials` -> lista vacia.
3. `resolveActiveProviderConfig` -> null (no se usa clave aunque exista); las operaciones de escritura/`check` se rechazan.

---

## Definition Of Done Del Bloque

- [ ] US-31 documentada en `USER-STORIES.md` y diseno tecnico en `TECHNICAL-DESIGN.md`.
- [ ] Tabla `dataset_llm_credentials` aplicada via `prisma db push`.
- [ ] Claves cifradas (AES-256-GCM); ninguna ruta/log/DTO expone la clave en claro.
- [ ] CRUD de credenciales restringido a admins del dataset.
- [ ] `/check` usa la credencial activa del dataset; sin credencial mantiene el comportamiento global.
- [ ] Proveedor generico OpenAI-compatible + adaptador nativo (Anthropic) operativos.
- [ ] Con `llm_mode = 'none'` el panel y las credenciales no aparecen (front + backend coherentes).
- [ ] La accion "check" devuelve el mensaje del modelo y se muestra en un modal.
- [ ] Todos los tests unitarios de T1–T9 pasan.
- [ ] Todos los escenarios de integracion pasan.

---

## Riesgos Y Puntos Debiles Del Enfoque

| Riesgo / punto debil                                                                                 | Probabilidad | Impacto | Mitigacion                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------- |
| Gestion del secreto de cifrado: si se pierde/rota `CREDENTIALS_ENCRYPTION_KEY`, las claves quedan ilegibles. | Media        | Alto    | Documentar el secreto como obligatorio y estable; fallar explicitamente si falta; no usar secreto efimero. |
| Fuga de la clave por logs/errores/respuestas.                                                        | Media        | Alto    | T8 + revision de mensajes; DTO enmascarado; tests de seguridad (Escenario 4).                      |
| `/check` hoy no valida acceso al dataset; añadir `datasetId` sin validar permitiria usar la clave de un dataset ajeno. | Media        | Alto    | T6 valida acceso del usuario al `datasetId` antes de resolver/usar la credencial.                  |
| Adaptadores nativos (Anthropic) tienen esquema distinto; mas superficie de fallo que el generico.    | Media        | Medio   | Normalizar a JSON como el resto; tests por adaptador; empezar por generico y un solo nativo de ejemplo. |
| Interaccion con `llm_mode` y la credencial. | Media        | Medio   | **Resuelto (Decision 4):** `llm_mode = 'none'` oculta el panel y las credenciales (front + backend); la credencial decide *que proveedor*, `llm_mode` decide *si* hay IA. |
| El "check" necesita texto libre, pero la infra es JSON-only (`response_format: json_object`). | Media        | Bajo    | T5 añade `generateText`; alternativamente pedir `{"reply":"..."}` y extraer. Se muestra el texto recibido tal cual. |
| Regresion en el flujo de anotacion al tocar la cadena `controller -> service -> domain -> client`.   | Baja         | Alto    | Mantener `providerConfig` opcional; ruta sin credencial = comportamiento actual; tests de no-regresion (Escenario 2). |
| `groq-client.js` esta referenciado por nombre; generalizarlo puede romper imports/tests.             | Baja         | Medio   | Conservar `groq-client.js` como envoltura/alias o actualizar todos los usos y sus tests en T5.     |
| Coste/latencia del `testCredential` opcional contra el proveedor real.                               | Baja         | Bajo    | Hacerlo opcional y bajo demanda; no bloquear el alta si el usuario no lo pide.                     |

### Preguntas abiertas para la validacion

1. ~~**`llm_mode` vs credencial.**~~ **Resuelto (Decision 4):** `llm_mode = 'none'` oculta panel y credenciales; en otro caso aplican. Pendiente menor: ¿`generation`/`correction` se tratan igual a efectos del panel (ambos muestran credenciales)? Asumido que si.
2. ~~**`testCredential`.**~~ **Resuelto (Decision 5):** boton "check" por credencial -> prompt `Respond "I'm <model> and I am ready to work"` -> respuesta en modal.
3. **Alcance del front (T9):** ¿entra en este bloque o se planifica aparte? Backend (T1–T8) es autosuficiente y testeable sin UI. (El "check" y el ocultado por `llm_mode` requieren front para verse de extremo a extremo.)
4. **Proveedor nativo de ejemplo:** se asume Anthropic. ¿Correcto, u otro?
