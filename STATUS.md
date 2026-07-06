# STATUS

## Studio Frame redesign (latest — REVIEW IN BROWSER BEFORE MERGE)

Implemented the "Studio Frame" editor-shell redesign from
`design_handoff_studio_frame/` (4 HTML mocks + README). A fixed two-tone
system — **dark chrome framing a light script body** — that supersedes the
Instrument re-skin for the editor shell. Committed to the working branch as a
reviewable checkpoint; the handoff asks for an in-browser review
(`npm run dev`) before merge. Script-page dimensions, Courier Prime and the
paginator are untouched, per the brief.

- **Chrome**: two dark rows + dark status bar (`#111827` / `#1f2937` /
  `#374151`), IBM Plex Sans (Courier Prime stays on the page/title/print).
  Row 1 = logo · menu bar · sync pill · presence · Sprint. Row 2 = element
  dropdown · ⌘K chip · centered view tabs · draft/revision chip · Notes.
- **`MenuBar.tsx` (new)**: File/Edit/View/Production/Tools/Help dropdowns
  mapping onto existing features, with keyboard nav, Export/Revision-color
  submenus, and a shortcuts/about modal.
- **SceneNavigator**: storyline-dot + character filters, act headers (derived
  3-act by page proportion), drag-reorder (`moveScene`), act-progress footer.
- **`InspectorPanel.tsx` (new — absorbs NotesPanel)**: for the active scene —
  synopsis (`setSceneMeta`), storyline/tags, open notes, in-scene characters +
  speech counts, revision swatch cycle.
- **StatusBar** (dark): page/words/scenes/runtime (~1 min per page) ·
  today-delta · sprint · element-flow hints · save state · honest storage
  indicator (kept from workstream G).
- **CommandPalette**: JUMP TO / COMMANDS groups, Courier scene numbers,
  element-change / export / lock / sprint commands; no-keystroke-leak intact.
- **ElementBlock**: character autocomplete popover (avatar + speech counts +
  "New character" row), gutter "+" type control, open-note highlight, blue
  caret, right-margin revision asterisk (`changedSinceLock`).
- **ScriptEditor**: Pages⇄Flow toggle (Flow = continuous, un-virtualized),
  locked revision strip + asterisks, typewriter Focus mode (warm paper,
  distance dimming, centered current line, sprint HUD).
- **Derived read-models** (`src/engine/analysis.ts`, pure + unit-tested):
  `charactersInScene`, `wordsToday`, `changedSinceLock`, `checkFormatting`.
  New store action `renameCharacter`. New uiStore state: `viewMode`, nav
  filters, `showSceneNumbers`. **Dark body theme is parked** (fixed two-tone).
- **Guest banner removed**; its honest "device-only draft / create account"
  wording moved into the Row-1 sync-pill popover (`AccountMenu`).
- **Verified**: 179 unit tests (171 + 8 new derived-model tests), `tsc`,
  production build, and a live Chromium pass screenshotting the shell, File
  menu, ⌘K palette, Flow, locked/revision and Focus — zero React/runtime
  errors (only the expected emulator connection refusals). One real bug caught
  in-browser and fixed: a filter-in-selector in the presence chip looped
  `useSyncExternalStore` (now `useShallow`).
- Judgment calls logged in ASSUMPTIONS.md.

## Instrument design system re-skin (previous — superseded by Studio Frame for the editor shell)

Applied the user-provided Instrument design brief (styling only; no data,
logic, or feature changes). This replaces the warm "writer's-desk" look
from Phase 3 with a cool cobalt/navy system. **Committed to the feature
branch as a reviewable checkpoint — not finalized.** The brief asked to
review in the browser before finalizing.

- Cool palette: `#EAECF1` desk, white paper, `#0B0D12` ink, one cobalt
  accent (`#2B54F0`) on primary/active only, data set (blue/violet/teal/
  coral) for charts + scene-coding, semantic soft-pairs for alerts. Dark
  twin is Midnight navy `#0E1426`, never black.
- Schibsted Grotesk chrome + global tabular figures. No Playfair (user
  chose neutral sans). **Courier Prime kept on the screenplay page, title
  page, and print** — screenwriting formatting, not chrome.
- Cards get two-layer shadows (no hairline-only cards; dark adds a
  border); primary button gets the cobalt glow + scale(0.97) press;
  accent discipline enforced (pulled cobalt off logo/sprint/arrows).
- Beat-board/tag/collaborator swatches moved from amber/red to the data
  set; semantic colors never render as small text (on-* soft pairing).
