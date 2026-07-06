/** UI chrome state: panels, focus mode, active view, active element. */
import { create } from 'zustand'

export type AppView =
  | 'editor'
  | 'beatboard'
  | 'analytics'
  | 'titlepage'
  | 'bible'
  | 'history'
  | 'library'

/** An active writing sprint (distraction-buster with a word goal). */
export interface Sprint {
  endsAt: number
  startWords: number
  targetWords: number
}

export interface UiState {
  view: AppView
  sidebarOpen: boolean
  notesOpen: boolean
  /** Distraction-free mode: hides all chrome, only the page remains. */
  focusMode: boolean
  darkMode: boolean
  activeElementId: string | null
  /** Caret position to restore when programmatically moving focus.
   *  `center` scrolls the target block to mid-viewport (navigator jumps). */
  pendingCaret: { elementId: string; offset: number; center?: boolean } | null
  tagFilter: string | null
  sprint: Sprint | null
  /**
   * Whether the browser granted persistent storage (navigator.storage
   * .persist(), requested on first save). 'denied'/'unknown' means the
   * draft store may be evicted under disk pressure — surfaced honestly
   * in the status bar. null = not yet requested.
   */
  storagePersist: 'granted' | 'denied' | 'unsupported' | 'unknown' | null
  setStoragePersist: (v: UiState['storagePersist']) => void
  /** Account dropdown open state (the guest banner opens it remotely). */
  accountMenuOpen: boolean
  setAccountMenuOpen: (open: boolean) => void
  /** Session-scoped dismissal of the guest-work-is-device-only banner. */
  guestBannerDismissed: boolean
  dismissGuestBanner: () => void
  /** Ctrl+K command palette. */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void

  startSprint: (minutes: number, targetWords: number, currentWords: number) => void
  endSprint: () => void
  setView: (v: AppView) => void
  toggleSidebar: () => void
  toggleNotes: () => void
  toggleFocusMode: () => void
  toggleDarkMode: () => void
  setActiveElement: (id: string | null) => void
  requestCaret: (elementId: string, offset: number, center?: boolean) => void
  clearPendingCaret: () => void
  setTagFilter: (tagId: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'editor',
  sidebarOpen: true,
  notesOpen: false,
  focusMode: false,
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
}))
