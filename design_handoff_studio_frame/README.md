# Handoff: WritersDraft "Studio Frame" redesign (final)

## Overview
A redesign of the WritersDraft screenwriting app's editor shell, chosen and refined across several rounds. Final direction:
- **Two-row dark header**: a classic **menu bar** (File · Edit · View · Production · Tools · Help) on top, and a second row with the **view tabs centered**, element selector + ⌘K on the left, draft/revision chip + Notes toggle on the right
- **Right-hand Inspector panel**: synopsis, storyline/tags, open notes, characters in scene, revision cycle
- **Richer scene navigator**: storyline dots, act headers, storyline/character filters, drag-to-reorder, act progress bar
- **Richer dark status bar**: page/word/scene counts, runtime, today's delta, sprint, element-flow hints, sync state
- **Editor features**: character autocomplete, gutter "+" element control, ⌘K command palette, typewriter focus mode, locked-script revision marks, Pages⇄Flow toggle, sync pill

## About the Design Files
The `.html` files here are **design references created in HTML** — static mocks showing intended look and behavior, not production code. The task is to **recreate them in the existing WritersDraft codebase** (React 18 + Vite + TypeScript + Zustand + Tailwind CSS 4), reusing its components, stores, and engines. Do not ship the HTML.

## Fidelity
**High-fidelity** for the chrome (header, menus, navigator, inspector, status bar, overlays). One caveat: **the script page in the mocks is rendered at reduced scale (600px wide) to fit the mock canvas.** In the real app the page keeps its existing industry-exact dimensions (`.script-page`: 8.5in × 11in, padding 1in/1in/1in/1.5in, Courier Prime 12pt, real paginator) — restyle only its surroundings (background `#eef0f2`, shadow `0 3px 12px rgba(17,24,39,.16)`).

## Files
- `01-editor-menubar.html` — **the definitive shell**: two-row header with the File menu open, navigator, page, inspector, status bar
- `02-editor-features.html` — same shell showing working-state features: navigator filters + act headers + drag handle, Pages⇄Flow toggle, gutter "+", character autocomplete popover, locked Blue-revision marks, sprint in status bar, revision cycle in inspector
- `03-command-palette.html` — ⌘K palette overlay (jump to scene / commands)
- `04-focus-mode.html` — typewriter focus mode
- Where 01 and 02 disagree on small details (01 shows the resting state, 02 the busy state), both are valid states of the same UI.

## Mapping to the existing codebase
| Design region | Existing file | Change |
| --- | --- | --- |
| Menu bar + second row | `src/components/Toolbar.tsx` | Rebuild as two rows (see spec) |
| Menus (File/Edit/…) | new `src/components/MenuBar.tsx` | Dropdown menus, keyboard accessible |
| Scene navigator | `src/components/SceneNavigator.tsx` | Restyle + filters, act headers, drag reorder, act progress |
| Inspector panel | new `src/components/InspectorPanel.tsx` | Absorbs `NotesPanel.tsx` |
| Status bar | `src/components/StatusBar.tsx` | Restyle + runtime, today-delta |
| Command palette | new `src/components/CommandPalette.tsx` | ⌘K overlay |
| Autocomplete | `src/components/ElementBlock.tsx` | Popover on character elements |
| Focus mode | `src/App.tsx` + `ScriptEditor.tsx` | Typewriter centering + dimming |
| Shell layout | `src/App.tsx` | Swap NotesPanel → InspectorPanel; backgrounds |

## Header spec (final — see 01)

### Row 1: menu bar
- `background:#111827`, padding 4px 14px, flex, gap 2px.
- Left: 18px blue logo square (`#3b82f6`, radius 4, Courier "W") + "WritersDraft" (12.5px, 600, `#f3f4f6`, "Draft" `#60a5fa`), 12px right margin.
- Menu triggers: 12px, padding 4px 11px; idle `#9ca3af`; open state `background:#374151`, white, radius 5px 5px 0 0. Items: **File, Edit, View, Production, Tools, Help**.
- Right (`margin-left:auto`, gap 8px): sync pill ("Synced" 11px `#4ade80` + 6px dot), presence (initials chip `#93c5fd`/`#1e3a8a` + "+1 here" 11px `#9ca3af`), **Sprint** button (`#3b82f6`, white, 600, 11.5px, radius 6, padding 3px 11px, `white-space:nowrap`).

### Row 2: context bar
- `background:#1f2937`, padding 6px 14px, flex, gap 12px, `position:relative`.
- Left: element-type dropdown (border `#374151`, radius 7, padding 4px 11px, 12px `#e5e7eb`) + ⌘K search chip (border `#374151`, radius 7, 11.5px `#9ca3af`).
- Center (**absolutely centered**: `position:absolute; left:50%; transform:translateX(-50%)`): view tabs pill group on `#111827` (radius 7, padding 2px) — Script, Bible, Beats, Analytics, History; active tab `#374151`/white/500.
- Right (`margin-left:auto`): draft chip "El Águila · Draft 3 · 🔒 Blue rev." (11px `#9ca3af`, border `#374151`, radius 4, nowrap) + Notes button (border `#374151`, `#d1d5db`, radius 7).