- Dark defaults from `prefers-color-scheme`, header toggle overrides.
- Verified: 171 tests, tsc, build, all six behavior smokes, axe-core
  WCAG AA = zero violations (light + dark). Two brief-consistent contrast
  fixes: spec `--ink-3` darkened for AA; warning status text → soft pair.
- Judgment calls logged in ASSUMPTIONS.md.

## Phase 3 — UI/UX (workstreams H–K), previous run

Writer's-desk visual direction: warm paper/ink/brass, the page always reads
as paper, the chrome recedes. One green commit per workstream.

- **H — Design system**: semantic tokens (light + dark as selected themes,
  not inversions) mapped into Tailwind v4; Inter UI font; inline SVG icon
  set replacing every emoji; UI kit (Button/Menu/Toast/tooltips) with
  outside-click + Escape menus; global focus rings; full component refit.
- **I — Editor experience**: SmartType autocomplete (character names,
  extensions, INT./EXT. + known locations + times, transitions — harvested
  from the script itself; 13 engine tests); Ctrl+K command palette (scene
  jump, views, commands) with a proven no-keystroke-leak guarantee;
  element-type pill in the page gutter; "page N of M" indicator.
- **J — Views + first-run**: cheat card teaching the five keystrokes with
  a one-click sample scene (typed elements, single undo); purposeful empty
  states everywhere; Library cards; Analytics rebuilt with a
  six-check-validated palette (light AND dark) — composition bar + bar
  table that doubles as the accessible table view.
- **K — Responsive + a11y**: navigator drawer below lg; page auto-scales
  (readable at 500px, no horizontal scroll); toolbar overflow menu;
  axe-core WCAG A+AA = ZERO violations of any severity across all seven
  views light + dark spot-checks; contrast fixed at token level (computed);
  keyboard-operable menus.

Verified per workstream and at the end: 171 unit tests + 20 rules tests,
tsc, build, six behavior smokes + a11y smoke, screenshots light/dark/800px/
500px. Deferred from Phase 3: true mobile *editing* (contentEditable on
touch is its own project — mobile *reading* works), side-by-side dual
dialogue rendering, onboarding tour beyond the cheat card.

---

# Previous run — Ten-Minute Pro Test (audit items 7, 8, 10 + durability)

Follows the trust cluster (items 1–6, 9; commits `b32bfd0`…`3eb927b`).
Four workstreams, one commit each — roll back to any commit and the app is
green at that point.

| Commit | Workstream |
| --- | --- |
| `git log --grep "Workstream D"` | D — Final Draft (.fdx) interop |
| `git log --grep "Workstream E"` | E — Paste pipeline + cross-block selection |
| `git log --grep "Workstream F"` | F — Firestore rules hardening + rules tests |
| `git log --grep "Workstream G"` | G — Storage persistence + honest account state |

## How to run

```bash
npm install
npm run dev          # app on http://localhost:5173
npm test             # 158 unit tests (engine, stores, codecs, clipboard)
npm run test:rules   # 20 Firestore security-rules tests (spawns the emulator)
npm run build        # typecheck + production build
npm run emulators    # Firebase emulator suite (cloud features in dev)
```

## The ten-minute test, verified end to end

- **Import a .fdx** → renders correctly on screen (types, scene numbers,
  dual-dialogue marks, notes in the notes panel, navigator) and in print
  (title page + 55-line body pages; a real PDF was emitted and checked).
- **Paste a raw script** → splits into correctly typed elements (scene
  heading / action / cue / parenthetical / dialogue / transition / shot),
  one undo step.
- **Export a .fdx** → minimal, well-formed XML (XMLValidator-clean); FD's
  self-regenerated sections deliberately omitted.
- **Print** → re-verified post-changes (imported-FDX → PDF, page count and
  content checked).
- **Rules emulator tests** → 20/20 pass.

## Workstream D — FDX interop (item 7)

- `src/engine/fdx.ts`: import maps FDX typed paragraphs 1:1 onto the
  element model; preserves what Fountain drops — scene numbers (incl.
  `2A`), dual dialogue (`<DualDialogue>` → `dual:'left'|'right'` marks on
  elements), script notes (`<ScriptNote>` → notes attached to their
  element), title page (title / by-line / draft date / contact heuristic).
- Export emits clean, minimal, hand-built XML. FD-regenerated sections
  (SmartType, ElementSettings, SceneProperties, HeaderAndFooter) are
  ignored on import and omitted on export. Internal newlines flatten to
  spaces — the one lossy step (FDX paragraphs cannot hard-break).
