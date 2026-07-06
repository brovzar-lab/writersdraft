# CLAUDE_MEMORY

Running lessons for WritersDraft. One lesson per entry, one-line summary first; update in place, delete anything proven wrong.

## Closure aliasing broke pagination
Never pass a reassignable array into a helper — pass push/flush closures instead. `paginateDialogue` held a stale reference to `current` after `flushPage()` reassigned it, so post-break dialogue lines landed on an already-flushed page (page grew past 55 lines). Fixed by routing all mutation through `push()`/`flushPage()` closures in `src/engine/pagination.ts`.

## Vite CSS imports need vite-env.d.ts
`tsc -b` fails on `import './index.css'` unless `src/vite-env.d.ts` contains `/// <reference types="vite/client" />`.

## Firebase emulators in this container need explicit 127.0.0.1 host
The sandbox has no IPv6; without `"host": "127.0.0.1"` in firebase.json the emulators warn on `::1` port probes. Java 21 is preinstalled; `firebase emulators:exec --project demo-*` works headless and downloads the Firestore JAR on first run.

## contentEditable + React: keep it uncontrolled
Don't render the text as JSX children. Sync `div.textContent` in an effect only when it differs from store text (self-edits already match, which preserves the caret), and hand off caret positions between blocks via `uiStore.pendingCaret`.

## Industry layout constants (Courier 12pt, US Letter)
10 chars/inch, 6 lines/inch, 55 body lines/page. Margins 1.5" left, 1" right/top/bottom. Indents in chars from left margin: action 0/60 wide, dialogue 10/35, parenthetical 16/25, character 22, transition right-aligned. Scene headings get 2 blank lines before, most other blocks 1, dialogue group 0.

## autoFocus vs effect-blur ordering
React autoFocus fires at commit; a same-open effect that calls document.activeElement.blur() runs AFTER it and steals focus from the element you just focused. Blur the previous element synchronously in the event handler that opens the overlay, never in the overlay's mount effect.

## zoom-based page scaling must measure the un-zoomed parent
`zoom` participates in layout, so it's right for scaling the script page (caret/virtualization keep working) — but a ResizeObserver on the zoomed element reports its own scaled coordinate space and feeds back. Observe the scroll parent.

## Tokens are the only palette
All chrome colors are semantic CSS vars (--desk/--ink/--brass/--viz-*) flipped by .dark and mapped via Tailwind v4 `@theme inline`. Contrast values were computed (ink-faint ≥4.5:1 on every desk surface); axe-core runs in smoke-a11y.mjs — keep it at zero critical/serious. Never reintroduce raw gray-*/blue-* classes.

## Emulators break networkidle waits
Once the Firebase emulators are up, the app holds a live Firestore stream, so Playwright `waitUntil: 'networkidle'` never resolves. Always use `waitUntil: 'load'` + `waitForSelector('[data-element-type]')` in smokes.

## sanitizeElement is a whitelist — new ScriptElement fields need explicit passes
Any field added to ScriptElement (e.g. `dual`) is silently stripped on every IndexedDB/Firestore round trip until `sanitizeElement` in scriptStore.ts learns it. Add a migrate regression test with each new field.

## FDX facts that matter
Paragraph `Type` attr maps 1:1 to our element types; scene numbers are `Number` attrs; dual dialogue is a `<DualDialogue>` wrapper (2nd Character cue starts the right column); notes are `<ScriptNote><Paragraph>…` inside the owning paragraph; FDX paragraphs cannot hard-break (flatten \n → space). Never emit SmartType/ElementSettings on export — FD regenerates them. rules-unit-testing v4 pairs with firebase 11 (v5 needs 12).

## Rules-enforced client discipline
firestore.rules makes ownerId immutable and requires creates to batch a userMeta lastCreateAt=request.time bump (getAfter). sync.ts must therefore (a) track real owners from loads and never stamp the current uid over them, (b) writeBatch creates with the limiter bump. Presence writes are denied until the parent script doc exists (best-effort catch handles it).

## Playwright smoke test is the real editor gate
Unit tests can't catch contentEditable focus/caret wiring; drive the dev server with playwright-core (`executablePath: '/opt/pw-browsers/chromium'`, `--no-sandbox`) and assert `document.activeElement`'s `data-element-type` after each Enter/Tab. Chrome's automatic /favicon.ico request 404s against Vite — use a data-URI favicon to keep the console clean. Script lives at scratchpad/smoke.mjs.

## FD-style state machine transitions used
Enter: scene→action, action→action, char→dialogue, dialogue→action, paren→dialogue, transition→scene. Tab: action→character, char→transition, dialogue→parenthetical. Empty element + Enter = transform to action (escape hatch); empty + Tab = transform in place.
