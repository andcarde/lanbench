# DOCUMENTATION.md — Documentation map

Meta-index for `lanbench`. Lists every documentation type the project uses, where each lives, when it is created or updated, and — for numbered audits and plans — the skeletal template an agent must follow when producing a new instance. The structural templates are provided here so that future agents do not need to read a concrete prior file (e.g. `AUDITORY-3.md`, `EPIC-2-PLAN.md`) which may contain deprecated references or already-closed tasks.

## 1. Folder layout

| Folder            | Holds                                                                   | Stability                          |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `documentation/`  | Product reference (what the system is and how it is built)              | Stable; edited in place            |
| `doc-planning/`   | Audits, coverage reports, planning artefacts                            | Numbered snapshots; never rewrite history |
| `doc-agents/`     | Agent-facing prompts and working methodology                            | Stable; edited in place            |
| project root      | `CLAUDE.md`, `DOCUMENTATION.md`                                         | Entry points                       |

## 2. Document catalogue

### 2.1 `USER-STORIES.md`

- **Path:** `documentation/USER-STORIES.md`
- **Type:** functional reference. Source of truth for what the product does and for whom.
- **Contents:** project purpose, scope, roles, user stories with acceptance criteria, dependency relationships.
- **Update policy:** edit in place when functionality changes. Not numbered.

### 2.2 `TECHNICAL-DESIGN.md`

- **Path:** `documentation/TECHNICAL-DESIGN.md`
- **Type:** technical reference. Complements `USER-STORIES.md` with the *how*.
- **Contents:** data model (mirroring `prisma/schema.prisma`), keys and constraints, internal procedures (active sessions, section assignment, annotation/review flow), API names and conventions, layering.
- **Update policy:** edit in place after schema, API surface or architecture changes. Not numbered. The canonical source for the data model is always `prisma/schema.prisma`.

### 2.3 `AUDITORY-<n>.md`

- **Path:** `doc-planning/AUDITORY-<n>.md`
- **Type:** non-functional audit snapshot.
- **Contents:** bugs, code smells, architecture deviations, duplication, low cohesion, high coupling, unused vars/functions/classes/files, library deprecation, style inconsistency, redundant libraries.
- **Numbering:** `<n>` is the next free positive integer. If `AUDITORY-1..k` exist, the new file is `AUDITORY-(k+1).md`. Never overwrite an earlier audit.
- **Baseline:** if a previous audit exists, list its mitigated findings up front and do not repeat them.
- **Template:** see §3.

### 2.4 `US-COBERTURA-<n>.md`

- **Path:** `doc-planning/US-COBERTURA-<n>.md`
- **Type:** functional coverage audit.
- **Contents:** for each user story, whether it is covered, partial or missing; coverage by layer (front, routes, controllers, services, repositories, integration); test coverage.
- **Numbering:** same incremental rule as `AUDITORY-<n>.md`.

### 2.5 `US-PLAN.md`

- **Path:** `doc-planning/US-PLAN.md`
- **Type:** top-level plan covering the whole user-story catalogue.
- **Contents:** epic blocks (E0..En), the user stories inside each, strong/soft dependencies between stories, cross-cutting common tasks, recommended execution order.
- **Output:** each epic block becomes one `EPIC-<n>-PLAN.md`.
- **Update policy:** replace when re-planning. Single file.

### 2.6 `EPIC-<n>-PLAN.md`

- **Path:** `doc-planning/EPIC-<n>-PLAN.md`
- **Type:** implementation plan for one epic block.
- **Contents:** the tasks `T<n>.<m>` needed to close the block, their order, dependencies, acceptance criteria, integration test scenarios.
- **Numbering:** `<n>` matches the epic number defined in `US-PLAN.md`.
- **Template:** see §4.

### 2.7 `TASK-PLAN.md`

- **Path:** `doc-planning/TASK-PLAN.md`
- **Type:** example decomposition of one task into subtasks `ST<n>.<m>.<k>` — the minimal execution unit.
- **Status:** single reference file, not a per-task artefact. Used as a template when subtask-level planning is needed.

### 2.8 `MASTER-PLAN.md`

- **Path:** `doc-planning/MASTER-PLAN.md`
- **Type:** strategic notes for closing the project (TFM).
- **Update policy:** edit in place. Single file.

### 2.9 `PROMPT.md`

- **Path:** `doc-agents/PROMPT.md`
- **Type:** refined order templates that can be given verbatim to an agent (code review, documentation generation, architectural analysis, coverage analysis, vulnerability analysis, mitigation of audit findings, etc.).
- **Update policy:** append new refined prompts when a reusable pattern emerges.

### 2.10 `METHODOLOGY.md`

- **Path:** `doc-agents/METHODOLOGY.md`
- **Type:** example prompt showing how a user story is sliced into tasks and subtasks following `CLAUDE.md`.
- **Status:** example. Not the canonical methodology — the canonical methodology lives in `CLAUDE.md` at the project root.

### 2.11 `CLAUDE.md`