- Two real fixtures (`src/engine/__fixtures__/`): short.fdx (entities,
  ignored sections, full title page) and dual.fdx (dual dialogue, scene
  numbers, a ScriptNote). Round-trip tests assert import → export →
  re-import structural equivalence on both.
- `sanitizeElement` preserves `dual` (found en route: every storage round
  trip silently stripped it before).
- Toolbar: Export dropdown (.fdx / .fountain), Import accepts .fdx.
- **Your final proof**: export from the app and open in real Final Draft —
  the XML is standards-shaped, but FD itself is the only true oracle.

## Workstream E — Input fidelity (item 8)

- **Paste**: all pastes are plain-text-forced; multi-line text runs
  through `parseFountainBody` (extracted from the Fountain importer, plus
  shot detection) and splits into typed elements. Single-line pastes
  insert literally. One history entry either way.
- **Cross-block selection**: capture-phase handlers on the editor
  container intercept only selections that span blocks, and re-express the
  edit as store ops — `deleteRange` (direction-normalising; when the range
  starts at offset 0 the survivor takes the END element's type, so cutting
  a cue never leaves a character-typed shell), `pasteElements`
  (split-at-caret insert with optional replace span), `extractRange`
  (pure). Copy/cut serialize the range as Fountain so element types
  survive the clipboard; typing over a spanning selection replaces it.
- Proven in a real browser: selection spanning scene heading → action →
  cue → parenthetical → dialogue; Backspace, cut, copy, paste-back, and
  type-over all behave; range ops are single undo steps.

## Workstream F — Firestore rules (item 10)

- Reads scoped to participants (owner/collaborators) everywhere including
  presence; the dead-but-open `/history` rules are **removed**.
- `ownerId` immutable on update; only the owner edits `collaborators` or
  deletes; presence docs are shape-validated and writable only as
  yourself, only by participants.
- Schema/size validation (field allowlist, embedded id must match doc id,
  elements ≤ 20000, bounded titles/tags/notes/docs, collaborators ≤ 25).
- Create rate limiting: a create must batch a `userMeta/{uid}.lastCreateAt
  = request.time` bump (verified via `getAfter`) with the previous bump
  ≥ 5s old — one create per 5s per account, enforced by rules alone.
- Client cooperation (`sync.ts`): saves never stamp the current uid over
  an existing owner (a collaborator's save now survives); genuine creates
  batch the limiter bump.
- 20 rules tests (`npm run test:rules`): outsider denial, hijack attempts,
  collaborator limits, shape rejection, spam-create rejection, presence
  scoping, history removal. Live smoke: the real app creates/updates/
  presence-beats under the hardened rules with zero denials.

## Workstream G — Durability holes

- `navigator.storage.persist()` requested on the first successful save;
  the **browser's answer is surfaced** in the status bar (🛡 protected /
  ⚠ evictable with an explanatory tooltip) instead of assumed.
- Guest banner: while anonymous (or fully offline) a dismissible banner
  says plainly that the draft lives only in this browser and its "Create
  account" button opens the existing linking form. Recovery no longer
  depends on a step the user never knew to take.

## Deferred / known limitations

- **Revision marks** (change asterisks per revision color) and **full
  production locking semantics** (locked page numbering, A-pages) remain
  future work; scene numbering + revision-color cycling exist.
- **Real concurrent merge** (CRDT/OT) — conflicts still resolve
  whole-document behind the conflict banner, losing side one Undo away.
- **Dual dialogue renders sequentially** in the editor and print (marks
  are preserved and round-trip through FDX; side-by-side layout is a
  rendering feature, not a data feature, and can come later).
- FDX export flattens intra-element newlines to spaces.
- FDX title-page import is heuristic (title / "written by" / date /
  left-aligned contact); foreign layouts degrade gracefully to title-only.
- Create rate-limit (1 per 5s) can delay the cloud copy of a
  second-import-within-5s until the next autosave retry; local saves are
  unaffected.
- Two tabs of the same browser still race (BroadcastChannel tab-lock is
  the real fix; the conflict banner catches the cloud echo).

## Needs your hands

1. **Open an exported .fdx in actual Final Draft** — the round trip and
   XML validation are machine-proven; FD acceptance is the final oracle.
2. **Deploy `firestore.rules`** (now hardened) with real `VITE_FIREBASE_*`
   env vars when you take cloud sync to production.
3. The guest banner + storage-evictable wording is user-facing copy —
   check it matches your voice.
