import { useEffect, useRef, useState } from 'react'
import { useScriptStore } from './stores/scriptStore'
import { useUiStore } from './stores/uiStore'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ScriptEditor } from './components/ScriptEditor'
import { SceneNavigator } from './components/SceneNavigator'
import { BeatBoard } from './components/BeatBoard'
import { AnalyticsPanel } from './components/AnalyticsPanel'
import { TitlePageView } from './components/TitlePageView'
import { NotesPanel } from './components/NotesPanel'
import type { Script } from './types'

const LS_KEY = 'writersdraft:script'

export default function App() {
  const script = useScriptStore((s) => s.script)
  const dirty = useScriptStore((s) => s.dirty)
  const { loadScript, undo, redo, markSaved } = useScriptStore()
  const { view, sidebarOpen, notesOpen, focusMode, darkMode, toggleFocusMode } = useUiStore()
  const [syncState, setSyncState] = useState('local')
  const userIdRef = useRef<string | null>(null)

  // Restore from localStorage on first mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) loadScript(JSON.parse(raw) as Script)
    } catch {
      // Corrupt autosave — start fresh rather than crash.
    }
  }, [loadScript])

  // Debounced autosave: localStorage always, Firestore when signed in.
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(async () => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(useScriptStore.getState().script))
        markSaved()
      } catch {
        // Quota exceeded — keep the dirty flag so the user sees "unsaved".
      }
      if (userIdRef.current) {
        try {
          const { saveScript } = await import('./firebase/sync')
          await saveScript(useScriptStore.getState().script, userIdRef.current)
          setSyncState('synced')
        } catch {
          setSyncState('offline')
        }
      }
    }, 800)
    return () => clearTimeout(t)
  }, [dirty, script, markSaved])

  // Optional cloud session: sign in anonymously against the emulator/production
  // Firebase. Failure is fine — the app is fully functional offline.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { ensureSignedIn } = await import('./firebase/sync')
        const user = await Promise.race([
          ensureSignedIn(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ])
        if (!cancelled) {
          userIdRef.current = user.uid
          setSyncState('synced')
        }
      } catch {
        if (!cancelled) setSyncState('local')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        localStorage.setItem(LS_KEY, JSON.stringify(useScriptStore.getState().script))
        markSaved()
      } else if (e.key === 'Escape' && useUiStore.getState().focusMode) {
        toggleFocusMode()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, markSaved, toggleFocusMode])

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen flex-col bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
        {!focusMode && <Toolbar syncState={syncState} />}
        <div className="flex min-h-0 flex-1">
          {!focusMode && sidebarOpen && view === 'editor' && (
            <aside className="no-print w-64 shrink-0 overflow-y-auto border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <SceneNavigator />
            </aside>
          )}
          <main className="min-w-0 flex-1 overflow-y-auto">
            {view === 'editor' && <ScriptEditor />}
            {view === 'beatboard' && <BeatBoard />}
            {view === 'analytics' && <AnalyticsPanel />}
            {view === 'titlepage' && <TitlePageView />}
          </main>
          {!focusMode && notesOpen && view === 'editor' && <NotesPanel />}
        </div>
        {!focusMode && <StatusBar />}
      </div>
    </div>
  )
}
