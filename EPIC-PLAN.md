# EPIC-PLAN — E0: Estabilizacion Del Nucleo Y Arquitectura Transversal

Fecha: 2026-04-22

Fuentes usadas:
- `US-PLAN.md` — planificacion de historias de usuario y desglose de E0.
- `US-COBERTURA-1.md` — auditoria funcional del estado actual.
- `documentation/user_stories.txt` — historias de usuario originales.

---

## Resumen Del Bloque

| Campo | Valor |
| --- | --- |
| Bloque | E0 |
| Nombre | Estabilizacion del nucleo y arquitectura transversal |
| Prioridad | P0 |
| Dependencias de entrada | Ninguna |
| Dependencias de salida | E1, E2 |
| Tareas comunes activadas | C1, C6 |

---

## US Incluidas

| US | Titulo | Estado actual |
| --- | --- | --- |
| US-01 | Login, registro y sesion | Cubierta |
| US-02 | Listado de datasets | Cubierta |
| US-03 (base) | Visualizacion de triples y secciones | Parcial — depende de `DEBUG` |
| US-05 (base) | Escritura de anotaciones | Parcial — `send` puenteado por `DEBUG` |
| US-06 (base) | Escritura a partir del ingles | Parcial — flujo real en `DEBUG` |
| US-19 (base) | Subida de datasets | Parcial — sin restriccion de rol |

Nota: US-03, US-05, US-06 y US-19 se consolidan aqui solo en sus bases (quitar `DEBUG`, fijar DTOs, asegurar rutas); su cierre funcional completo corresponde a E2 y E5.

---

## Estado Actual Relevante

Problemas identificados en auditoria que este bloque debe resolver:

1. `public/js/annotations.js:9` — variable `DEBUG = true` hace que el front cargue datos mock en lugar de consumir la API real.
2. `public/js/dataset-view.js:4` — mismo patron de `DEBUG` en la vista XML de dataset.
3. No existe un DTO canonico compartido entre front y backend para las entidades nucleares (`DatasetList`, `DatasetSection`, `EntryContext`, `SentenceValidation`, `SavedAnnotation`).
4. La navegacion entre `/tasks`, `/datasets/:id/view` y `/annotations` no esta auditada ni documentada como contrato estable.
5. El modelo de sesion (`User.toSession()` o equivalente) no contempla claims de rol para los siguientes bloques.
6. La ruta de subida de datasets (`routes/datasets-api.js:14-20`) no esta protegida por rol administrador.

---

## Objetivos Del Bloque

1. Eliminar la dependencia funcional de `DEBUG` en las pantallas nucleares.
2. Definir y congelar los contratos de API antes de que crezca la funcionalidad.
3. Dejar la sesion preparada para incorporar roles en E1.

---

## Tareas

Las tareas se ordenan en orden de ejecucion recomendado. Cada tarea es independiente del resto salvo donde se indica una dependencia explicita.

---

### T0.1 — Externalizar DEBUG a variable de entorno

**Alcance:** C1

**Problema que resuelve:** `public/js/annotations.js:9` y `public/js/dataset-view.js:4` tienen `DEBUG = true` como constante fija. Eso hace que en cualquier despliegue el front use datos mock, ignorando el backend real.

**Archivos afectados:**
- `public/js/annotations.js` — linea 9 y cualquier bloque `if (DEBUG)`
- `public/js/dataset-view.js` — lineas 4-6 y cualquier bloque `if (DEBUG)`
- `config.js` — añadir clave `debugMode` leida de `process.env.DEBUG_MODE`
- `app.js` — exponer `debugMode` al front via variable de template o endpoint de config

**Trabajo concreto:**
1. Leer `process.env.DEBUG_MODE` en `config.js` y exportarla.
2. Pasar ese valor al front desde el servidor (variable de template o endpoint `/api/config`).
3. En `public/js/annotations.js`, sustituir la constante `DEBUG` por el valor recibido del servidor.
4. En `public/js/dataset-view.js`, mismo cambio.
5. Añadir `DEBUG_MODE=false` al fichero `.env` de produccion (o al ejemplo `.env.example`).
6. Mantener un modo demo funcional: si `DEBUG_MODE=true`, los mocks siguen disponibles, pero el modo real debe funcionar cuando `DEBUG_MODE=false`.

