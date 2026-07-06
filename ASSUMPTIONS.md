# ASSUMPTIONS

Decisions made where the audit report left the choice open. Each picked the
safer option for the writer's draft.

## Studio Frame redesign — judgment calls

- **Dark *body* theme parked.** Studio Frame is a fixed two-tone system (dark
  chrome + light body), so the automatic `prefers-color-scheme` dark mode and
  the `.dark` token twin were removed for this pass; the View→Dark menu item
  is a placeholder that toasts "coming later". Re-add a purpose-built dark
  body theme when wanted — don't just re-enable the old navy twin.
- **Three "derived" chrome features reuse existing data, no schema change:**
  runtime = page count (~1 min/page); **Today +words** = current words minus
  the last version-timeline snapshot before local midnight (earliest snapshot
  if writing started today; 0 with no snapshots — can go negative on a cut
  day); **revision asterisks / changed-pages** = diff of current elements vs.
  the most recent "Locked for production" timeline snapshot, matched by id;
  **acts** = classic three-act page proportions (25/50/25), not stored data.
- **Revision strip color** is drawn in accent-light (blue) regardless of the
  revision color, so a "white" revision strip stays visible; the strip means
  "locked production draft in revision", the swatch cycle carries the color.
- **Guest banner → sync-pill popover.** The brief removed the standalone guest
  banner; its honest "this draft lives only in this browser / create account"
  wording moved verbatim into the Row-1 sync-pill popover. The promise didn't
  change, only its location.
- **Flow view is not virtualized** (Pages view still is). Flow renders every
  element continuously; on a feature-length script that is heavier than Pages.
  Acceptable for a deliberate reading/writing mode; revisit if it drags.
- **New menu features are real, minimal implementations**, not stubs:
  `renameCharacter` (rewrites matching cues, one history entry, extensions
  preserved), `checkFormatting` (empty headings / cues w/o dialogue / orphan
  dialogue), "Find…" opens the ⌘K palette (the search surface). "Scene
  numbers" toggles a `showSceneNumbers` display flag (numbers still originate
  from locking).
- **Storyline vs. tags**: the scene's beat-board color is the "storyline"
  (the navigator dot + filter); the inspector's "Storyline & tags" pills are
  the script's tags toggled per element. No separate storyline-name model.
- **Inspector defaults open** (`notesOpen: true`) so the shell reads as the
  three-column mock on first load.

## Instrument re-skin — judgment calls

- **Courier Prime stays on the screenplay page, title page, and print.**
  The design brief says "styling only, don't touch features"; the
  monospace screenplay IS the feature (1-page-per-minute timing), so the
  page keeps Courier while all chrome moves to Schibsted.
- **Playfair Display dropped entirely** (brief specified it for titles).
  User chose "neutral sans" — titles are bold Schibsted. Re-addable on
  marketing/title surfaces if wanted; never on the script.
