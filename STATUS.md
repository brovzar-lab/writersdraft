# STATUS — Trust Cluster (audit items 1–6 + 9)

Three workstreams, one commit each, in order. Roll back to any commit and the
app is green at that point.

| Commit | Workstream |
| --- | --- |
| `b32bfd0` | A — Data integrity |
| `768e5fc` | B — Feature-length performance |
| `3eb927b` | C — Paginator-truth rendering, print, orphaned cue |

## How to run

```bash
npm install
npm run dev          # app on http://localhost:5173
npm test             # 126 tests (engine, stores, codec, equivalence)
npm run build        # typecheck + production build
npm run emulators    # Firebase emulator suite (needed for cloud features in dev)
```

One command builds and runs; without `VITE_FIREBASE_*` env vars the app
targets the local emulators and works fully offline either way.

## Workstream A — Data integrity (items 1, 2, 6)

**Changed**
- **IndexedDB is the durable local store** (`src/storage/local.ts`): scripts,
  delta-encoded timelines, and meta in DB `writersdraft`, with a localStorage
  fallback when IndexedDB is unavailable. The legacy localStorage save is
  migrated once and deliberately left in place; a script-only localStorage
  mirror is still written per save as belt-and-braces.
- **Remote saves can no longer destroy local work** (`receiveRemote` in
  `scriptStore.ts`): a remote snapshot applies only when the local store is
  clean, and applying pushes the pre-remote state onto the undo stack. A
  remote over unsaved work parks in a conflict banner (Keep mine / Load
  theirs; "theirs" keeps yours one Undo away). Remotes are judged against
  `lastSyncedAt`, not the local typing timestamp — the e2e test proved that
  during concurrent typing the old comparison silently discarded the
  collaborator's version.
- **Version timeline** (`src/engine/timelineCodec.ts`): prefix/suffix deltas
  with keyframes every 10 entries at rest, pruned oldest-first to an 8MB byte
  budget; automatic snapshots at most every 5 minutes (manual, sprint and
  lock snapshots always record). Timeline persistence is a separate write in
  a separate failure domain — it can no longer take the script save down
  with it.
- **Cloud recovery**: script id lives in the URL (`#/s/<id>`); unknown ids
  are fetched from Firestore after sign-in (retried when auth changes);
  anonymous sessions can link an email/password account (same uid, so cloud
  docs survive cleared site data); a Library view lists local + cloud-only
  scripts with open/create/delete.
- `saveScript` no longer uses `merge:true` (sceneMeta resurrection bug dead).
- One **ErrorBoundary** persists the draft on crash and offers a JSON
  download; `migrateScript` validates and repairs every shape (garbage,
  wrong types, foreign fields) before anything reaches the store.
- Found en route: Ctrl+Z no longer hijacks native undo in textareas/inputs;
  Fountain imports persist before the first edit; Firestore listeners handle
  stream errors.

**Verified**: 24 store/codec unit tests incl. five remote-conflict
regressions; Playwright smoke (IndexedDB persistence, survives
`localStorage.clear()`, library, deep links, legacy migration); emulator e2e
(account linking, new-device recovery via URL + sign-in, live sync with undo
preserved, conflict banner during concurrent typing, keep-mine convergence).

## Workstream B — Performance at feature length (item 3)

**Changed**
- `ElementBlock` uses narrow selectors + `memo`: a keystroke re-renders one
  block, not 2,870. App/Toolbar/StatusBar/SceneNavigator narrowed the same
  way; App itself no longer re-renders while typing (autosave debounce moved
  to a store subscription).
- One pagination per keystroke via `PaginationProvider`, using
  `paginateIncremental` (`src/engine/pagination.ts`): pages before the edit
  point are reused by object identity; falls back to the pure `paginate()`
  whenever unsure. Equivalence with the full paginator is property-tested
  across 300 chained random edits. `elementLines` memoized by element
  identity (WeakMap; elements are immutable so the cache is exact).
- Pages virtualized: only pages near the viewport (or holding the
  active/caret-target element) mount their contentEditables.

**Measured** (117-page / 2,870-element script, headless Chromium, dev build):
mounted blocks 2,870 → **24**; per-keystroke JS avg 4.1ms → **1.2ms**, max
16.6ms → 4.4ms. Navigator jumps and Enter-at-page-boundary work under
virtualization.

## Workstream C — What you see is what prints (items 4, 5, 9)

**Changed**
- The editor page renders **from the paginator's PageLine output**: cue hugs
  dialogue (0px gap — verified by bounding-box in the smoke), scene headings
  get their two clear lines, and (MORE)/CHARACTER (CONT'D) draw at page
  breaks on screen.
- **Real print path** (`src/components/PrintView.tsx`): title page plus
  fixed 55-line US Letter pages from the same `paginate()` output — page
  numbers from page 2, scene numbers on locked headings (both margins),
  right-aligned transitions, forced black-on-white (dark-mode print fixed).
  Print button, Ctrl+P and browser-menu print all route through it;
  Save-as-PDF emits a submittable screenplay (PDF page count verified
  against the paginator).
- **Orphaned-cue bug fixed** in the paginator: a flushing dialogue/
  parenthetical carries its trailing cue (and parentheticals) to the next
  page. Three regression tests (short dialogue, cue+parenthetical, long
  dialogue). The incremental paginator's reuse rule was tightened to match
  (decision-horizon check) — caught by the equivalence property test.

## Deferred / known limitations (by design of this run)

- **Concurrent edits still resolve whole-document** after the banner (the
  losing side is one Undo away, never silently gone). True merge/CRDT is the
  Phase 4 collaboration feature.
- **An element that spans a page break renders whole on its start page** in
  the editor (a contentEditable can't split across pages); the break markers
  show the paginator's split and print is exact.
- **Account linking is email/password only**; Google/OAuth needs provider
  config in the Firebase project.
- **`firestore.rules` hardening (audit item 10) was not in scope** and
  remains as audited — do this before any public deploy.
- A known firebase-js-sdk internal assertion can log once to the console
  when auth changes under an active denied listener; streams re-establish,
  state is unaffected.
- Two tabs of the same browser still race (audit finding outside items 1–6/9);
  the conflict banner now catches the cloud echo of that race, but a
  BroadcastChannel tab-lock is the real fix.

## Needs your attention

1. **Set real `VITE_FIREBASE_*` env vars** (and deploy `firestore.rules`) to
   turn on production cloud sync; until then cloud features run against the
   emulator and the app is otherwise local-first.
2. Decide whether "Keep mine / Load theirs" wording matches your voice —
   it's the one user-facing surface added by the conflict guard.
3. ASSUMPTIONS.md logs every open decision I closed; skim it once.
