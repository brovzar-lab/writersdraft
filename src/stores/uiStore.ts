/** UI chrome state: panels, focus mode, active view, active element. */
import { create } from 'zustand'

export type AppView = 'editor' | 'beatboard' | 'analytics' | 'titlepage' | 'bible' | 'history'

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
  /** Caret position to restore when programmatically moving focus. */
  pendingCaret: { elementId: string; offset: number } | null
  tagFilter: string | null
  sprint: Sprint | null

  startSprint: (minutes: number, targetWords: number, currentWords: number) => void
  endSprint: () => void
  setView: (v: AppView) => void
  toggleSidebar: () => void
  toggleNotes: () => void
  toggleFocusMode: () => void
  toggleDarkMode: () => void
  setActiveElement: (id: string | null) => void
  requestCaret: (elementId: string, offset: number) => void
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
  requestCaret: (elementId, offset) =>
    set({ pendingCaret: { elementId, offset } }),
  clearPendingCaret: () => set({ pendingCaret: null }),
  setTagFilter: (tagFilter) => set({ tagFilter }),
}))
