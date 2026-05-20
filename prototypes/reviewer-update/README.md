# reviewer-update — Reviewer front-end prototype

A **front-only, decoupled prototype** of the reviewer experience for `lanbench`.
Everything lives inside this folder; nothing here is wired into the running
application. Open the HTML directly in a browser and the page works end to end
against in-memory **mock actions** — no server, no database, no network.

It was built from the functional contract in
[`documentation/USER-STORIES.md`](../documentation/USER-STORIES.md) (`US-13`,
`US-12`) and the technical contract in
[`documentation/TECHNICAL-DESIGN.md`](../documentation/TECHNICAL-DESIGN.md)
(§4.2 review flow, §2.6 review data model, §4.5 authorization).

## Why it exists

The shipped page [`public/reviewer.html`](../public/reviewer.html) is a
*simplified* reviewer: it collapses the evaluation criteria into a single
accept/reject toggle. That page **does make sense in the project** — it is the
real entry point gated for moderators (`/reviewer`) — but it does not yet
implement the richer **per-phrase** flow this prototype explores:

- **phrase-by-phrase evaluation**: the annotated sentences are selectable —
  click one (or focus it and press Enter/Space) and the criteria panel drives
  *that* phrase. Each phrase keeps its own decisions, so switching never loses
  state.
- a **sequential criteria wizard per phrase** over five criteria — Naturalidad,
  Fluidez, Adecuación, Completitud, Cobertura — where the next stays locked
  until the current one is decided (`criterion_locked`),
- one **review-level criterion**, *Diversidad*, decided **once for the whole
  entry** (it is inherently comparative across phrases),
- a **binary decision** per criterion: **Sí** (`accepted`) commits immediately;
  **No** (`rejected`) reveals a **mandatory _Motivo_** (≤ 280 chars, enforced
  natively against typing *and* pasting) plus a centered **Siguiente** to commit
  (`comment_required`),
- **inline sentence correction** with a mandatory justification
  (`invalid_correction`),
- **finalization** that requires every phrase's five criteria **and** the
  review-level criterion to be decided (`criteria_incomplete`), resolving the
  review to `completed` (everything `accepted`) or `disputed`,
- **release** back to the queue, plus the **2-hour exclusive-assignment** expiry,
- a **dataset-scoped queue** — the prototype always targets a concrete dataset;
  there is no “global” pool option in the UI.

On screen, each of the three blocks (*Contexto de la entry*, *Frases anotadas*,
*Criterios de calidad*) scrolls **inside itself** on desktop, so the workspace
fits a single screen and the browser never shows its own scrollbars.

This prototype implements all of the above so the flow can be reviewed and
tested manually before touching production code.

## How to run it

Just open [`reviewer.html`](reviewer.html) in any modern browser
(double-click, or `file://…/reviewer-update/reviewer.html`). No build, no
server. The mock seeds a small review queue across two datasets plus a global
queue, so every interaction is exercisable.

## Files

| File | Role |
|---|---|
| [`reviewer.html`](reviewer.html) | The page. Loads the **mock** actions by default. |
| [`css/reviewer.css`](css/reviewer.css) | Self-contained styles (static top bar + review UI). |
| [`js/reviewer.js`](js/reviewer.js) | UI logic: phrase selection, per-phrase wizard, corrections, auto-finalize. **Action-agnostic.** |
| [`js/actions/reviewer-actions.mock.js`](js/actions/reviewer-actions.mock.js) | **Front-mock** — stateful in-memory backend. Wired by default. |
| [`js/actions/reviewer-actions.real.js`](js/actions/reviewer-actions.real.js) | **Real** AJAX against `/api/reviews/*`. Decoupled (not loaded). |

Both action files expose the **same** `window.ReviewerActions` interface, so
`reviewer.js` never changes between modes. This mirrors the project's existing
[`scripts/front-debug.js`](../scripts/front-debug.js) convention, where
`front-mocks/` twins swap in for the real `public/js/actions/` modules.

### The shared action interface (`window.ReviewerActions`)

```text
fetchNextReview(datasetId?)        -> { ok, status, data: review }
fetchReviewContext(reviewId)       -> { ok, status, data: ReviewContext }
submitDecision(reviewId, payload)  -> { ok, status, data }   // criterion_locked / comment_required
    // payload: { sentenceIndex|null, criterionCode, decision, comment }
    // sentenceIndex:null => the review-level criterion (diversity)
submitCorrection(reviewId, payload)-> { ok, status, data }   // invalid_correction
finalizeReview(reviewId)           -> { ok, status, data }   // criteria_incomplete
releaseReview(reviewId)            -> { ok, status, data }
```

`ReviewContext` shape consumed by the UI:

```text
{
  review:         { id, status, annotatorEmail, datasetId, datasetName,
                    assignedAt, expiresAt },
  phraseCriteria: [{ code, label, description }],            // the 5 per-phrase criteria (ordered)
  reviewCriteria: [{ code, label, description }],            // review-level criteria (diversity)
  reviewDecisions:[{ sentenceIndex, criterionCode, decision, comment }],
                                                             // sentenceIndex:null => review-level
  annotations:    [{ sentenceIndex, sentence, origin }],
  reviewComments: [{ sentenceIndex, originalSentence, correctedSentence, comment }],
  triples:        [{ subject, predicate, object }],
  englishSentences: [ "…" ],
  alertDecisions: [{ sentenceIndex, alertCode, alertType, decision, reason }]
}
```

## Switching mock → real

Open [`reviewer.html`](reviewer.html) and swap the active `<script>` tag near the
bottom (a comment marks the spot):

```html
<!-- ACTIVE: front-mock (manual testing, no backend) -->
<script src="js/actions/reviewer-actions.mock.js"></script>
<!-- REAL (decoupled): point at /api/reviews/* — needs the running app + a logged-in reviewer
<script src="js/actions/reviewer-actions.real.js"></script>
-->
```

The real module talks to the endpoints documented in
[`TECHNICAL-DESIGN.md`](../documentation/TECHNICAL-DESIGN.md) §4.2 / §4.5.

> Personal statistics ("Mis estadísticas") were split out into the sibling
> [`../own-stads`](../own-stads) prototype, where they are global (not by dataset
> nor task type).

## Scope

- **In scope:** front-end only — HTML, CSS, JS, and the two action twins.
- **Out of scope:** any backend, routes, controllers, services, DB, or wiring
  into the live app. This folder is intentionally self-contained and risk-free.
