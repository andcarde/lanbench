# own-stads — "Mis estadísticas" prototype

A **front-only, decoupled prototype** of the personal-statistics view for
`lanbench`. Everything lives inside this folder; nothing here is wired into the
running application. Open the HTML directly in a browser and the page works end
to end against in-memory **mock actions** — no server, no database, no network.

It mirrors the structure of the sibling [`reviewer-update`](../reviewer-update)
prototype: an **action-agnostic** UI (`js/own-stads.js`) driven by a swappable
`window.OwnStadsActions` interface, with a **front-mock** twin (active by
default) and a **real** AJAX twin (decoupled).

## What it shows

The page is the user's own activity — **annotation** and **review** — both as
global totals and broken down by dataset:

- **Global totals** (cards): total annotations, total reviews, number of
  datasets annotated, number of datasets reviewed, and the **average time per
  annotation** and **per review**.
- **Per-dataset table**: one row per dataset where the user has **at least one**
  annotation or review (`> 0`), with that dataset's counts and average times.

The averages are the foundation for the time-tracking work: the real backend
records the time spent annotating (on the user's `SectionAssignment`) and
reviewing (on each `Review`), and averages it as *total seconds ÷ task count*.

## How to run it

Open [`own-stads.html`](own-stads.html) in any modern browser (double-click, or
`file://…/own-stads.html`). No build, no server. "Actualizar" re-fetches.

## Files

| File | Role |
|---|---|
| [`own-stads.html`](own-stads.html) | The page. Loads the **mock** actions by default. |
| [`css/own-stads.css`](css/own-stads.css) | Self-contained styles (static top bar + stat cards + table). |
| [`js/own-stads.js`](js/own-stads.js) | UI logic: summary cards + per-dataset table. **Action-agnostic.** |
| [`js/actions/own-stads-actions.mock.js`](js/actions/own-stads-actions.mock.js) | **Front-mock** — in-memory stats. Wired by default. |
| [`js/actions/own-stads-actions.real.js`](js/actions/own-stads-actions.real.js) | **Real** AJAX against `GET /api/me/stats`. Decoupled (not loaded). |

Both action files expose the **same** `window.OwnStadsActions` interface, so
`own-stads.js` never changes between modes. This mirrors the project's
[`scripts/front-debug.js`](../../scripts/front-debug.js) convention, where
`front-mocks/` twins swap in for the real `public/js/actions/` modules.

### The shared action interface (`window.OwnStadsActions`)

```text
fetchMyStats() -> { ok, status, data: MyStats }
```

`MyStats` shape consumed by the UI (and produced by the real
`me-statistics-service`):

```text
{
  user:   { id, email },
  totals: {
    annotations,           // total entries annotated (all datasets)
    reviews,               // total reviews completed (all datasets)
    datasetsAnnotated,     // # datasets with annotations > 0
    datasetsReviewed,      // # datasets with reviews > 0
    avgAnnotationSeconds,  // total annotation seconds / annotations (null if 0)
    avgReviewSeconds       // total review seconds / reviews (null if 0)
  },
  datasets: [              // only datasets with annotations > 0 OR reviews > 0
    { datasetId, datasetName, annotations, reviews,
      avgAnnotationSeconds, avgReviewSeconds }
  ]
}
```

## Switching mock → real

Open [`own-stads.html`](own-stads.html) and swap the active `<script>` tag near
the bottom (a comment marks the spot):

```html
<!-- ACTIVE: front-mock (manual testing, no backend) -->
<script src="js/actions/own-stads-actions.mock.js"></script>
<!-- REAL (decoupled): point at /api/me/stats — needs the running app + a logged-in user
<script src="js/actions/own-stads-actions.real.js"></script>
-->
```

## The two statistics surfaces

This prototype covers **only** the personal view ("Mis estadísticas"). The
project has a **second** statistics surface — the **dataset administration**
page — which shows, per dataset and for its admins, each user's individual
average annotation/review time **and** the dataset's **weighted general
average** (`Σ time ÷ Σ tasks`). That one is integrated directly into
`public/dataset-admin.html` (US-21), not prototyped here.

## Scope

- **In scope:** front-end only — HTML, CSS, JS, and the two action twins.
- **Out of scope:** any backend, routes, controllers, services, DB, or wiring
  into the live app. This folder is intentionally self-contained and risk-free.
