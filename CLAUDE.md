# CLAUDE.md — Collaboration Guidelines

## Methodology router

Before starting any task, the agent must classify it using the rules below and apply **exactly one** methodology block from this document. The agent does not begin work until the classification is decided.

**Explicit-name override.** If the user names a methodology in the order ("use the bugfix methodology", "this is a memory task", "apply the development methodology"), that choice wins over the table below.

**Classification table.** Evaluate rows top to bottom. The first row that matches is the one to use.

| # | If the task ... | Use |
|---|---|---|
| 1 | Modifies any file under `memory/`, `memory-release/`, `memory-versions/`, or `doc-process-memory/`; or generates/updates an audit, problems list, or tasks list about the TFM memory; or compiles the TFM PDF | **Memory correction methodology** |
| 2 | Fixes a runtime bug in the application, or mitigates an incident referenced in `doc-planning/AUDITORY-<v>.md` | **Incident mitigation methodology** |
| 3 | Adds, modifies, refactors, or tests application code (anything under the project root **outside** the folders listed in rows 1–2), including user stories, features, and database-schema changes | **Development methodology** |

**Mandatory ask.** If no row matches, the agent stops and asks the user which methodology to apply — it never defaults silently.

**Tie-breakers.**

- An order that requires both editing the memory and editing the app must be split into sub-tasks; each sub-task is classified independently before any work starts.
- A problem detected in the app while doing memory work is still memory work — it is recorded in the relevant `doc-process-memory/` document. Actually fixing the app belongs to a separate bugfix task.
- A problem detected in the memory while doing app work is still app work — the finding is recorded as a new item in the relevant `doc-process-memory/` document. Resolving it belongs to a separate memory task.
- "Documenting a problem" routes by the **location of the document being written**, not by where the problem lives: writing into `doc-process-memory/` is memory work; writing into `doc-planning/` is bugfix work.

## Task tracking — `doc-planning/TASKS.md`

`doc-planning/TASKS.md` is the **única fuente de tareas pendientes** del proyecto. Cualquier trabajo a ejecutar (desarrollo, bugfix, corrección de memoria, infraestructura, gobernanza) debe figurar allí antes de comenzar.

**Adición de tareas no listadas.** Si el usuario ordena un trabajo que no aparece en `TASKS.md`, el agente:

1. Inserta la tarea (o el grupo de tareas, si la orden cubre varios pasos) en la sección apropiada de `TASKS.md`, en el orden lógico que le corresponda.
2. Espera la confirmación de planificación si la metodología activa la requiere.
3. Ejecuta la tarea.

**Flags de estado.** Cada tarea termina con un flag entre corchetes:

- `[ ]` — pendiente, sin ejecutar.
- `[NO_APROBADA]` — ejecutada por el agente, pendiente del visto bueno del usuario.
- `[COMPLETADA]` — aprobada explícitamente por el usuario.

