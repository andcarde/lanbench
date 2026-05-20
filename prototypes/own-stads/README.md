# own-stads — "Mis estadísticas" prototype

A **front-only, self-contained** prototype of the personal-statistics view, split
out of `reviewer-update`. Open the HTML directly in a browser; it works end to
end against in-memory mock data — no server, no database, no network.

## Why it exists

In `reviewer-update`, "Mis estadísticas" was a tab scoped by dataset. Here it is
reworked to be **global**: the figures summarize the person's whole activity and
are **not** broken down by dataset, nor by task type (annotation vs review).

## How to run it

Open [`own-stads.html`](own-stads.html) in any modern browser (double-click, or
`file://…/own-stads.html`). No build, no server. "Actualizar" re-renders.

## Files

| File | Role |
|---|---|
| [`own-stads.html`](own-stads.html) | The page. |
| [`css/own-stads.css`](css/own-stads.css) | Self-contained styles (toolbar + stat cards + recent list). |
| [`js/own-stads.js`](js/own-stads.js) | Mock data (`buildStats`) + rendering. |

## The data shape

`buildStats()` returns a single flat, global summary (no `datasetId`, no
task-type split):

```text
{
  completed,        // tasks closed correctly (annotation + review)
  disputed,         // reviews closed in dispute
  acceptanceRate,   // % accepted on first pass
  avgMinutes,       // average time per task
  pending,          // tasks pending in queue
  recent: [{ outcome: 'completed' | 'disputed', label, finishedAt }]
}
```

In a real backend this would map to a single `GET /api/me/stats` endpoint.
