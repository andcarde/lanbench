# AI-correction quality evaluation (Groq)

**Date:** 2026-05-27 · **Author:** autonomous agent pass (Claude Opus 4.7)
**Scope:** (1) enable a Groq connection for the review/correction flow and fix the
credential-check error; (2) evaluate correction quality with Groq and tune the
error-detection constants to minimise disagreement with a human ground truth.

---

## 1. Groq connection for review / correction

### What was added / fixed

Per-dataset LLM credentials (US-31) already supported an arbitrary
OpenAI-compatible provider. Adding a **Groq** credential on *Administración →
Credenciales de IA* (provider `groq`, model `llama-3.3-70b-versatile`, the key
from `.env GROQ_API_KEY`) and pressing **Comprobar** failed with a connection
error.

**Root cause.** The credential *check* calls `llmClient.generateText({ providerConfig, prompt })`
with **no system prompt**. The generic OpenAI-compatible client
(`utils/openai-compatible-client.js`) always built the request as:

```js
messages: [{ role: 'system', content: options.system }, { role: 'user', content: options.prompt }]
```

With `options.system === undefined`, `JSON.stringify` drops the field and Groq
rejects the request:

```
groq respondió con 400: {"error":{"message":"'messages.0' : for 'role:system' the
following must be satisfied[('messages.0.content' : property 'content' is missing)]"}}
```

**Fix.** Build the messages array defensively — only include the system message
when a non-empty system prompt is provided (mirroring the Anthropic client, which
already guarded this). After the fix the same `.env` key returns:

```
CHECK OK. Model reply: I'm llama-3.3-70b-versatile and I am ready to work
```

Regression test: `tests/unit/ollama/openai-compatible-client.test.js` ("omits the
system message when no system prompt is given").

> The credential key/connection is live and verified. The free-tier Groq budget is
> **100 000 tokens/day (TPD)**; the evaluation runs below exhausted it, surfacing
> a `429 tokens` for the last entries — which is itself proof the connection works.

---

## 2. Correction-quality evaluation

### Corpus (deliverable)

A 40-entry ground truth lives in `test-datasets/correction-suite.master.json`
(triples + Spanish candidate + human verdict + corrected form + rationale).
`scripts/build-correction-suite.js` generates 8 nested files (10 ⊂ 20 ⊂ 30 ⊂ 40):

| Inputs (entries to correct) | Expected (ground truth) | mix (ok / warning / error) |
|---|---|---|
| `correction-10-input.xml` | `correction-10-expected.json` | 4 / 2 / 4 |
| `correction-20-input.xml` | `correction-20-expected.json` | 8 / 4 / 8 |
| `correction-30-input.xml` | `correction-30-expected.json` | 13 / 6 / 11 |
| `correction-40-input.xml` | `correction-40-expected.json` | 17 / 8 / 15 |

The corpus covers **acceptance** (faithful translations), **warning** (accent,
imprecise entity, vague, unnatural, missing comma) and **error** (spelling,
English/mixed language, semantic mismatch, inverted relation, incomplete
fragment). Consistency is locked by `tests/unit/xml/correction-suite.test.js`.

### Harness

`scripts/eval-correction-quality.js <N>` runs the **real** pipeline
(`spanish-service.checkBatch`: rule-checker + Groq + coverage-checker +
alert-merger) over each entry with an explicit Groq `providerConfig`, derives the
verdict severity, and scores it against the expected file (per-entry table,
confusion matrix, agreement %). It runs sequentially with retry/back-off so
transient `429`s do not masquerade as acceptances — important because
`spanish-service` **silently falls back to rule-only** when the LLM call throws,
which would otherwise score every failed call as "ok".

### Result: 60% → 85% agreement on the 20-entry set

| | Acceptance correct | Warning correct | Error correct | Agreement |
|---|---|---|---|---|
| **Before tuning** | 4/8 | 0/4 | 8/8 | **12/20 = 60%** |
| **After tuning**  | 8/8 | 3/4 | 6/8 | **17/20 = 85%** |

The pipeline was heavily **false-positive biased** before tuning: valid sentences
were rejected by two deterministic checks whose constant lists were too narrow.

### Findings and the constant changes (`domain/spanish/lexicon.js`)

1. **False `incomplete_sentence`** on valid sentences. `looksLikeCompleteSentence`
   only treats a sentence as complete if it contains a verb in
   `COMPLETE_SENTENCE_MARKERS`; common verbs (*recibió, ganó, lleva, provienen,
   realiza, contiene, se encuentra, …*) were absent, so e.g. *"Albert Einstein
   recibió el Premio Nobel de Física."* was flagged as a fragment. → **Expanded
   the marker set** (tokens are accent/ñ-stripped to match the normaliser). A real
   fragment still has no verb, so detection of genuine fragments (eid 15, 35) is
   unaffected.

2. **False coverage `relation_missing`** on the passive `leaderTitle`.
   `PREDICATE_RELATION_PATTERNS.leaderTitle` matched *dirige* but not the passive
   participle *dirigido*, so *"… está dirigido por la Asamblea …"* read as missing
   the relation. → **Added the passive participles** (`dirigid[ao]s?`,
   `presidid[ao]s?`, `gobernad[ao]s?`) to the pattern and to
   `isLikelyLeaderTitleCovered`.

3. **False coverage `missing_triple`** on translated entity names. Coverage
   compares the **English** RDF entity against a **Spanish** sentence, so
   *Italy≠Italia, Spaghetti≠espaguetis* read as a missing triple. → **Added
   English↔Spanish `ENTITY_ALIASES`** (italy/italia, rome/roma, japan/japón,
   germany/alemania, netherlands/países bajos, spaghetti/espaguetis, rice/arroz,
   …) and origin verbs (*provienen/proceden/originario*) to the `country` pattern.

4. **Accent vs spelling (Groq behaviour).** Groq did not reliably flag missing
   diacritics. → Added a prompt clause in `ollama-spanish-checker.js`: missing
   tildes alone ⇒ `accent_error` (warning); letter omissions/substitutions
   (*kapital, hamburgesa*) stay `spelling_error` (error). This nudges Groq toward
   the catalogue's intended severities but remains model-dependent (see below).

### Known residual limitations (documented, not bugs to "tune away")

- **Same-token inversions** (eid 10, *"Italia proviene de los espaguetis"*). The
  deterministic coverage check verifies entity/relation **presence, not
  direction**; the inverted sentence has the same tokens as the correct one, so
  coverage reports full coverage and (per the `ejerce-liderazgo` contract)
  suppresses the LLM's `relation_inverted`. Fixing presence-based false positives
  for valid translations (the common case) is worth this rare false negative.
- **Appositive commas** (eid 17) and **subtle 1-letter spelling** (eid 20) are
  LLM-dependent and vary run-to-run at `temperature 0.1`.
- The deterministic constant fixes (1–3) are reproducible offline (no network) and
  account for the bulk of the 60→85 improvement; the prompt nudge (4) is softer
  and model-dependent.

### Reproduce

```
node scripts/build-correction-suite.js          # (re)generate the 8 files
node scripts/eval-correction-quality.js 10       # score the 10-entry corpus
node scripts/eval-correction-quality.js 20       # score the 20-entry corpus
```

Requires `GROQ_API_KEY` in `.env` and available daily token budget.
