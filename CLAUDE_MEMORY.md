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

## FD-style state machine transitions used
Enter: scene→action, action→action, char→dialogue, dialogue→action, paren→dialogue, transition→scene. Tab: action→character, char→transition, dialogue→parenthetical. Empty element + Enter = transform to action (escape hatch); empty + Tab = transform in place.