El agente debe cambiar el flag de `[ ]` a `[NO_APROBADA]` inmediatamente después de ejecutar la tarea, y de `[NO_APROBADA]` a `[COMPLETADA]` únicamente cuando el usuario confirme. Las tareas en `[COMPLETADA]` permanecen en el documento como histórico hasta que el documento se cierre según la [convención de documentos vivos](#living-document-naming-convention).

## Living-document naming convention

This convention applies to **every** file in this repository named `<name>-<v>.md` (audits, problems lists, tasks lists, planning notes, drafts, etc.) regardless of which methodology block is in effect. `<v>` is a positive integer with no sub-versions (`1`, `6`, `144` are valid; `1.1`, `1.2` are not).

**They may or may not exist.** The agent must never assume the presence of any specific version. Always scan the filesystem first.

**"The current version of `<name>`"** means the existing `<name>-<v>.md` with the **highest** `<v>`. If no file matches `<name>-*.md`, there is no current version.

**Creating a new `<name>` document.** When the agent is asked to produce one:

1. List all files matching `<name>-*.md` in the target folder.
2. If none exist, create `<name>-1.md`.
3. If at least one exists, let `<v>` be the highest integer found; create `<name>-<v+1>.md`.

**Superseding a previous version that is still open.** If `<name>-<v>.md` exists and has not been closed, follow this exact order:

1. Generate `<name>-<v+1>.md` by reviewing the current state of the memory and/or project.
2. In `<name>-<v>.md`, mark as closed every item already resolved or completed, documenting how it was resolved.
3. For each remaining open item in `<name>-<v>.md`, check whether it is also present in `<name>-<v+1>.md`.
4. Add any open item missing from `<name>-<v+1>.md` into `<name>-<v+1>.md`.
5. Once every item from `<name>-<v>.md` is either marked closed there or carried over to `<name>-<v+1>.md`, delete `<name>-<v>.md`.

**Closing a living document.** "Close" means verifying that every item it describes has been resolved (problems fixed, tasks completed). When that is confirmed, delete the file.

## Development methodology

Applies when the user gives an order related to the development of a user story or development task. If a user story is provided, phase 0 will be carried out. The user may perform phase 0 themselves. The agent operates in cautious mode if explicitly specified by the user. If the agent cannot continue for any reason, execution stops and the user is notified of the reason.

0. The agent plans the tasks (general level). Weak points of the approach are identified. The agent waits for the user's validation of the approach.

For each task:

1. The agent plans the necessary subtasks concisely and waits for user validation.
2. The agent documents before implementing, extending and modifying the user stories and technical design if necessary.
3. If the user specifies that it must be carried out in cautious mode, the agent implements only one of the planned subtasks and waits for user confirmation before continuing with the next one. **Otherwise, all subtasks are carried out**.
4. After executing all implementation subtasks, tests validating the completed task will be performed. In cautious mode, tests are not executed and confirmation from the user is awaited.
5. The process iterates by running tests and modifying either the implementation code or the test code until all existing failures are removed. In cautious mode, confirmation is awaited before execution.

### Why this methodology

It prevents execution failures and misalignment with the user's expectations, avoiding wasted computation and time. The user monitors the progress, inspecting the quality of the code.

## Docker

The project runs as three containers orchestrated by `docker-compose.yaml`:

- `app` — Node 22 / Express, built from the local `Dockerfile`, exposed on **http://localhost:3000**
- `db` — MariaDB 11, exposed on **localhost:3306** (data persisted in the `mariadb_data` volume)
- `adminer` — Generic SQL browser UI at **http://localhost:8080** (server: `db`, user: `lanbench`)

### First-time setup

1. Stop XAMPP's MySQL service if it's running (port 3306 conflict).
2. Copy `.env.example` to `.env` and fill in `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `SESSION_SECRET`, and `GROQ_API_KEY`.
3. Build and start everything: `docker compose up --build`
4. In another terminal, create the schema on the empty DB: `docker compose exec app npx prisma db push`
5. Bootstrap the admin user: `docker compose exec app npm run bootstrap-admin`

### Day-to-day

- Start: `docker compose up` (add `-d` to detach)
- Stop: `docker compose down` (data survives)
- Reset DB completely: `docker compose down -v` (destroys the `mariadb_data` volume)
- After editing `prisma/schema.prisma`: `docker compose cp prisma/schema.prisma app:/app/prisma/schema.prisma && docker compose exec app npx prisma db push` (rebuild the image with `docker compose build app` when convenient, so the baked schema stays in sync).
- Browse data with schema awareness: `docker compose exec app npx prisma studio` (Studio runs inside the `app` container; it forwards the port automatically because Docker maps 5555 on demand — if not, use Adminer at http://localhost:8080).

### Notes

- `database/lanbench.sql` is **not** auto-loaded — it's a stale phpMyAdmin dump whose schema does not match `prisma/schema.prisma`. The source of truth is the Prisma schema, applied via `prisma db push`.
- The Ollama service is not yet containerized; `MODEL=local` would need to reach an Ollama instance on the host.
- `./uploads/` is bind-mounted so user-uploaded files survive container rebuilds.

### Required step after any code change

Whenever a task involves code changes, the agent must run `npm run up:2` once the task is finished to upload the changes to the running docker stack.

### Required step after any database schema change

Whenever a task changes `prisma/schema.prisma`, the agent must push the new schema into the running docker container and then run the schema check:

1. `docker compose cp prisma/schema.prisma app:/app/prisma/schema.prisma && docker compose exec app npx prisma db push`
2. `npm run test:db`

## Incident mitigation methodology (bugfix methodology)

Applies when the user gives an incident mitigation order. If the set the agent in high autonomy mode. Skip all the permissions and waits to the user. Work without stop in the given task.

1. If the incident is not explicit but referenced, consult the current version of `doc-planning/AUDITORY` (per the [Living-document naming convention](#living-document-naming-convention)). If no version exists, ask the user.
2. Plan the mitigation in tasks.
3. Identify the possible issues of the proposed approach.
4. If you are Claude Sonnet, you must indicate whether the success rate increases by more than 10% if Claude Opus continues.
5. Present an alternative plan if the issues are serious.
6. Carry out the incident mitigation.
7. Build auxiliary tests, **only if they make sense for the application**.

## Memory correction methodology

Applies to any task that modifies the TFM memory (content or formatting) and to tasks that document detected problems (audits) or pending work. "Pending work" covers three cases: (a) mitigation of problems already detected in the memory or in the project, (b) scope increase, (c) scope levelling — i.e. ensuring that what is described in the memory exists in the project and vice versa.

This methodology is **independent** from the development, bugfix, project documentation, project planning, and audit methodologies above. None of those rules apply here unless explicitly invoked by the user.

### Folder and file layout

- `memory/` — live source of the TFM (LaTeX). All editing iterations happen here.
- `memory-release/` — frozen source corresponding to the latest release. Never edited directly.
- `memory-versions/` — output folder for compiled PDFs. Contains exactly:
  - `lanbench-tmp.pdf` — the live compiled PDF, overwritten on every memory-modifying task.
  - `lanbench-<n>.pdf` — the current release PDF, where `<n>` is a positive integer with no sub-versions (`1`, `6`, `144` are valid; `1.1`, `1.2` are not).
- `doc-process-memory/` — process documentation for the "TFM memory creation" workflow (see below).

### Versioning policy

Goal: the memory must be in a **valid** state at all times. The release mechanism guarantees this by keeping a known-good frozen copy.

**Release action (only when the user explicitly orders a release):**

1. If no previous release exists, the current state of `memory/` becomes release `1`. Otherwise let `n` be the current release number; the new release will be `n+1`.
2. Copy the entire content of `memory/` into `memory-release/`, deleting any previous content of `memory-release/`.
3. Rename `memory-versions/lanbench-tmp.pdf` to `memory-versions/lanbench-<n+1>.pdf`.
4. Delete the previous release PDF `memory-versions/lanbench-<n>.pdf` if it exists.

Between releases, iterations of improvement and content addition happen exclusively on `memory/`. The user compares the compiled `lanbench-tmp.pdf` against the latest release PDF to decide when the live memory is ready to be promoted.

### PDF-ready policy (mandatory task closure)

Every memory-modifying task **must** end with a compilation step. The compilation produces `.textbuild/plantilla_TFM.pdf`. Immediately after compiling, the agent must:

1. Copy `.textbuild/plantilla_TFM.pdf` to `memory-versions/lanbench-tmp.pdf`, overwriting any previous file with that name.

If compilation fails, the task is not closed; the agent reports the failure to the user instead of leaving a stale `lanbench-tmp.pdf`.

### Process documentation policy

`doc-process-memory/` stores living documents that support the memory-creation process. All files in this folder follow the [Living-document naming convention](#living-document-naming-convention) — creation, supersession, and closing rules are defined there and are not repeated here.

Typical documents in this folder (the list is not exhaustive):

- `MEMORY-PROBLEMS-<v>.md` — catalogue of problems detected in the memory.
- `MEMORY-TASKS-<v>.md` — pending work, separated into tasks an LLM can perform and tasks the user must perform.
- `AUDIT-CITATIONS-<v>.md` (and other `AUDIT-*-<v>.md`) — partial audits, e.g. claims not supported by the bibliography.
- `MEMORY-INDEX-<v>.md` (and other temporary artefacts) — drafts, prototypes, scratch content.

### Process documentation update policy

The agent must keep `doc-process-memory/` in sync with reality:

- When the user tells the agent that a task or problem has been resolved, or when the agent itself resolves it on the user's request, the agent updates the corresponding document to mark that item as closed.
- When the agent, while performing any other task, detects a new problem or a new pending task, the agent must add it to the corresponding document. Before adding, the agent must verify the item is not already recorded (under any equivalent wording) in the most recent version of that document, to avoid duplicates.
