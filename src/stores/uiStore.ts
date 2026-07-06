/** UI chrome state: panels, focus mode, active view, active element. */
import { create } from "zustand";

export type AppView =
  | "editor"
  | "beatboard"
  | "analytics"
  | "titlepage"
  | "bible"
  | "history"
  | "library";

/** An active writing sprint (distraction-buster with a word goal). */
export interface Sprint {
  endsAt: number;
  startWords: number;
  targetWords: number;
}

export interface UiState {
  view: AppView;
  sidebarOpen: boolean;
  notesOpen: boolean;
  /** Distraction-free mode: hides all chrome, only the page remains. */
  focusMode: boolean;
  darkMode: boolean;
  activeElementId: string | null;
  /** Caret position to restore when programmatically moving focus.
   *  `center` scrolls the target block to mid-viewport (navigator jumps). */
  pendingCaret: { elementId: string; offset: number; center?: boolean } | null;
  tagFilter: string | null;
  sprint: Sprint | null;
  /**
   * Whether the browser granted persistent storage (navigator.storage
   * .persist(), requested on first save). 'denied'/'unknown' means the
   * draft store may be evicted under disk pressure — surfaced honestly
   * in the status bar. null = not yet requested.
   */
  storagePersist: "granted" | "denied" | "unsupported" | "unknown" | null;
  setStoragePersist: (v: UiState["storagePersist"]) => void;
  /** Account dropdown open state (the guest banner opens it remotely). */
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
  /** Session-scoped dismissal of the guest-work-is-device-only banner. */
  guestBannerDismissed: boolean;
  dismissGuestBanner: () => void;
  /** Ctrl+K command palette. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Scene navigator as an overlay drawer on narrow viewports. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /**
   * Editor page layout: 'pages' = paginated view (real page breaks),
   * 'flow' = continuous scroll with no page breaks. Purely presentational;
   * the paginator still runs (page counts, jumps, status bar).
   */
  viewMode: "pages" | "flow";
  setViewMode: (m: "pages" | "flow") => void;
  /** Show scene-number badges (populated when the script is locked). */
  showSceneNumbers: boolean;
  toggleSceneNumbers: () => void;
  /**
   * Scene-navigator filters. `navStorylines` is the set of ACTIVE storyline
   * colors (empty = show all); `navCharacter` filters to scenes a character
   * speaks in (null = no character filter). Both are view-only.
   */
  navStorylines: string[];
  toggleNavStoryline: (color: string) => void;
  navCharacter: string | null;
  setNavCharacter: (name: string | null) => void;
  clearNavFilters: () => void;

  startSprint: (
    minutes: number,
    targetWords: number,
    currentWords: number,
  ) => void;
  endSprint: () => void;
  setView: (v: AppView) => void;
  toggleSidebar: () => void;
  toggleNotes: () => void;
  toggleFocusMode: () => void;
  toggleDarkMode: () => void;
  setActiveElement: (id: string | null) => void;
  requestCaret: (elementId: string, offset: number, center?: boolean) => void;
  clearPendingCaret: () => void;
  setTagFilter: (tagId: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "editor",
  sidebarOpen: true,
  // The Studio Frame shell shows the inspector by default (three columns).
  notesOpen: true,
  focusMode: false,
  // Studio Frame is a fixed two-tone system (dark chrome + light body); a
  // dark *body* theme is deferred, so dark mode stays parked (off) and the
  // View→Dark toggle is a no-op placeholder for this pass.
  darkMode: false,
  activeElementId: null,
  pendingCaret: null,
  tagFilter: null,
  sprint: null,
  storagePersist: null,
  setStoragePersist: (storagePersist) => set({ storagePersist }),
  accountMenuOpen: false,
  setAccountMenuOpen: (accountMenuOpen) => set({ accountMenuOpen }),
  guestBannerDismissed: false,
  dismissGuestBanner: () => set({ guestBannerDismissed: true }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  viewMode: "pages",
  setViewMode: (viewMode) => set({ viewMode }),
  showSceneNumbers: true,
  toggleSceneNumbers: () =>
    set((s) => ({ showSceneNumbers: !s.showSceneNumbers })),
  navStorylines: [],
  toggleNavStoryline: (color) =>
    set((s) => ({
      navStorylines: s.navStorylines.includes(color)
        ? s.navStorylines.filter((c) => c !== color)
        : [...s.navStorylines, color],
    })),
  navCharacter: null,
  setNavCharacter: (navCharacter) => set({ navCharacter }),
  clearNavFilters: () => set({ navStorylines: [], navCharacter: null }),

  startSprint: (minutes, targetWords, currentWords) =>
    set({
      sprint: {
        endsAt: Date.now() + minutes * 60_000,
        startWords: currentWords,
        targetWords,
      },
      focusMode: true,
      sidebarOpen: false,
    }),
  endSprint: () => set({ sprint: null, focusMode: false, sidebarOpen: true }),
  setView: (view) => set({ view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleNotes: () => set((s) => ({ notesOpen: !s.notesOpen })),
  toggleFocusMode: () =>
    set((s) => ({ focusMode: !s.focusMode, sidebarOpen: s.focusMode })),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setActiveElement: (activeElementId) => set({ activeElementId }),
  requestCaret: (elementId, offset, center) =>
    set({ pendingCaret: { elementId, offset, center } }),
  clearPendingCaret: () => set({ pendingCaret: null }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
}));