**Condicion de verificacion:** Con `DEBUG_MODE=false`, las pantallas de anotacion y vista XML llaman a los endpoints reales y no cargan datos estaticos.

---

### T0.2 — Definir DTOs canonicos

**Alcance:** C6

**Problema que resuelve:** No existe un contrato explicito entre front y backend para las entidades que se intercambian en el flujo nuclear. Esto genera acoplamientos fragiles que se rompen al crecer la funcionalidad en E2 y E3.

**Archivos afectados:**
- `business/datasets-controller.js` — respuestas de listado y seccion de dataset
- `business/annotations-controller.js` — respuesta de contexto de entry y de guardado
- `services/datasets-service.js` — salida de `getDatasetSections`, `getSectionEntries`
- `services/annotations-service.js` — salida de validacion y guardado

**DTOs a definir (como objetos JS documentados o schemas JSON):**

| DTO | Campos minimos | Origen actual |
| --- | --- | --- |
| `DatasetList` | `id`, `name`, `totalEntries`, `completedPercent`, `remainPercent` | `services/datasets-service.js:36-52` |
| `DatasetSection` | `sectionIndex`, `totalEntries`, `entries[]` | `services/datasets-service.js:54-92` |
| `EntryContext` | `entryId`, `triples[]`, `englishSentences[]`, `sectionIndex` | `services/datasets-service.js:54-103` |
| `SentenceValidation` | `sentence`, `isValid`, `alerts[]`, `rejectionReasons[]` | `services/annotations-service.js:10-23` |
| `SavedAnnotation` | `entryId`, `sentences[]`, `savedAt` | `repositories/annotations-repository.js:10-53` |

**Trabajo concreto:**
1. Crear fichero `contracts/dtos.js` (o equivalente) con la definicion de cada DTO como objeto de referencia o schema.
2. Revisar que `business/datasets-controller.js` y `business/annotations-controller.js` devuelven estructuras alineadas con esos DTOs.
3. Asegurar que `public/js/annotations.js` y `public/js/dataset-view.js` consumen exactamente esas formas cuando `DEBUG_MODE=false`.
4. Documentar en cada DTO los campos opcionales vs obligatorios.

**Condicion de verificacion:** Un cambio en la forma interna del servicio no requiere modificar el front si el controlador respeta el DTO.

**Dependencia:** T0.1 debe estar completa antes de verificar que el front consume los DTOs reales.

---

### T0.3 — Auditar y estabilizar la navegacion entre rutas nucleares

**Alcance:** C6 (parcial)

**Problema que resuelve:** El flujo `/tasks` → `/datasets/:id/view` → `/annotations` no esta documentado ni verificado como contrato estable. Si alguna transicion falla, el anotador queda bloqueado antes de llegar a anotar.

**Archivos afectados:**
- `app.js:52-58` — mapa de rutas
- `routes/users.js`, `routes/datasets-api.js`, `routes/annotations-api.js`
- `public/js/datasets.js:250-314` — navegacion desde listado de datasets
- `public/js/annotations.js` — navegacion interna de la vista de anotacion

**Trabajo concreto:**
1. Trazar el flujo completo: login → listado → seleccion de dataset → vista de seccion → anotacion → guardado → siguiente entry.
2. Verificar que cada paso tiene ruta en `app.js` y controlador funcional.
3. Identificar y documentar los parametros de URL que se pasan entre pantallas (`datasetId`, `sectionIndex`, `entryId`).
4. Corregir cualquier enlace roto o parametro que se pierde entre pantallas.
5. Asegurar que el boton "volver" en la vista de anotacion devuelve al listado correcto, no a un estado inconsistente.

**Condicion de verificacion:** Un anotador puede recorrer el flujo completo sin error ni pantalla en blanco.

---

### T0.4 — Preparar sesion para claims de rol

**Alcance:** C2 (prerequisito minimo, no implementacion completa)

**Problema que resuelve:** El objeto de sesion actual solo contiene `userId` y datos basicos. En E1 se añadiran roles. Si la sesion no esta preparada, añadir roles en E1 requerira cambios retroactivos en todos los middlewares y vistas.

