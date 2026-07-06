import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { emptyScript, migrateScript, useScriptStore } from './stores/scriptStore'
import { useUiStore } from './stores/uiStore'
import { Toolbar } from './components/Toolbar'
import { StatusBar } from './components/StatusBar'
import { ScriptEditor } from './components/ScriptEditor'
import { SceneNavigator } from './components/SceneNavigator'
import { BeatBoard } from './components/BeatBoard'
import { AnalyticsPanel } from './components/AnalyticsPanel'
import { TitlePageView } from './components/TitlePageView'
import { NotesPanel } from './components/NotesPanel'
import { StoryBible } from './components/StoryBible'
import { HistoryTimeline } from './components/HistoryTimeline'
import { Library } from './components/Library'
import { PaginationProvider } from './components/PaginationContext'
import { PrintView } from './components/PrintView'
import { useCollabStore } from './stores/collabStore'
import {
  deleteScript as deleteLocalScript,
  getMeta,
  getScript,
  getTimeline,
  listScripts,
  migrateLegacyLocalStorage,
  putScript,
  putTimeline,
  setMeta,
} from './storage/local'
import { decodeTimeline, encodeTimeline } from './engine/timelineCodec'
import type { AccountUser } from './components/AccountMenu'
import type { Script } from './types'

/** Legacy localStorage key, kept as a best-effort mirror of the script only. */
const LS_KEY = 'writersdraft:script'

/** Record an automatic version snapshot at most this often. */
const AUTOSNAP_INTERVAL_MS = 5 * 60_000