### Menu contents (map to existing features)
- **File**: Save ⌘S · Save snapshot… ─ Import (.fountain) ▸ · Export ▸ (PDF, Fountain, FDX) · Print ⌘P ─ Title Page… · Locally saved backups…
- **Edit**: Undo ⌘Z · Redo ⇧⌘Z ─ Find… · Rename character…
- **View**: Pages ⇄ Flow · Focus mode ⌘⇧F · Notes panel · Dark mode
- **Production**: Lock pages / Unlock · Next revision · Revision color ▸ · Scene numbers (toggle)
- **Tools**: Start sprint · Dialogue analytics · Check formatting
- **Help**: Keyboard shortcuts · About
- Menu panel style: `background:#1f2937`, border `#374151`, radius 0 8px 8px 8px (anchored under trigger), shadow `0 18px 48px rgba(17,24,39,.45)`, 12.5px `#e5e7eb`, rows padding 7px 16px, hover `#374151`, separators 1px `#374151`, shortcut hints right-aligned 10.5px `#6b7280` monospace. Section-header variant (if grouping): 9.5px 700 letter-spacing .1em `#6b7280`.
- Keyboard: menus open on click, navigate with arrows, close on Esc; all items must remain reachable via ⌘K palette too.

## Scene navigator (left, 236–250px) — see 01 (resting) + 02 (filtering)
- `background:#f8f9fa`, `border-right:1px solid #e2e6e9`, padding 12px 8px.
- Header: "SCENES" 11px/600/.06em `#6b7280`; right "21 · 24pp" 10.5px `#9ca3af`.
- Filter row (02): storyline-dot multi-toggle in a white pill (inactive dots at 35% opacity); active character filter chip (`#dbeafe`/`#1d4ed8`, border `#bfdbfe`, "VALERIA ×"); ghost "filter" chip (dashed `#cbd5e1`).
- Act headers (02): "▾ ACTO 1 ——— pp 1–11" (10px/700/.1em `#6b7280`, hairline `#e2e6e9`); collapsible.
- Scene row: 9px storyline dot, 12.5px/500 `#1f2937` title truncated, page # 10px `#9ca3af`; active row `background:#e5e7eb`, 600 title + 11px `#6b7280` synopsis line; filtered-out rows at 45% opacity; drag state: white card + shadow + ⠿ handle `#cbd5e1` (reorders the scene in the script — reuse `moveScene`).
- Footer pinned: "ACT PROGRESS" + segmented bar (7px, radius 4, gaps 1px; `#3b82f6` / `#bfdbfe` / `#e2e8f0`, widths ∝ act pages) + labels 9.5px `#9ca3af`.

## Script page & editor features — see 02
- Above the page: context line "Filtered: VALERIA · 9 scenes" (11px) + **Pages/Flow** segmented toggle (on `#e2e6e9`, active segment white with shadow). Flow = continuous scroll (no page breaks); Pages = current paginated view.
- **Gutter "+"**: 20px white circle button (border `#d1d5db`, shadow) left of the active element; opens element-type menu.
- **Character autocomplete**: on typing in a character cue, popover under the element (210px, white, border `#e2e6e9`, radius 8, shadow `0 8px 24px rgba(17,24,39,.18)`): rows = avatar + name with **typed prefix bold**, speech count right-aligned 9.5px `#9ca3af`; first row highlighted `#eff6ff`; last row "＋ New character" with ⏎ hint, separated by hairline. Navigate ↑↓, accept ⏎/Tab. Source: existing character list from analysis engine.
- **Active element**: `background:#eff6ff` (+ outline 4px same color), caret `#3b82f6`.
- **Revision marks (locked script)**: 3px `#60a5fa` strip across the page top; "BLUE REVISION · date" 9px/.08em `#93c5fd` top-left; changed elements get a bold `*` in the right margin, `#3b82f6` (industry standard). Only when `script.locked`; color follows current `revisionColor`.
- **Note highlight**: element with an open note gets `background:#fef9c3`.

## Inspector panel (right, 264px) — see 01/02
Sections (label 10px/700/.08em `#6b7280`, dividers `#eceef1`, padding 12px 14px):
1. **Synopsis** — white card (border `#e2e6e9`, radius 6, 12px `#374151`), editable → `setSceneMeta`.
2. **Storyline & tags** — pills 11px/500 radius 12 (`#4ade80`/`#14532d`, `#60a5fa`/`#1e3a8a`); "+ tag" dashed ghost.
3. **Notes (n open)** — yellow cards (`#fefce8`, border `#fde68a`): body 11.5px `#52461f`; meta 10px `#a16207` with Courier anchor quote; "Resolve" `#16a34a`/600.
4. **In this scene** — 18px round initial avatars + "VALERIA · 3 speeches" (12px `#374151`).
5. **Revision** — 5 swatch cycle (white/blue `#60a5fa`/pink `#f9a8d4`/yellow `#fde047`/green `#86efac`), current outlined `#1d4ed8`; caption "Blue rev. · 2 changed pages · Next rev" (10.5px).

