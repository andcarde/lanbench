# CLAUDE.md — Collaboration Guidelines

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
- After editing `prisma/schema.prisma`: `docker compose exec app npx prisma db push`
- Browse data with schema awareness (run from host, not in the container): `npx prisma studio`

### Notes

- `database/lanbench.sql` is **not** auto-loaded — it's a stale phpMyAdmin dump whose schema does not match `prisma/schema.prisma`. The source of truth is the Prisma schema, applied via `prisma db push`.
- The Ollama service is not yet containerized; `MODEL=local` would need to reach an Ollama instance on the host.
- `./uploads/` is bind-mounted so user-uploaded files survive container rebuilds.

## Incident mitigation methodology (bugfix methodology)

Applies when the user gives an incident mitigation order. If the set the agent in high autonomy mode. Skip all the permissions and waits to the user. Work without stop in the given task.

1. If the incident is not explicit but referenced, consult the last version of 'doc-planning/AUDITORY-<version>.md' where the incidents are documented.
2. Plan the mitigation in tasks.
3. Identify the possible issues of the proposed approach.
4. If you are Claude Sonnet, you must indicate whether the success rate increases by more than 10% if Claude Opus continues.
5. Present an alternative plan if the issues are serious.
6. Carry out the incident mitigation.
7. Build auxiliary tests, **only if they make sense for the application**.