function readHashScriptId(): string | null {
  const m = window.location.hash.match(/^#\/s\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

function writeHashScriptId(id: string): void {
  const h = `#/s/${id}`
  if (window.location.hash !== h) history.replaceState(null, '', h)
}

export default function App() {
  // App must not re-render per keystroke: subscribe to the script id, not
  // the script. Autosave watches the store directly (effect below).
  const scriptId = useScriptStore((s) => s.script.id)
  const pendingRemote = useScriptStore((s) => s.pendingRemote)
  const loadScript = useScriptStore((s) => s.loadScript)
  const undo = useScriptStore((s) => s.undo)
  const redo = useScriptStore((s) => s.redo)
  const resolveConflict = useScriptStore((s) => s.resolveConflict)
  const view = useUiStore((s) => s.view)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const notesOpen = useUiStore((s) => s.notesOpen)
  const focusMode = useUiStore((s) => s.focusMode)
  const darkMode = useUiStore((s) => s.darkMode)
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode)
  const [syncState, setSyncState] = useState('local')
  const [booted, setBooted] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [user, setUser] = useState<AccountUser | null>(null)
  const userIdRef = useRef<string | null>(null)
  const pendingCloudFetchRef = useRef<string | null>(null)
  const lastAutoSnapRef = useRef(0)

  // ---- Boot: restore from IndexedDB (migrating any legacy localStorage save).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const legacy = await migrateLegacyLocalStorage()
      const hashId = readHashScriptId()
      const target =
        hashId ?? (await getMeta<string>('currentScriptId').catch(() => null)) ?? legacy?.id ?? null

      let stored: Script | null = null
      if (target) stored = await getScript(target).catch(() => null)
      if (!stored && !hashId) {
        const all = await listScripts().catch(() => [])
        if (all.length > 0) stored = await getScript(all[0].id).catch(() => null)
      }
      if (cancelled) return

      if (stored) {
        const valid = migrateScript(stored)
        loadScript(valid)
        const tl = await getTimeline(valid.id).catch(() => null)
        if (!cancelled) useScriptStore.getState().loadTimeline(tl ? decodeTimeline(tl) : [])
      } else if (target) {
        // The URL names a script this browser doesn't have. Keep its id and
        // try the cloud once signed in, instead of minting a new document.
        pendingCloudFetchRef.current = target
        const fresh = emptyScript()
        fresh.id = target
        loadScript(fresh)
      }
      if (cancelled) return
      const current = useScriptStore.getState().script
      writeHashScriptId(current.id)
      await setMeta('currentScriptId', current.id).catch(() => {})
      if (!cancelled) setBooted(true)
    })().catch(() => {
      // Storage is broken; let the user write anyway — saves will retry.
      if (!cancelled) setBooted(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Save now: local durable write, snapshot policy, cloud mirror.
  // Each stage has its own failure domain; a timeline or cloud failure can
  // never block or corrupt the script save itself.
  const performSave = useCallback(async () => {
    const state = useScriptStore.getState()
    const current = state.script

    let localOk = false
    try {
      await putScript(current)
      await setMeta('currentScriptId', current.id)
      localOk = true
    } catch {
      // IndexedDB write failed — dirty flag stays on so the UI shows unsaved.
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(current))
    } catch {
      // Mirror only; IndexedDB remains the store of record.
    }
    if (localOk) state.markSaved()

    try {
      if (Date.now() - lastAutoSnapRef.current > AUTOSNAP_INTERVAL_MS) {
        if (useScriptStore.getState().recordSnapshot('Autosave')) {
          lastAutoSnapRef.current = Date.now()
        }
      }
    } catch {
      // Version snapshot failure never touches the script save.
    }

    if (userIdRef.current) {
      try {
        const { saveScript } = await import('./firebase/sync')
        const toSave = useScriptStore.getState().script
        await saveScript(toSave, userIdRef.current)
        useScriptStore.getState().markSynced(toSave.updatedAt)
        setSyncState('synced')
      } catch {
        setSyncState('offline')
      }
    }
  }, [])

  // ---- Debounced autosave, driven by store subscription (not re-renders):
  // every dirty change re-arms an 800ms trailing timer.
  useEffect(() => {
    if (!booted) return
    let t: number | undefined
    const unsub = useScriptStore.subscribe((s, prev) => {
      if (!s.dirty) return
      if (s.script === prev.script && prev.dirty === s.dirty) return
      window.clearTimeout(t)
      t = window.setTimeout(() => void performSave(), 800)
    })
    // A script that boots dirty (e.g. an import) still saves.
    if (useScriptStore.getState().dirty) t = window.setTimeout(() => void performSave(), 800)
    return () => {
      unsub()
      window.clearTimeout(t)
    }
  }, [booted, performSave])

  // ---- Timeline persistence: separate write, separate failure domain.
  useEffect(() => {
    if (!booted) return
    let t: number | undefined
    const unsub = useScriptStore.subscribe((s, prev) => {
      if (s.timeline === prev.timeline) return
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const { script: cur, timeline } = useScriptStore.getState()
        putTimeline(cur.id, encodeTimeline(timeline)).catch(() => {})
      }, 500)
    })
    return () => {
      unsub()
      window.clearTimeout(t)
    }
  }, [booted])

  // ---- Optional cloud session (anonymous by default, linkable to email).
  useEffect(() => {
    if (!booted) return
    let cancelled = false
    let unsubAuth: (() => void) | null = null
    ;(async () => {
      try {
        const { ensureSignedIn, watchAuth } = await import('./firebase/sync')
        unsubAuth = watchAuth((u) => {
          if (cancelled) return
          userIdRef.current = u?.uid ?? null
          setUser(u ? { uid: u.uid, email: u.email, isAnonymous: u.isAnonymous } : null)
          if (u) useCollabStore.getState().setSelf(u.uid)
        })
        await Promise.race([
          ensureSignedIn(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ])
        if (!cancelled) setSyncState('synced')
      } catch {
        if (!cancelled) setSyncState('local')
      }
    })()
    return () => {
      cancelled = true
      unsubAuth?.()
    }
  }, [booted])

  const refreshUser = useCallback(() => {
    void (async () => {
      try {
        const { currentUser } = await import('./firebase/sync')
        const u = currentUser()
        userIdRef.current = u?.uid ?? null
        setUser(u ? { uid: u.uid, email: u.email, isAnonymous: u.isAnonymous } : null)
      } catch {
        // ignore
      }
    })()
  }, [])

  // ---- Cloud recovery: fetch a URL-named script this browser doesn't have.
  useEffect(() => {
    if (!booted || !user) return
    const target = pendingCloudFetchRef.current
    if (!target) return
    ;(async () => {
      try {
        const { loadScript: fetchCloudScript } = await import('./firebase/sync')
        const remote = await fetchCloudScript(target)
        pendingCloudFetchRef.current = null
        if (!remote) return
        const valid = migrateScript(remote)
        const state = useScriptStore.getState()
        if (state.script.id === target && state.script.updatedAt === 0 && !state.dirty) {
          state.loadScript(valid)
          await putScript(valid).catch(() => {})
        } else {
          // The writer already typed into the placeholder — never overwrite;
          // park the cloud copy as a conflict for them to resolve.
          useScriptStore.setState({ pendingRemote: valid })
        }
      } catch {
        // Permission denied (still anonymous) or offline: keep the fetch
        // pending so signing in to the right account retries it.
      }
    })()
  }, [booted, user])

  // ---- Live collaboration: presence + remote snapshots for this script.
  useEffect(() => {
    if (!booted || !user) return
    let cancelled = false
    let unsubDoc: (() => void) | undefined
    let unsubPresence: (() => void) | undefined
    let unsubUi: (() => void) | undefined
    let iv: number | undefined
    ;(async () => {
      try {
        const sync = await import('./firebase/sync')
        if (cancelled) return
        unsubPresence = sync.subscribePresence(scriptId, (peers) =>
          useCollabStore.getState().setPeers(peers),
        )
        unsubDoc = sync.subscribeToScript(scriptId, (remote) => {
          // Validated, then offered — never force-loaded over unsaved work.
          useScriptStore.getState().receiveRemote(migrateScript(remote))
        })
        const beat = () => {
          sync
            .publishPresence(scriptId, {
              userId: user.uid,
              name: user.email ? user.email.split('@')[0] : `Writer ${user.uid.slice(0, 4)}`,
              color: useCollabStore.getState().selfColor,
              elementId: useUiStore.getState().activeElementId,
              updatedAt: Date.now(),
            })
            .catch(() => {})
        }
        beat()
        iv = window.setInterval(beat, 20_000)
        unsubUi = useUiStore.subscribe((s, prev) => {
          if (s.activeElementId !== prev.activeElementId) beat()
        })
      } catch {
        // Collaboration is best-effort; offline editing is unaffected.
      }
    })()
    return () => {
      cancelled = true
      unsubDoc?.()
      unsubPresence?.()
      unsubUi?.()
      if (iv) window.clearInterval(iv)
    }
  }, [booted, user, scriptId])

  // ---- Open / create / delete scripts (library + hash routing).
  const openScriptById = useCallback(
    async (id: string) => {
      const state = useScriptStore.getState()
      if (id === state.script.id) {
        useUiStore.getState().setView('editor')
        return
      }
      if (state.dirty) await performSave()
      if (useScriptStore.getState().dirty) {
        const ok = window.confirm(
          'Your current script could not be saved. Switch anyway and discard unsaved changes?',
        )
        if (!ok) return
      }
      let stored = await getScript(id).catch(() => null)
      if (!stored && userIdRef.current) {
        try {
          const { loadScript: fetchCloudScript } = await import('./firebase/sync')
          stored = await fetchCloudScript(id)
        } catch {
          // cloud unreachable
        }
      }
      if (!stored) {
        window.alert('Could not open that script — it is not on this device or in your cloud library.')
        return
      }
      const valid = migrateScript(stored)
      useScriptStore.getState().loadScript(valid)
      const tl = await getTimeline(valid.id).catch(() => null)
      useScriptStore.getState().loadTimeline(tl ? decodeTimeline(tl) : [])
      await putScript(valid).catch(() => {})
      await setMeta('currentScriptId', valid.id).catch(() => {})
      writeHashScriptId(valid.id)
      useUiStore.getState().setView('editor')
    },
    [performSave],
  )

  const createScript = useCallback(async () => {
    const state = useScriptStore.getState()
    if (state.dirty) await performSave()
    const fresh = emptyScript()
    useScriptStore.getState().loadScript(fresh)
    useScriptStore.getState().loadTimeline([])
    await putScript(fresh).catch(() => {})
    await setMeta('currentScriptId', fresh.id).catch(() => {})
    writeHashScriptId(fresh.id)
    useUiStore.getState().setView('editor')
  }, [performSave])

  useEffect(() => {
    if (!booted) return
    const onHash = () => {
      const id = readHashScriptId()
      if (id && id !== useScriptStore.getState().script.id) void openScriptById(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [booted, openScriptById])

  // Keep the URL pointing at whatever script is open.
  useEffect(() => {
    if (booted) writeHashScriptId(scriptId)
  }, [booted, scriptId])

  // ---- Printing: mount the print-exact view, then hand off to the browser.
  const requestPrint = useCallback(() => setPrinting(true), [])

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    // Give the print DOM one frame to lay out before the dialog snapshots it.
    const t = window.setTimeout(() => window.print(), 60)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  // Browser-menu print (no Ctrl+P): mount the print view synchronously.
  useEffect(() => {
    const before = () => {
      if (!printing) flushSync(() => setPrinting(true))
    }
    window.addEventListener('beforeprint', before)
    return () => window.removeEventListener('beforeprint', before)
  }, [printing])

  // ---- Global keyboard shortcuts.
  useEffect(() => {
    const isFormField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        // Leave native undo alone in prose fields (bible, notes, synopses) —
        // script undo there would invisibly mangle the screenplay.
        if (isFormField(e.target)) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void performSave()
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        requestPrint()
      } else if (e.key === 'Escape' && useUiStore.getState().focusMode) {
        toggleFocusMode()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        toggleFocusMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, performSave, toggleFocusMode, requestPrint])

  return (
    <PaginationProvider>
      {printing && <PrintView />}
      <div className={`app-root ${darkMode ? 'dark' : ''}`}>
        <div className="flex h-screen flex-col bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
        {!focusMode && (
          <Toolbar
            syncState={syncState}
            user={user}
            onAuthChanged={refreshUser}
            onPrint={requestPrint}
          />
        )}
        {pendingRemote && (
          <div className="no-print flex items-center gap-3 border-b border-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
            <span className="flex-1">
              A newer version of this script was saved from another session. Your unsaved local
              changes are safe — choose which version to keep. (Loading theirs keeps yours one
              Undo away.)
            </span>
            <button
              onClick={() => resolveConflict('take-remote')}
              className="rounded border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900/60"
            >
              Load theirs
            </button>
            <button
              onClick={() => resolveConflict('keep-local')}
              className="rounded bg-amber-500 px-2 py-1 text-xs text-white hover:bg-amber-600"
            >
              Keep mine
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {!focusMode && sidebarOpen && view === 'editor' && (
            <aside className="no-print w-64 shrink-0 overflow-y-auto border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              <SceneNavigator />
            </aside>
          )}
          <main className="min-w-0 flex-1 overflow-y-auto">
            {!booted ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Opening your script…
              </div>
            ) : (
              <>
                {view === 'editor' && <ScriptEditor />}
                {view === 'beatboard' && <BeatBoard />}
                {view === 'analytics' && <AnalyticsPanel />}
                {view === 'titlepage' && <TitlePageView />}
                {view === 'bible' && <StoryBible />}
                {view === 'history' && <HistoryTimeline />}
                {view === 'library' && (
                  <Library
                    userId={user?.uid ?? null}
                    onOpen={(id) => void openScriptById(id)}
                    onNew={() => void createScript()}
                    onDelete={(id) => void deleteLocalScript(id).catch(() => {})}
                  />
                )}
              </>
            )}
          </main>
          {!focusMode && notesOpen && view === 'editor' && <NotesPanel />}
        </div>
        {!focusMode && <StatusBar />}
        </div>
      </div>
    </PaginationProvider>
  )
}
