# Lanbench

Lanbench is a Human-in-the-Loop web platform for building, correcting, reviewing, and evaluating Spanish verbalizations of RDF triples in WebNLG-style datasets.

The project was developed as part of a Master's Thesis on extending the WebNLG benchmark to Spanish. WebNLG provides structured DBpedia RDF triples paired with natural-language verbalizations, but its official editions cover English, Russian, and several low-resource languages rather than Spanish. Lanbench addresses the tooling side of that gap: it provides the infrastructure needed to coordinate human annotation, AI-assisted correction, review, dataset administration, and reproducible evaluation.

## What Lanbench Does

Lanbench supports a collaborative corpus-construction workflow:

1. A moderator imports a WebNLG-compatible XML dataset.
2. Dataset administrators configure permissions, review settings, and optional LLM credentials.
3. Annotators work on reserved sections of entries and create or correct Spanish sentences.
4. The system validates the output using deterministic Spanish checks and, when enabled, an LLM assistant.
5. Reviewers validate annotations, leave decisions and comments, and help improve final quality.
6. Completed datasets can be exported back to XML with Spanish lexicalizations.

The platform is designed for academic corpus construction, NLG experimentation, and controlled evaluation of LLM-assisted RDF-to-text generation.

## Main Features

- WebNLG XML import and structured persistence of entries, triplesets, triples, lexicalizations, and links.
- Role-based access model with global moderator privileges and per-dataset permissions.
- Section-based concurrency control for annotation and review work.
- Annotation workflow for Spanish verbalizations of RDF triples.
- Review workflow with decisions, comments, and optional additional review rounds.
- Per-dataset LLM configuration with encrypted API keys.
- LLM modes for correction assistance and creative candidate generation.
- Deterministic Spanish validation rules for coverage, grammar-like signals, entity aliases, repeated sentences, and semantic mismatch alerts.
- Dataset statistics and personal work statistics.
- Original and extended XML download.
- Reproducible evaluation scripts and automated test coverage.

## Architecture

Lanbench is implemented as a modular layered monolith:

- `routes/` exposes web pages and API endpoints.
- `controllers/` handles HTTP-level orchestration.
- `services/` contains application and domain logic.
- `repositories/` encapsulates persistence.
- `domain/spanish/` contains Spanish validation and rule-based checking.
- `contracts/` maps internal data to API DTOs.
- `utils/` provides XML parsing, XML generation, LLM clients, logging, validation helpers, and security utilities.
- `prisma/schema.prisma` is the canonical database schema.
- `public/` contains the browser UI.

The runtime stack is:

- Node.js 22
- Express 5
- Prisma
- MariaDB 11
- Docker Compose
- Mocha/Chai for automated tests

LLM access is provider-agnostic where possible. The current integration supports OpenAI-compatible providers and includes clients or dispatch paths for Groq, Google AI Studio/Gemini, Anthropic, and Ollama-style local models.

## Repository Layout

```text
app.js                         Express application composition
config.js                      Runtime configuration
constants/                     Shared domain constants
controllers/                   HTTP controllers
domain/spanish/                Spanish checking and alert logic
middlewares/                   Auth, upload, logging, error plumbing
prisma/schema.prisma           Database schema
public/                        Frontend pages, CSS and browser scripts
repositories/                  Data access layer
routes/                        Web and API route definitions
scripts/                       Operational and evaluation scripts
services/                      Business services
test-datasets/                 Small test/evaluation fixtures owned by this repo
tests/                         Unit and integration tests
utils/                         XML, LLM, crypto, validation and support utilities
```

The `memory/` directory contains the LaTeX source of the Master's Thesis and is not required to run the application.

## Data And Copyright

Official WebNLG datasets are third-party resources and are not redistributed by this repository. Local copies of downloaded WebNLG releases must stay outside version control and outside Docker build contexts.

The repository explicitly ignores:

```text
documentation/webnlg_datasets/
documentation/**/webnlg_datasets/
```

