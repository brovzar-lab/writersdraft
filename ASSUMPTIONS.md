# ASSUMPTIONS

Decisions made during the trust-cluster work where the audit report left the
choice open. Each picked the safer option for the writer's draft.

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