**Archivos afectados:**
- `business/users-controller.js:8-59` — construccion de la sesion tras login
- `services/users-service.js:14-58` — logica de autenticacion y datos de usuario
- `middlewares/auth.js:5-26` — lectura de sesion en rutas protegidas
- `prisma/schema.prisma:40-46` — modelo `User`

**Trabajo concreto:**
1. Revisar que la sesion almacena al menos `userId`, `email` y un campo `role` (puede ser `null` o `'annotator'` por defecto ahora).
2. Añadir al modelo `User` en `prisma/schema.prisma` un campo `role` de tipo `String` con valor por defecto `'annotator'`.
3. Modificar `business/users-controller.js` para incluir `role` en la sesion tras login.
4. Modificar `middlewares/auth.js` para exponer `req.user.role` aunque hoy no se use para autorizar.
5. No implementar logica de autorizacion por rol todavia — eso es E1. Solo asegurar que el campo esta disponible.

**Condicion de verificacion:** Tras login, `req.session.user.role` existe y vale `'annotator'` por defecto. El cambio no rompe tests existentes de sesion.

---

### T0.5 — Alinear mensajes de error entre front y backend

**Alcance:** C6 (parcial)

**Problema que resuelve:** Si front y backend no usan la misma estructura de error, los errores de API aparecen como fallos silenciosos o mensajes incomprensibles en la UI.

**Archivos afectados:**
- `business/datasets-controller.js` — respuestas de error
- `business/annotations-controller.js` — respuestas de error
- `business/users-controller.js` — respuestas de error
- `public/js/annotations.js` — manejo de errores de fetch
- `public/js/datasets.js` — manejo de errores de fetch

**Estructura de error a unificar:**
```json
{ "error": true, "message": "descripcion legible", "code": "CODIGO_OPCIONAL" }
```

**Trabajo concreto:**
1. Revisar los controladores y asegurar que todos los errores devuelven la misma estructura.
2. Revisar los fetch del front y asegurar que muestran el `message` recibido, no un texto generico.
3. No añadir nuevos codigos de error ahora — solo asegurar que la estructura es consistente.

**Condicion de verificacion:** Un error de validacion en el backend se muestra como texto legible en el front, no como `[object Object]` ni silencio.

---

## Orden De Ejecucion Recomendado

```
T0.1 → T0.2 → T0.3 → T0.4 → T0.5
```

T0.1 primero porque desbloquea la verificacion del flujo real. T0.4 no depende de T0.1 pero conviene hacerla antes de E1 para no retrabajo. T0.5 puede hacerse en paralelo con T0.3 y T0.4.

---

## Definition Of Done Del Bloque

- [ ] Con `DEBUG_MODE=false`, las pantallas de anotacion y vista XML cargan datos reales desde el backend.
- [ ] Existe un fichero de contratos de DTOs que define las formas de las entidades nucleares.
- [ ] Los controladores devuelven estructuras alineadas con esos DTOs.
- [ ] El flujo login → listado → anotacion → guardado funciona sin error ni pantalla en blanco.
- [ ] `req.session.user.role` existe tras login y no rompe tests existentes.
- [ ] Los errores de API muestran mensajes legibles en el front.
- [ ] Las APIs canonicas estan estables y documentadas para que E1 y E2 las usen sin retrabajo.

---

## Riesgos Del Bloque

| Riesgo | Probabilidad | Impacto | Mitigacion |
| --- | --- | --- | --- |
| Los mocks del front estan tan entrelazados con la logica que eliminar `DEBUG` rompe la UI completa | Media | Alto | Revisar todos los bloques `if (DEBUG)` antes de tocar; el modo demo debe seguir disponible |
| El backend no devuelve datos completos cuando `DEBUG=false` porque la DB de desarrollo esta vacia | Media | Medio | Tener al menos un dataset de prueba importado antes de verificar T0.1 |
| Añadir `role` al schema de Prisma requiere migracion que afecta a datos existentes | Baja | Medio | Usar valor por defecto en la migracion para no perder datos |
| Los tests existentes fallan si se cambia la estructura de sesion | Media | Medio | Ejecutar tests tras T0.4 y corregir antes de avanzar |