- **Path:** project root.
- **Type:** collaboration rules every agent in the repo must follow. Defines the step-by-step development methodology, the Docker workflow, and the incident-mitigation methodology.

### 2.12 `DOCUMENTATION.md` (this file)

- **Path:** project root.
- **Type:** meta-index. Self-referential: this file is also catalogued in §2.12.
- **Update policy:** edit when a new documentation type is introduced or when a numbered template changes its skeleton.

---

## 3. Template — `AUDITORY-<n>.md`

The skeleton below is the minimal structure for a new audit. Replace `<n>`, dates, scope paths and example links before filling in real findings. Keep section numbering identical so cross-audit diffing stays cheap.

```markdown
# Architecture Audit — AUDITORY-<n>

**Date:** YYYY-MM-DD
**Auditor:** <model name and reasoning level>
**Scope:** application source code of `lanbench` (list excluded paths: `node_modules/`, `public/`, `views/`, `logs/`, `tmp/`, `test-datasets/`, `front-mocks/`, `tests/`).
**Previous baseline:** [`AUDITORY-<n-1>.md`](AUDITORY-<n-1>.md). The following previous findings are already mitigated and are NOT repeated here:
- <bullet per mitigated finding, citing file:line>

---

## 1. Architecture Identification

Short prose describing the actual topology observed (layered / hexagonal / microservices / monolith), followed by a code block sketching the layer flow:

```text
routes/*               (HTTP transport)
   ↓
controllers/*          (HTTP I/O adapters)
   ↓
services/*             (use cases)
   ↓
repositories/*         (persistence)
   ↓
prisma/client.js       (singleton)
domain/*               (pure domain logic)
entities/*             (DTOs)
utils/*                (helpers)
constants/*            (enums and codes)
middlewares/*          (cross-cutting)
```

### 1.1 Module cohesion

Table per top-level folder with three columns: `Module`, `Cohesion` (High / Medium-high / Medium / Medium-low / Low), `Observation` (one sentence pointing to concrete file:line evidence).

### 1.2 Coupling

Bullet list. Each bullet names a concrete coupling smell (cross-aggregate writes, dual export shapes, parallel pipelines, alias proliferation, etc.) and links to the offending file:line range.

### 1.3 Comparison with industry standards (SOLID + others)

Table with columns `Principle`, `Status` (✅ / ⚠️ / ❌), `Deviation` (concrete evidence). Cover at least: SRP, OCP, LSP, ISP, DIP, separation of concerns, DRY, modularity, error handling, observability, API contract consistency, documentation contracts.

---

## 2. Table of detected problems

One row per finding. Columns:

| # | Type | Scope | Description | Complexity | Minimum viable model |

- **Type:** Cohesion (SRP), Coupling, Duplicated code, Duplicated logic, Dead code/path, Dead dependency, Style, Inconsistency, Contract, Observability, DIP / dual graphs, OCP, Security, ... .
- **Scope:** `file <path>`, `function <name> in <path>`, `module exports in <path>:L<a>-L<b>`, etc. Always include a clickable `file:line` link.
- **Description:** what is wrong, why it is wrong, and a concrete split or fix candidate. Cite file:line evidence.
- **Complexity:** Minimal / Low / Medium / High / Very high / Critical.
- **Minimum viable model:** chosen against an explicit pool (e.g. Claude Sonnet 4.6 High, Claude Opus 4.7 High, Claude Opus 4.7 Very High). Pick the lowest power with estimated success rate ≥ 90% (or whichever threshold the engagement requires).

---

## 3. Justification for model assignment

Short prose justifying the assignments in §2 against the allowed pool. Group findings by chosen model; explain the criterion used (typically: lowest power with ≥ 90% success rate).

---

## 4. Executive summary

Three to six bullet points. State:

- progress relative to the previous baseline (what is now resolved),
- the dominant structural debts still present, grouped into a small number of themes,
- the cheap clean-up wins worth bundling in one pass,
- explicit absence of new security / DI / secrets issues if applicable.
```

## 4. Template — `EPIC-<n>-PLAN.md`

The skeleton below is the minimal structure for a new epic plan. Replace `<n>`, the block name, dates and references before filling in real tasks.

```markdown
# EPIC-<n>-PLAN — E<n>: <Block name in Title Case>

Fecha: YYYY-MM-DD

Fuentes usadas:
- `US-PLAN.md` — planificacion de historias de usuario y desglose de E<n>.
- `documentation/USER-STORIES.md` — detalle funcional consolidado.
- `EPIC-<n-1>-PLAN.md` — formato, granularidad y cierre esperado (si existe).
- estado real del repositorio a fecha de hoy.

---

## Introduccion

Uno o dos parrafos: que problema cierra el bloque, por que ahora, que metodologia de verificacion se aplica (tests unitarios por tarea + tests de integracion al cierre), nota de no-colision con otros bloques en curso si aplica.

---

## Resumen Del Bloque

| Campo                       | Valor                                                          |
| --------------------------- | -------------------------------------------------------------- |
| Bloque                      | E<n>                                                           |
| Nombre                      | <Block name>                                                   |
| Prioridad                   | P0 / P1 / P2                                                   |
| Dependencias de entrada     | <bloques previos>                                              |
| Dependencias recomendadas   | <bloques que mejoran el alcance pero no bloquean>              |
| Dependencias de salida      | <bloques que se desbloquean al cerrar este>                    |
| Tareas comunes activadas    | <C<n> del catalogo en US-PLAN.md>                              |

---

## US Incluidas

| US     | Titulo                          | Estado actual                                              |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| US-XX  | <titulo>                        | Cubierta / Parcial / Sin implementar — <evidencia breve>   |

---

## Estado Actual Relevante

### Base ya disponible

Lista numerada. Cada item cita `<path>:<lineas>` y describe que pieza ya esta lista y puede reutilizarse.

### Problemas reales que este bloque debe resolver

Lista numerada. Cada item describe un gap concreto a cerrar, citando `<path>:<lineas>` si aplica.

---

## Objetivos Del Bloque

Lista numerada de objetivos funcionales y no funcionales. Cada objetivo debe ser verificable.

---

## Tareas

Para cada tarea T<n>.<m>:

### T<n>.<m> — <Nombre corto>

**Alcance:** US-XX, US-YY, C<k> (si aplica)

**Problema que resuelve:** una frase.

**Archivos afectados:**
- `<path>` — <que cambia>
- ...

**Trabajo concreto:**
1. <accion>
2. <accion>
...

**Condicion de verificacion:** una frase que pueda comprobarse manualmente o con un test.

**Informacion para tests unitarios:**
- <caso borde 1>
- <caso borde 2>
- ...

**Subtarea final — Verificacion (opcional, recomendada):** comando concreto de tests que cierra la tarea, p.ej. `npm run test:unit -- --grep "<modulo>"`. Si esta subtarea esta presente, la tarea no se considera cerrada hasta que el comando devuelve verde.

**Dependencia:** T<n>.<k> previa o ninguna.

---

## Orden De Ejecucion Recomendado

```text
T<n>.1 → T<n>.2 → ... → Verificacion de integracion
```

---

## Verificacion: Tests De Integracion

Tarea de cierre del bloque. Se ejecuta cuando todos los tests unitarios de las tareas previas pasan. Su objetivo es verificar la integracion entre componentes.

### Escenario 1 — <titulo>

1. <paso>
2. <paso>
3. Verificar <resultado esperado>.

### Escenario 2 — ...

---

## Definition Of Done Del Bloque

- [ ] <objetivo verificable 1>
- [ ] <objetivo verificable 2>
- [ ] Todos los tests unitarios de T<n>.1 a T<n>.<m> pasan.
- [ ] Todos los escenarios de integracion del bloque pasan.

---

## Riesgos Del Bloque

| Riesgo                                   | Probabilidad   | Impacto   | Mitigacion                                       |
| ---------------------------------------- | -------------- | --------- | ------------------------------------------------ |
| <riesgo concreto>                        | Baja/Media/Alta| Bajo/Medio/Alto | <accion concreta>                          |
```

---

## 5. Conventions shared by every numbered file

- **No history rewriting.** Once an `AUDITORY-<n>.md`, `US-COBERTURA-<n>.md` or `EPIC-<n>-PLAN.md` is committed, treat it as immutable. Subsequent work produces a new numbered file; previously mitigated findings are listed in the new file's baseline section, not edited out of the old one.
- **Citations are clickable relative links.** Every concrete observation cites `[<path>](../<path>#L<a>-L<b>)`. Avoid bare quotations.
- **Dates are absolute.** Never write "last Thursday" — write `YYYY-MM-DD`.
- **Language.** `USER-STORIES.md`, `TECHNICAL-DESIGN.md` and `AUDITORY-<n>.md` are written in English. `US-PLAN.md`, `EPIC-<n>-PLAN.md`, `TASK-PLAN.md`, `US-COBERTURA-<n>.md` are currently in Spanish — keep the existing language of any document you extend.

## 6. EPIC plans are disposable — durable rules must land elsewhere

An `EPIC-<n>-PLAN.md` is a planning artefact, not a long-term reference. Once the block ships, the file is expected to be deleted (kept only via git history). Therefore, any *business rule* or *implementation contract* discovered while planning or executing the epic must be migrated to its durable home **before** the EPIC file is removed:

- Behavioural rules (who can do what, when, under which conditions) → `documentation/USER-STORIES.md`, attached to the relevant `US-XX`.
- Implementation surface (endpoint shapes, default expiries, transaction boundaries, anti-X filters at the repository layer) → `documentation/TECHNICAL-DESIGN.md`.

If a rule lives only in the EPIC plan, deleting the plan deletes the rule. The audit performed before deletion (see this file's history for the 2026-05 cleanup) is the practical check: read the EPIC file, list the code-enforced rules it states, grep the codebase to confirm they are still enforced, and migrate the ones not already in `USER-STORIES.md` / `TECHNICAL-DESIGN.md`. Only then delete.
