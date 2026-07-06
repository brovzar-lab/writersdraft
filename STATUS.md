# STATUS — Ten-Minute Pro Test (audit items 7, 8, 10 + durability)

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
