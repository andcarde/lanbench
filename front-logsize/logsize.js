// @ts-nocheck
/**
 * @file logsize.js — generic, dependency-free layout logger.
 *
 * Drop-in DevTools console tool that dumps, for the page and for any set of
 * elements, their position + size (getBoundingClientRect + offset/client/scroll
 * heights) and the layout-relevant computed styles (display, position, overflow,
 * flex, min-height/height/max-height, padding, margin). It flags any element
 * whose bottom falls BELOW the visible viewport (cut off) and any element that
 * has hidden internal overflow.
 *
 * Zero dependencies, no build step, works over file://. It logs ONLY on demand —
 * nothing is printed on load, on resize, or on any key, unless you explicitly
 * opt in with logsizeWatch().
 *
 * HOW TO USE
 *   1. Load the page, open DevTools.
 *   2. In the console type  logsize  (no parentheses) and press Enter — or call
 *      dumpLayout(). Pass selectors to target specific elements, e.g.
 *      dumpLayout('header', '#app .card').
 *   3. Paste the console output back (it is also copied to the clipboard when
 *      the browser allows it).
 *
 * PUBLIC API (all on window)
 *   logsize / logSize          getters; the bare word prints one dump.
 *   dumpLayout(...selectors)   prints one dump; selectors are optional.
 *   logsizeWatch()             OPT-IN: debounced auto-dump on resize/observe.
 *   logsizeUnwatch()           stop watching.
 *   window.LOGSIZE_TARGETS     optional [ 'sel', { label, selector }, ... ] the
 *                              host page declares once; used by a no-arg dump.
 *   window.LOGSIZE_MEDIA       optional [ '(min-width: 992px)', ... ] media
 *                              queries to report match-state for.
 *
 * When dumpLayout()/logsize is called with no selectors and no LOGSIZE_TARGETS,
 * it AUTO-DETECTS: it reports html + body plus only the elements that are
 * actually misbehaving (cut off or hiding overflow), so it finds culprits on any
 * page with zero configuration.
 */
'use strict';

