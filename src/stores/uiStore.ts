/** UI chrome state: panels, focus mode, active view, active element. */
import { create } from 'zustand'

export type AppView = 'editor' | 'beatboard' | 'analytics' | 'titlepage'

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
