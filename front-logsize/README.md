# logsize — generic layout logger

A **zero-dependency, drop-in DevTools console tool** that reports *page vs
viewport* overflow and *per-element* geometry + computed styles, flagging which
elements are **cut off** below the fold or have **hidden internal overflow**. No
build step, no framework, single vanilla-JS file — it works over `file://` and on
any page you can drop a `<script>` into.

It is **quiet by default**: nothing prints on load, on resize, or on any key.
Only the explicit command prints.

---

## 1. What it is

`logsize.js` is one self-contained IIFE. Load it, then in DevTools type the bare
word `logsize` (or call `dumpLayout()`) to print a single snapshot of the current
layout. It is meant for chasing down "why is there a scrollbar / why is this
panel clipped" bugs without reaching for the Elements panel one node at a time.

---

## 2. The output

Every dump has two parts.

### Page-level block

```
==================== LAYOUT DUMP ======================
trigger            : manual (logsize / dumpLayout)
mode               : auto-detect
time               : 2026-05-20T10:00:00.000Z
window.inner W x H : 1280 x 720
visualViewport H   : 720
documentElement    : clientH=720 scrollH=812 | clientW=1280 scrollW=1280
body               : clientH=812 scrollH=812 offsetH=812
page vs viewport   : taller by 92px, wider by 0px
current scrollY    : 0
devicePixelRatio   : 1
------------------- blocks (DOM order) ----------------
```

- **`page vs viewport: taller by Npx, wider by Npx`** is the key verdict: if it
  is `taller by 0px, wider by 0px` the page fits exactly; any positive number is
  the amount of unwanted scroll the page introduces.
- `window.inner*` / `visualViewport` / `documentElement` / `body` give the raw
  numbers behind that verdict, plus `scrollY` and `devicePixelRatio` for context.
- `mode` tells you how the per-element list was chosen (`selectors`,
  `LOGSIZE_TARGETS`, or `auto-detect`).
- If you set `window.LOGSIZE_MEDIA`, one `media match : <query> => true/false`
  line is printed per query.

### Per-element report (3–4 lines each)

```
#reviewWorkspace           : top=120 bottom=812  h=692 w=1280
                             offH/cltH/scrlH = 692/692/904
                             flex pos:relative ovf:visible/visible flex:0/1/auto minH:0px h:auto maxH:none pad:0px/0px mar:0px/0px
                             >>> CUT-OFF: bottom is 92px below the viewport | HAS-INNER-OVERFLOW: scrollH=904 > clientH=692 (+212)
```

- Line 1 — `getBoundingClientRect`: `top`, `bottom`, height, width.
- Line 2 — `offsetHeight` / `clientHeight` / `scrollHeight`.
- Line 3 — computed `display`, `position`, `overflow-x/y`, `flex`,
  `min-height` / `height` / `max-height`, `padding`, `margin`.
- Line 4 (only when relevant) — the **two flags**:
  - **`CUT-OFF: bottom is Npx below the viewport`** — the element's bottom edge
    is below `innerHeight`, i.e. it is clipped / forces page scroll.
  - **`HAS-INNER-OVERFLOW: scrollH > clientH`** — the element is hiding content
    inside it (its own scroll area is bigger than its visible box).

---

## 3. Usage

| Command | What it does |
| --- | --- |
| `logsize` | Bare word; prints one dump. (Also `logSize`.) |
| `dumpLayout()` | Same as `logsize`. |
| `dumpLayout('header', '#app .card')` | Reports every element matching the given selectors (plus the page-level block). A selector matching several elements is labelled `selector [0]`, `selector [1]`, … |

**Why is the command one word?** `log-size` with a hyphen can't work — the
console parses it as the subtraction `log - size`. So the command is a single
identifier: `logsize` / `logSize`. It is wired as a property *getter* on `window`,
which is what lets the bare word (no parentheses) trigger a dump.

**How the no-argument dump picks elements:**

1. **Explicit selectors** — anything you pass to `dumpLayout(...)` always wins.
2. **`window.LOGSIZE_TARGETS`** — if the page declared structural blocks (see
   below) and you call `dumpLayout()` / `logsize` with no args, those are
   reported (always alongside `html` and `body`).
3. **Auto-detect** — with no selectors and no `LOGSIZE_TARGETS`, it reports
   `html` + `body` and then walks the DOM and reports **only the elements that
   are actually misbehaving** (cut off, or vertical/horizontal inner overflow),
   in DOM order, capped at 40 (it prints a note if it had to truncate). This
   finds overflow culprits on any page with zero configuration.

**Optional config (set before/anytime; both are plain `window` arrays):**

```js
window.LOGSIZE_TARGETS = ['header', 'main', { label: 'first card', selector: '#app .card' }];
window.LOGSIZE_MEDIA   = ['(min-width: 992px)', '(orientation: landscape)'];
```

**Optional live watching (opt-in, default OFF):**

```js
logsizeWatch();    // debounced ~300ms, deduped: only re-prints when the layout actually changes
logsizeUnwatch();  // stop
```

Nothing auto-prints unless you call `logsizeWatch()`.

The most recent report string is also kept at `window.__lastLogsizeDump`, and the
tool best-effort copies each dump to the clipboard (browser permitting).

---

## 4. How to attach it to a new view

### Manual (any HTML page)

a. Add the script just before `</body>`:

```html
<script src="<path>/logsize.js"></script>
```

b. *(Optional)* declare your structural blocks once, in a `<script>` placed
   **before** the logsize script:

```html
<script>window.LOGSIZE_TARGETS = ['header', 'main', '#app .card'];</script>
<script src="<path>/logsize.js"></script>
```

   …or just pass them ad-hoc at call time: `dumpLayout('header', '#app')`.

c. Open the page, open DevTools, type `logsize`, press Enter, then read or paste
   the output.

#### Worked example

For the reviewer prototype (its HTML lives in `reviewer-update/`, this tool in
`front-logsize/`), the relative path back to the tool is `../front-logsize/`:

```html
    <!-- just before </body> in reviewer-update/reviewer.html -->
    <script src="../front-logsize/logsize.js"></script>
  </body>
```

Then in DevTools:

```
> logsize
==================== LAYOUT DUMP ======================
...
page vs viewport   : taller by 92px, wider by 0px
...
```

### Scripted (PowerShell helpers in this folder)

Two helpers automate the manual edit above. Each takes an optional `-TargetDir`
(defaults to the current directory) and scans it **non-recursively** for `*.html`:
**more than one HTML file → error**, **zero → error**, **exactly one → act on it**.

```powershell
# attach: inserts the <script> (wrapped in logsize:begin/end markers) before </body>
./front-logsize/install.ps1 -TargetDir ./reviewer-update

# detach: removes that same block
./front-logsize/uninstall.ps1 -TargetDir ./reviewer-update
```

`install.ps1` computes the `src` relative to the HTML file (so it keeps working
over `file://`) and is idempotent — running it twice won't duplicate the tag.
`uninstall.ps1` removes only the marked block and leaves the rest of the file
untouched.