- **Spec `--ink-3` (#9298a4) darkened** to #636975 (light) / #8493ad
  (dark) so small text clears WCAG AA — the exact hex failed contrast.
  Kept the brief's own spirit ("push the contrast, never too thin").
- **Semantic colors as small text → on-* soft pairing** (the brief's own
  rule); full-strength warning/error/success only on icons and dots.
- **Beat-board / tag / collaborator-cursor palettes** swapped from warm
  (amber/red) to the data set — categories use data hues per the brief.
- **Dark-mode script page is navy** (`#16203A`), not paper-white —
  standard for dark editors; trivially changed to stay white if desired.
- **Not merged/deployed**: committed to the feature branch only, pending
  the user's in-browser review the brief asked for.

## Phase 3 (H–K) — UI/UX

- **Visual direction is "writer's desk"** (user-selected): warm paper/ink/
  brass; dark mode is a dim room where the page stays warm — both themes
  are hand-selected token sets, never automatic inversions.
- **Semantic tokens over dark: variants**: components use bg-desk/text-ink/
  border-line etc.; the .dark class flips the variables. New components
  must use tokens, not raw palette classes.
- **SmartType accept keys are Enter AND Tab** (FD behavior); with no popup
  open the state machine is untouched. Enter-after-accept advances.
- **Palette-open blurs the editor synchronously** in the Ctrl+K handler;
  the input autoFocuses at commit. An effect-time blur is forbidden (it
  fires after autoFocus and steals focus from the input — found the hard way).
- **Gender chart palette**: 3 chromatic hues validated per mode +
  a neutral "Other" slot for 'unspecified' with label relief; the bar
  table doubles as the table view. Charts must keep using --viz-* tokens.
- **Contrast is computed, not eyeballed**: ink-faint/brass were chosen to
  clear 4.5:1 on every desk surface; if a new surface is added, re-check.
- **Page scaling uses zoom, measured on the un-zoomed parent** — measuring
  the zoomed container is a feedback loop. Mobile editing is out of scope;
  mobile reading is in.

## Workstream D — FDX interop

- **Dual dialogue is data, not layout, in this run**: `<DualDialogue>`
  imports to `dual:'left'|'right'` marks that round-trip through storage and
  FDX export; the editor and print render the two columns sequentially.
  Side-by-side rendering is deferred (layout feature, no data loss).
- **FDX export omits FD-regenerated sections** (SmartType, ElementSettings,
  SceneProperties, HeaderAndFooter, Revisions) — emitting stale copies is how
  exporters corrupt FD documents; Final Draft rebuilds them on open.
- **Intra-element newlines flatten to spaces on FDX export** — FDX paragraphs
  cannot carry hard line breaks; this is the only lossy step and the editor
  almost never produces such newlines.
- **Title-page mapping is heuristic**: exported as centered title / "written
  by" / author / draft date + left-aligned contact lines; import inverts that
  exactly and degrades to title-only for foreign layouts.
- **Notes map to `<ScriptNote>` inside the owning paragraph**; note author
  and timestamps don't exist in FDX and are reset on import ('Final Draft').
  Tags have no standard FDX home and intentionally do not export.

## Workstream E — Input fidelity

- **Single-line pastes insert literally** (no type auto-detection) — matching
  FD; only multi-line pastes run the parser. Predictability over cleverness.
- **Enter over a cross-block selection deletes it only**; the caret lands at
  the join and the next Enter splits via the state machine. (Real editors do
  both in one keystroke; the two-step keeps range ops atomic in history.)
- **Cross-block paste-over-selection is two history entries** (delete, then
  insert); in-block paste-over-selection is one. Accepted trade for reusing
  the two atomic primitives.
- **deleteRange survivor type**: when the selection starts at offset 0 the
  start element is consumed whole, so the survivor keeps the END element's
  type/identity (cutting a cue must not leave a character-typed shell).

## Workstream F — Firestore rules

- **Rate limit = 1 script create per 5s per account**, enforced purely in
  rules via a batched `userMeta` bump + `getAfter`. A second import within
  5s gets its cloud copy on the next autosave retry; local saves never wait.
- **Updates are not rate-limited** (autosave is 800ms-debounced and
  Firestore's 1 write/sec/doc guidance is the practical ceiling); the 1 MiB
  document cap is the byte backstop, rules bound the shape (field allowlist,
  elements ≤ 20000, collaborators ≤ 25).
- **Presence requires the parent script to exist** (participant check reads
  it), so the first heartbeat of a brand-new never-saved script is denied
  and swallowed by the best-effort catch; presence starts after first save.
- **savedAt/collaborators are allowed fields but the app doesn't yet set
  collaborators** — the rules are written for the sharing feature to land.

## Workstream G — Durability

- **persist() is requested once, on first successful save** (not on load) —
  the prompt-free browsers decide on engagement heuristics; asking at first
  real write is the honest moment. The answer is displayed, never assumed.
- **Guest banner dismissal is session-scoped** (returns next visit) — being
  forgettable would defeat its purpose; being permanent would nag.

## Workstream A — Data integrity

- **IndexedDB schema**: three object stores (`scripts` by id, `timelines` by
  script id, `meta` key/value) in DB `writersdraft` v1. When IndexedDB is
  unavailable the same API transparently falls back to namespaced
  localStorage keys, so persistence never silently disappears.
- **Legacy migration keeps the original**: the old `writersdraft:script`
  localStorage value is imported into IndexedDB once, then left in place as a
  safety net. Migration is never the step that loses a draft. A best-effort
  localStorage mirror of the current script (script only, never the timeline)
  is also written on each save as belt-and-braces.
- **Conflict semantics (minimum-viable, no CRDT per instructions)**: remote
  snapshots are judged against `lastSyncedAt` (the last version this session
  loaded from or wrote to the cloud), NOT the local typing timestamp — during
  concurrent editing the local clock always outruns the remote save, and the
  e2e test proved timestamp-vs-local comparison silently discards the
  collaborator's version. Clean store → remote applies, with the pre-remote
  state pushed onto the undo stack. Dirty store → banner; "Keep mine" stamps
  `max(now, remote.updatedAt + 1)` so a fast remote clock can't re-trigger
  the conflict; "Load theirs" keeps the local version one Undo away.
  Concurrent edits still resolve whole-document (last writer after the banner
  wins); true merging is Phase 4 work.
- **Timeline at rest**: full snapshots in memory (cheap via structural
  sharing), prefix/suffix deltas on disk with a keyframe every 10 entries,
  pruned oldest-first to an 8MB byte budget (newest entry always survives).
  Automatic snapshots at most every 5 minutes; manual, sprint-gather and
  production-lock snapshots always record. Timeline persistence is a separate
  write with a separate failure domain from the script save.
- **Account linking is email/password only** in this run. Google/OAuth
  linking needs provider configuration in the Firebase project; the
  `linkWithCredential` path used here preserves the uid, which is the part
  that matters for not orphaning cloud documents.
- **Library delete is local-only** and the currently open script cannot be
  deleted. A synced cloud copy is never deleted from the app.
- **Ctrl+Z scope**: native undo is restored in `<textarea>`/`<input>` fields
  (story bible, notes, synopses, title page); script undo everywhere else.
  Previously Ctrl+Z in a textarea invisibly mangled the screenplay.
- **Fountain import marks the store dirty and resets the timeline** so an
  imported script persists before the first edit (previously an import that
  was never edited was silently lost on reload).
- **Firestore listeners got error callbacks**; a known firebase-js-sdk
  internal assertion ("INTERNAL ASSERTION FAILED", fires when auth changes
  under an active denied watch stream) can still appear once in the console
  on sign-in. Streams re-establish and app state is unaffected; fixing the
  SDK is out of reach.
- **`firestore.rules` hardening (report item 10) is NOT in this run's scope**
  and remains as audited.

## Workstream B — Performance

- **Incremental pagination is additive**: `paginateIncremental` reuses whole
  pages from the previous run when it can prove them unaffected, and falls
  back to the pure `paginate()` (the audited oracle) whenever unsure.
  Equivalence with full pagination is property-tested over random edits.
- **Wrapped-line memoization keys on element object identity** (WeakMap);
  correctness does not depend on the cache, only speed.
- **Virtualization mounts pages near the viewport plus any page containing
  the active/caret-target element**; off-screen pages keep their true height
  via an 11in placeholder. Scene-navigator jumps force-mount the target page.

## Workstream C — Rendering & print

- **On-screen block spacing comes from the paginator's spaceBefore values**,
  and (MORE)/(CONT'D) markers render at page boundaries. An element that
  spans a page break renders whole (editable blocks can't be split across two
  contentEditables safely); the break markers show where the paginator splits
  it, and the print view is exact.
- **PDF = the browser's print-to-PDF over a print-exact DOM** rendered from
  `paginate()` output (55 fixed lines, letter size, title page first, forced
  black-on-white). A pdf-lib engine was judged unnecessary for a submittable
  PDF in this run.