## Command palette — see 03
- Trigger ⌘K (or the search chip). Backdrop `rgba(17,24,39,.32)`; page behind blurs/dims.
- Panel: 560px, white, radius 12, shadow `0 24px 64px rgba(17,24,39,.35)`, top ≈ 96px, centered.
- Input row: ⌕, 14px text, blue caret, "esc" hint chip.
- Result groups "JUMP TO" / "COMMANDS" (10px/700/.08em `#9ca3af`). Rows: scene number in Courier (selected `#1d4ed8`), 13px title, right meta 10.5px `#9ca3af`; selected row `#eff6ff` with "Jump ⏎". Commands with icon column + shortcut chips.
- Fuzzy-matches scenes (jump via `requestCaret`), commands (element transforms, export, sprint, lock), and views.

## Focus mode — see 04
- Everything hidden; warm paper background `#f5f4f1`.
- Current element full ink (`#1a1916`), caret amber `#b45309`; neighbors fade by distance (opacity .55 → .35 → .18). Current line vertically centered (typewriter scrolling).
- Top-left: "p. 4 · INT. DEPARTAMENTO — NOCHE" 11.5px `#c6c1b5`. Top-right: sprint HUD pill (`#fef3c7`, border `#fde68a`, text `#b45309`) + "Esc to exit" ghost pill.
- Bottom center: "ACTION · ⏎ action · ⇥ character" 11px `#c6c1b5`.
- Font size may step up (12.5px in mock ≈ scale; keep Courier real-size and bump zoom instead).

## Status bar (dark) — see 01/02
- `background:#1f2937`, padding 5px 14px, 11px `#9ca3af`.
- Left: "**Page 4** / 24" (bold `#f3f4f6`) · words · scenes · "~24 min" (≈1 min/page) · divider `#374151` · "Today: **+612 words**" (`#4ade80`) · sprint countdown "⚡ 12:40 · 187/300" (`#fbbf24`).
- Right: current element bold `#f3f4f6` + ⏎/⇥ hint chips (Courier 10px, border `#374151`, radius 3) + sync "✓ synced" `#4ade80` / "● unsaved" `#fbbf24` / "offline" `#9ca3af`.

## State Management
Reuse `scriptStore` (scenes, notes, tags, snapshots → today-delta, lock/revision), `uiStore` (view, activeElementId, focusMode, sprint; add: paletteOpen, viewMode pages|flow, navigator filters), `collabStore` (peers → presence). New derived: runtime estimate, per-scene speech counts, character list for autocomplete, changed-element set for revision marks (diff vs. snapshot at lock time).

## Design Tokens
- Chrome dark: menu bar `#111827`, bars `#1f2937`, raised/hover `#374151`, border `#374151`
- Chrome text: `#f3f4f6` / `#d1d5db` / `#9ca3af` / `#6b7280`
- Body: canvas `#eef0f2`, panels `#f8f9fa`, borders `#e2e6e9`, hairlines `#eceef1`
- Body text: `#111827` / `#1f2937` / `#374151` / `#6b7280` / `#9ca3af`
- Blue accent: `#3b82f6`, light `#60a5fa`, pale `#bfdbfe`, wash `#eff6ff`/`#dbeafe`, chip `#93c5fd`/`#1e3a8a`, deep `#1d4ed8`
- Green: `#4ade80` / `#16a34a` / tag text `#14532d`
- Notes yellow: `#fefce8` / `#fde68a` / `#52461f` / `#a16207`; element highlight `#fef9c3`
- Revision colors: white, blue `#60a5fa`, pink `#f9a8d4`, yellow `#fde047`, green `#86efac`
- Focus mode: bg `#f5f4f1`, ink `#1a1916`, muted `#c6c1b5`, amber `#b45309` (`#fef3c7`/`#fde68a` HUD)
- Storyline palette: `#4ade80`, `#60a5fa`, `#fbbf24`, `#cbd5e1` (+ existing CARD_COLORS)
- Radii: menus/cards 6–8px, buttons/pills 7px, rows 5px, chips 4px, tag pills 12px, palette 12px
- Type: UI = IBM Plex Sans 400/500/600; script = Courier Prime. UI sizes: 12.5–13px bar/menu, 12px controls/rows, 11px status/chips, 10px section labels, 9.5px micro.

## Assets
Google Fonts: IBM Plex Sans, Courier Prime. No images; logo is a styled div (blue square + Courier "W"). Emoji glyphs (⚡ 🔒 ⌕ ⏎ ⇥ ⠿ ⋯) are placeholders — use a consistent icon set (e.g. Lucide) in implementation.

## Interactions & Behavior (unchanged from today unless noted)
Tab/Enter state machine, real-time pagination, undo/redo, Fountain import/export, print, sprint flow, presence, lock/revision cycle all keep their current logic — this redesign re-skins and re-organizes them. The old "Cloud sync offline / Create account" banner is removed; sync state lives in the Row-1 pill (click → detail popover with Create-account CTA). Dark mode is out of scope for this pass (park the toggle in View menu).