Use the official sources when you need the original datasets:

- WebNLG 2017: `https://gitlab.com/shimorina/webnlg-dataset/-/tree/master/webnlg_challenge_2017`
- WebNLG+ 2020: `https://gitlab.com/shimorina/webnlg-dataset/-/tree/master/release_v3.0`
- WebNLG 2023: `https://github.com/WebNLG/2023-Challenge/tree/main/data`
- WebNLG 2023 on Hugging Face: `https://huggingface.co/datasets/webnlg/challenge-2023`

## Prerequisites

- Docker and Docker Compose
- Node.js 22 if running tests or scripts outside Docker
- npm
- Optional provider API keys for LLM-assisted workflows

## Configuration

Create a local `.env` file from the template:

```bash
cp .env.example .env
```

Fill at least:

```env
DB_PASSWORD=...
DB_ROOT_PASSWORD=...
SESSION_SECRET=...
CREDENTIALS_ENCRYPTION_KEY=...
```

For cloud LLM support, also configure the relevant provider keys, for example:

```env
MODEL=cloud
GROQ_API_KEY=...
```

`CREDENTIALS_ENCRYPTION_KEY` should be stable. It is used to encrypt per-dataset API keys at rest; rotating it makes previously stored credentials unreadable.

## Running With Docker

Start the main stack:

```bash
docker compose up --build
```

Services:

- Application: `http://localhost:3000`
- MariaDB: `localhost:3306`
- Adminer: `http://localhost:8080`

Initialize the schema:

```bash
docker compose exec app npx prisma db push
```

Create or promote the initial moderator:

```bash
docker compose exec \
  -e BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
  -e BOOTSTRAP_ADMIN_PASSWORD=change-me-now \
  app npm run bootstrap-admin
```

Adminer connection values:

- Server: `db`
- User: `lanbench`
- Password: value of `DB_PASSWORD`
- Database: `lanbench`

## Testing

Run unit tests:

```bash
npm run test:unit
```

Run integration tests:

```bash
npm run test:integration
```

Run the full test suite:

```bash
npm run test:all
```

Check the live database schema inside Docker:

```bash
npm run test:db
```

Run linting:

```bash
npm run lint
```

Some integration tests require a running database or live provider credentials. Tests that cannot run without optional external services are designed to skip or fail explicitly according to their purpose.

## Evaluation Scripts

The project includes reproducible evaluation utilities under `scripts/` for building and assessing generation and correction corpora. These scripts were used in the thesis experiments to compare provider behaviour and to calibrate the Spanish validation pipeline.

Relevant examples include:

- `scripts/build-correction-suite.js`
- `scripts/build-generation-suite.js`
- `scripts/eval-correction-quality.js`
- `scripts/eval-generation-quality.js`
- `scripts/build-quality-eval-sample.js`

Evaluation outputs are written under `documentation/eval-output/` when generated.

## Security Notes

- Session secrets and provider API keys must never be committed.
- Per-dataset LLM credentials are encrypted at rest.
- API keys are not returned to the browser in clear text.
- Request and anomaly logs redact sensitive values.
- `.env`, local keys, logs, build artifacts, and third-party datasets are ignored.

## License

The Lanbench source code is released under the **European Union Public Licence v. 1.2 (EUPL-1.2)**. The full license text is available in the [`LICENSE`](LICENSE) file at the root of this repository, and the same identifier (`EUPL-1.2`) is declared in `package.json`. The EUPL is a strong copyleft licence published by the European Commission; it is bidirectionally compatible with GPLv2/v3, AGPLv3, LGPLv2.1/3, MPL 2.0, EPL 2.0 and CeCILL, and its remote-communication clause closes the SaaS loophole of the GPLv3 for networked deployments.

The accompanying Master's thesis (under `memory/`) is distributed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International** licence (CC BY-NC-SA 4.0).

No permission is granted to redistribute third-party datasets through this repository. Consult the official WebNLG dataset licenses before downloading, using, or publishing derived resources.