(function () {
    /** Rounds to whole pixels for readable output. */
    function px(n) { return Math.round(n); }

    /** Layout-relevant computed styles of an element. */
    function styleOf(el) {
        const s = getComputedStyle(el);
        return `${s.display} pos:${s.position} ovf:${s.overflowX}/${s.overflowY}`
            + ` flex:${s.flexGrow}/${s.flexShrink}/${s.flexBasis}`
            + ` minH:${s.minHeight} h:${s.height} maxH:${s.maxHeight}`
            + ` pad:${s.paddingTop}/${s.paddingBottom} mar:${s.marginTop}/${s.marginBottom}`;
    }

    /** One element's report (3-4 lines). */
    function line(label, el) {
        const pad = label.length >= 26 ? label : label.padEnd(26);
        if (!el) return `${pad} : (not found / not in DOM)`;

        const r = el.getBoundingClientRect();
        const belowFold = r.bottom - window.innerHeight;
        const innerScroll = el.scrollHeight - el.clientHeight;

        const flags = [];
        if (belowFold > 0.5) flags.push(`CUT-OFF: bottom is ${px(belowFold)}px below the viewport`);
        if (innerScroll > 1) flags.push(`HAS-INNER-OVERFLOW: scrollH=${px(el.scrollHeight)} > clientH=${px(el.clientHeight)} (+${px(innerScroll)})`);

        const rows = [
            `${pad} : top=${px(r.top)} bottom=${px(r.bottom)}  h=${px(r.height)} w=${px(r.width)}`,
            `${''.padEnd(26)}   offH/cltH/scrlH = ${px(el.offsetHeight)}/${px(el.clientHeight)}/${px(el.scrollHeight)}`,
            `${''.padEnd(26)}   ${styleOf(el)}`
        ];
        if (flags.length) rows.push(`${''.padEnd(26)}   >>> ${flags.join(' | ')}`);
        return rows.join('\n');
    }

    /** A short, human-readable label for an element: tag#id.class[:nth-of-type]. */
    function shortPath(el) {
        if (el === document.documentElement) return 'html';
        if (el === document.body) return 'body';
        let label = el.tagName.toLowerCase();
        if (el.id) label += `#${el.id}`;
        if (el.classList && el.classList.length) {
            label += '.' + Array.from(el.classList).slice(0, 3).join('.');
        }
        // Disambiguate among same-tag siblings when there is no id to pin it down.
        if (!el.id && el.parentElement) {
            const sameTag = Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName);
            if (sameTag.length > 1) label += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
        }
        return label;
    }

    /** True when an element overflows the viewport or hides internal overflow. */
    function isMisbehaving(el) {
        const r = el.getBoundingClientRect();
        return (r.bottom > window.innerHeight + 1)
            || (el.scrollHeight - el.clientHeight > 1)
            || (el.scrollWidth - el.clientWidth > 1);
    }

    /** querySelectorAll that never throws on a bad selector. */
    function safeQueryAll(sel) {
        try { return Array.from(document.querySelectorAll(sel)); }
        catch { console.warn(`[logsize] invalid selector: ${sel}`); return []; }
    }

    /** Auto-detect mode never floods the console with more than this many elements. */
    const AUTO_LIMIT = 40;

    /**
     * Resolves the ordered [label, element] pairs to report, in DOM order.
     * @param {string[]} selectors explicit selectors passed to dumpLayout().
     * @returns {{ items: Array<[string, Element|null]>, truncated: boolean, mode: string }}
     */
    function resolveTargets(selectors) {
        // 1. Explicit selectors win: report every matching element.
        if (selectors && selectors.length) {
            const items = [];
            selectors.forEach((sel) => {
                const matches = safeQueryAll(sel);
                if (!matches.length) { items.push([sel, null]); return; }
                matches.forEach((el, i) => {
                    items.push([matches.length > 1 ? `${sel} [${i}]` : sel, el]);
                });
            });
            return { items, truncated: false, mode: 'selectors' };
        }

        // 2. Page-declared structural blocks (window.LOGSIZE_TARGETS).
        const declared = window.LOGSIZE_TARGETS;
        if (Array.isArray(declared) && declared.length) {
            const items = [['html', document.documentElement], ['body', document.body]];
            declared.forEach((entry) => {
                const sel = typeof entry === 'string' ? entry : (entry && entry.selector);
                const label = (entry && entry.label) || sel || '(invalid target)';
                if (!sel) { items.push([label, null]); return; }
                const matches = safeQueryAll(sel);
                if (!matches.length) { items.push([label, null]); return; }
                matches.forEach((el, i) => {
                    items.push([matches.length > 1 ? `${label} [${i}]` : label, el]);
                });
            });
            return { items, truncated: false, mode: 'LOGSIZE_TARGETS' };
        }

        // 3. Auto-detect: html + body, then only the misbehaving descendants.
        const items = [['html', document.documentElement], ['body', document.body]];
        const all = document.body ? document.body.querySelectorAll('*') : [];
        let count = 0;
        let truncated = false;
        for (let i = 0; i < all.length; i++) {
            if (!isMisbehaving(all[i])) continue;
            if (count >= AUTO_LIMIT) { truncated = true; break; }
            items.push([shortPath(all[i]), all[i]]);
            count++;
        }
        return { items, truncated, mode: 'auto-detect' };
    }

    /** Builds the full report string. */
    function buildReport(trigger, selectors) {
        const doc = document.documentElement;
        const body = document.body;
        const { items, truncated, mode } = resolveTargets(selectors);

        const header = [
            '==================== LAYOUT DUMP ======================',
            `trigger            : ${trigger}`,
            `mode               : ${mode}`,
            `time               : ${new Date().toISOString()}`,
            `window.inner W x H : ${window.innerWidth} x ${window.innerHeight}`,
            `visualViewport H   : ${window.visualViewport ? px(window.visualViewport.height) : 'n/a'}`,
            `documentElement    : clientH=${doc.clientHeight} scrollH=${doc.scrollHeight} | clientW=${doc.clientWidth} scrollW=${doc.scrollWidth}`,
            `body               : clientH=${body.clientHeight} scrollH=${body.scrollHeight} offsetH=${body.offsetHeight}`,
            `page vs viewport   : taller by ${px(doc.scrollHeight - window.innerHeight)}px, wider by ${px(doc.scrollWidth - window.innerWidth)}px`,
            `current scrollY    : ${px(window.scrollY)}`,
            `devicePixelRatio   : ${window.devicePixelRatio}`
        ];

        // Optional media-query reporting (set window.LOGSIZE_MEDIA on the page).
        if (Array.isArray(window.LOGSIZE_MEDIA)) {
            window.LOGSIZE_MEDIA.forEach((q) => {
                header.push(`media match        : ${q} => ${window.matchMedia(q).matches}`);
            });
        }

        header.push('------------------- blocks (DOM order) ----------------');

        const blocks = items.map(([l, e]) => line(l, e)).join('\n');
        const note = truncated
            ? `\n(only the first ${AUTO_LIMIT} misbehaving elements are shown — fix these first, then re-run)`
            : '';

        const out = `${header.join('\n')}\n${blocks}${note}\n=======================================================`;
        window.__lastLogsizeDump = out;
        return out;
    }

    /** Prints the dump (and copies it to the clipboard when allowed). */
    function emit(selectors) {
        const trigger = (selectors && selectors.length)
            ? `manual + selectors (${selectors.join(', ')})`
            : 'manual (logsize / dumpLayout)';
        const report = buildReport(trigger, selectors);
        console.log(report);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(report).then(
                    () => console.log('[logsize] report copied to clipboard ✔ — paste it back.'),
                    () => { /* clipboard blocked on file:// without focus — copy manually */ }
                );
            }
        } catch { /* ignore */ }
        return report;
    }

    /**
     * Public manual entry point — the ONLY thing that prints a dump.
     * @param {...string} selectors optional CSS selectors to report.
     */
    function dumpLayout() {
        const selectors = Array.prototype.slice.call(arguments).filter((s) => typeof s === 'string');
        emit(selectors);
        return '[logsize] dumped above ✔';
    }
    window.dumpLayout = dumpLayout;

    // Console command: just type  logsize  (no parentheses) and press Enter.
    // A getter is used so a bare word triggers it. NOTE: `log-size` with a hyphen
    // CANNOT work — the console parses it as the subtraction `log - size`, so the
    // command has to be a single identifier (`logsize` / `logSize`).
    ['logsize', 'logSize'].forEach((name) => {
        try {
            Object.defineProperty(window, name, {
                configurable: true,
                get() { return dumpLayout(); }
            });
        } catch { /* ignore */ }
    });

    // ---- OPT-IN auto-logging (default OFF) ----------------------------------
    // logsizeWatch() prints a fresh dump ~300ms after the layout settles (resize
    // + ResizeObserver on the reported targets), de-duplicated so an unchanged
    // layout stays quiet. NONE of this runs unless you call logsizeWatch().
    let watchTimer = null;
    let resizeObserver = null;
    let lastSignature = '';

    /** Strips the volatile "time" line so identical layouts dedupe. */
    function signatureOf(report) { return report.replace(/^time +: .*$/m, ''); }

    function scheduleWatchDump() {
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
            watchTimer = null;
            const report = buildReport('watch (auto)', []);
            const sig = signatureOf(report);
            if (sig === lastSignature) return; // unchanged — stay quiet
            lastSignature = sig;
            console.log(report);
        }, 300);
    }

    /** Opt into debounced + deduped auto-logging. */
    function logsizeWatch() {
        window.addEventListener('resize', scheduleWatchDump);
        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(scheduleWatchDump);
            resolveTargets([]).items.forEach(([, el]) => { if (el) resizeObserver.observe(el); });
        }
        scheduleWatchDump();
        return '[logsize] watching (debounced ~300ms, deduped). Call logsizeUnwatch() to stop.';
    }

    /** Stop the opt-in auto-logging. */
    function logsizeUnwatch() {
        window.removeEventListener('resize', scheduleWatchDump);
        if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
        if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; }
        lastSignature = '';
        return '[logsize] stopped watching.';
    }
    window.logsizeWatch = logsizeWatch;
    window.logsizeUnwatch = logsizeUnwatch;

    // Quiet by default: no dump on load, resize, or keypress — only the explicit
    // `logsize` / `dumpLayout()` command prints. (One short hint line below.)
    console.log('[logsize] ready (quiet). Type  logsize  in the console and press Enter to dump.');
})();
