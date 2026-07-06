# WritersDraft

An industry-standard screenwriting web app in the spirit of Final Draft.
React 18 · Vite · TypeScript · Zustand · Tailwind CSS 4 · Firebase.

## Features

- **Tab/Enter state machine editor** — Final Draft element flow (Scene Heading,
  Action, Character, Dialogue, Parenthetical, Transition, Shot) with smart
  auto-detection (`INT.` → scene heading, `CUT TO:` → transition, `(` → parenthetical),
  Courier Prime 12pt and exact industry margins.
- **Real-time pagination** — 55 lines/page, US Letter, with (MORE)/(CONT'D)
  dialogue breaks, keep-with-next for headings and cues; the on-screen pages
  are produced by the same paginator that drives print/export.
- **Scene navigator** with page numbers, colors and synopses.
- **Beat Board** — drag-and-drop color-coded index cards that reorder the
  actual script.
- **Dialogue & gender analytics** — speeches, word counts, scene coverage
  per character, aggregated by gender.
- **Production workflow** — lock pages, scene numbering, revision color cycle
  (white → blue → pink → …).
- **Creative tracking** — tags with script filtering, localized notes,
  alternate dialogue lines.
- **Story Bible** — treatment, outline, character bios and research live in
  the same file as the screenplay.
- **Version timeline** — automatic restorable snapshots with page/word deltas;
  restores are themselves undoable.
- **Writing sprints** — one-click 15-minute sprint with a word goal that drops
  you into focus mode, then "gathers" the result as a snapshot.
- **Live presence** — collaborators' name badges appear on the element they're
  editing (via Firestore presence).
- **Focus mode**, dark mode, Fountain import/export, print-to-PDF.
- **Cloud sync** — anonymous Firebase auth + Firestore autosave with presence,
  fully optional: the app works 100% offline against localStorage.

## Development

```bash
npm install
npm run dev          # Vite dev server
npm test             # Vitest suite (state machine, pagination, stores)
npm run build        # typecheck + production build
npm run emulators    # Firebase emulator suite (auth + firestore)
```

The app auto-connects to the Firebase emulators when no
`VITE_FIREBASE_API_KEY` is configured.

## Keyboard

| Key | Action |
| --- | --- |
| Enter | Next element per flow (e.g. Character → Dialogue) |
| Tab | Sibling element (e.g. Action → Character) |
| Shift+Tab | Cycle element type backwards |
| Backspace at start | Merge with previous element |
| Ctrl/Cmd+Z / +Shift+Z | Undo / redo |
| Ctrl/Cmd+S | Save now |
| Ctrl/Cmd+Shift+F | Focus (distraction-free) mode, Esc exits |
