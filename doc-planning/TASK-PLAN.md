# TASK-PLAN — T0.1: Externalize DEBUG to an environment variable

Date: 2026-04-23

Epic reference: `EPIC-PLAN.md` — Block E0, task T0.1

---

## Context

T0.1 solves the problem documented in `EPIC-PLAN.md`:

> `public/js/annotations.js:9` and `public/js/dataset-view.js:4` have `DEBUG = true` as a fixed constant. That makes the front end use mock data in any deployment, ignoring the real backend.

---

## Chosen approach

Split the logic of `public/js/` into two layers:

1. **Plain JS files** (`public/js/`) — UI logic with no AJAX calls.
2. **Action files** (`public/js/actions/`) — all AJAX requests to the server.

For debug/demo mode, the `front-mocks/` folder is created with files that replicate the same function interface as `public/js/actions/` but return static mock data.

The toggle mechanism is an `npm run front-debug` command that swaps the folders:

- **Enable debug mode:** moves `public/js/actions/` → `front-mocks/` and `ajax/` → `public/js/actions/`
- **Disable debug mode:** reverse operation

Criteria that guided the choice:
- No additional dependencies (MSW requires reconfiguring the architecture; json-server adds an external server).
- Compatibility with the "Only One Page" paradigm (HTML + CSS for constants, logic in JS).
- Pages continue to work via double-click without starting a server (debug mode).
- The `front-mocks/` folder is not deployed to production; it is only a local development artifact.

---

## Subtask plan

| # | Subtask | Affected files | Status |
|---|---|---|---|
| ST0.1.1 | Extract the 3 AJAX calls from `annotations.js` into `public/js/actions/annotations-actions.js` with a clean function interface; update `annotations.html` to include the new script | `annotations.js`, `annotations.html`, new `actions/annotations-actions.js` | **DONE** |
| ST0.1.2 | Extract the AJAX call from `dataset-view.js` into `public/js/actions/dataset-view-actions.js`; update `dataset-view.html` | `dataset-view.js`, `dataset-view.html`, new `actions/dataset-view-actions.js` | **DONE** |
| ST0.1.3 | Create `front-mocks/annotations-actions.js` and `front-mocks/dataset-view-actions.js` with the current mock data (`MOCK_SECTION`, `DEBUG_DATASET_TEXT`), replicating the same function interface | new files in `front-mocks/` | **DONE** |
| ST0.1.4 | Remove from `annotations.js` and `dataset-view.js` the constants `DEBUG`, `MOCK_SECTION`, `DEBUG_DATASET_TEXT`, and all the `if (DEBUG)` blocks already extracted | `annotations.js`, `dataset-view.js` | **DONE** |
| ST0.1.5 | Create `scripts/front-debug.js` (Node.js) with the toggle logic and integrate it into `package.json` as `npm run front-debug` | `package.json`, new `scripts/front-debug.js` | **DONE** |

**All subtasks completed.**

---

## Verification condition (from EPIC-PLAN.md)

With `DEBUG_MODE=false` (i.e., the `public/js/actions/` folder with the real files active), the annotation and XML view screens call the real endpoints and do not load static data.
