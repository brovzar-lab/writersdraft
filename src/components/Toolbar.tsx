/** Top chrome: view switcher, element type selector, undo/redo, production tools. */
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore, type AppView } from '../stores/uiStore'
import { ELEMENT_LABELS, ELEMENT_TYPES, type ElementType } from '../types'
import { exportFountain, importFountain } from '../engine/fountain'
import { AccountMenu, type AccountUser } from './AccountMenu'

function download(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const VIEWS: Array<{ id: AppView; label: string }> = [
  { id: 'editor', label: 'Script' },
  { id: 'bible', label: 'Story Bible' },
  { id: 'beatboard', label: 'Beat Board' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'history', label: 'History' },
  { id: 'titlepage', label: 'Title Page' },
  { id: 'library', label: 'Library' },
]

export function Toolbar({
  syncState,
  user,
  onAuthChanged,
}: {
  syncState: string
  user: AccountUser | null
  onAuthChanged: () => void
}) {
  const script = useScriptStore((s) => s.script)
  const { undo, redo, setElementType, lockScript, unlockScript, bumpRevision, loadScript, checkpoint } =
    useScriptStore()
  const past = useScriptStore((s) => s.past.length)
  const future = useScriptStore((s) => s.future.length)
  const { view, setView, toggleFocusMode, toggleDarkMode, darkMode, toggleNotes, notesOpen, activeElementId } =
    useUiStore()

  const activeEl = script.elements.find((e) => e.id === activeElementId)

  return (
    <header className="no-print flex items-center gap-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm">
      <span className="font-semibold text-gray-800 dark:text-gray-100 mr-2">
        Writers<span className="text-blue-500">Draft</span>
      </span>

      <nav className="flex rounded bg-gray-100 dark:bg-slate-700 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded px-2 py-0.5 text-xs ${
              view === v.id
                ? 'bg-white dark:bg-slate-900 shadow text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === 'editor' && (
        <select
          className="rounded border border-gray-200 dark:border-slate-600 bg-transparent px-1.5 py-0.5 text-xs"
          value={activeEl?.type ?? 'action'}
          onChange={(e) => {
            if (activeEl) {
              checkpoint()
              setElementType(activeEl.id, e.target.value as ElementType)
            }
          }}
          title="Element type (Tab/Enter also switch types)"
        >
          {ELEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ELEMENT_LABELS[t]}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-1">
        <button onClick={undo} disabled={past === 0} className="tb-btn rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600 disabled:opacity-30" title="Undo (Ctrl+Z)">
          ↺
        </button>
        <button onClick={redo} disabled={future === 0} className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600 disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
          ↻
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-gray-400">{syncState}</span>
        {script.locked ? (
          <>
            <span
              className="rounded px-1.5 py-0.5 text-xs capitalize border border-gray-300 dark:border-slate-600"
              title="Current revision color"
            >
              {script.revisionColor} rev.
            </span>
            <button onClick={() => bumpRevision()} className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600" title="Advance revision color">
              Next rev
            </button>
            <button onClick={unlockScript} className="rounded px-1.5 py-0.5 text-xs border border-amber-300 text-amber-600" title="Unlock script">
              🔓 Unlock
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              lockScript()
              // A production lock is a milestone — always snapshot it.
              useScriptStore.getState().recordSnapshot('Locked for production')
            }}
            className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600"
            title="Lock pages & number scenes for production"
          >
            🔒 Lock
          </button>
        )}
        <button
          onClick={() => download(`${script.titlePage.title || 'script'}.fountain`, exportFountain(script))}
          className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600"
          title="Export as Fountain"
        >
          Export
        </button>
        <label className="cursor-pointer rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600" title="Import a .fountain file">
          Import
          <input
            type="file"
            accept=".fountain,.txt"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                const imported = importFountain(await f.text())
                loadScript(imported)
                useScriptStore.getState().loadTimeline([])
                // Imports must persist even before the first edit.
                useScriptStore.getState().markDirty()
              }
              e.target.value = ''
            }}
          />
        </label>
        <button onClick={() => window.print()} className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600" title="Print / Save as PDF">
          Print
        </button>
        <button onClick={toggleNotes} className={`rounded px-1.5 py-0.5 text-xs border ${notesOpen ? 'border-blue-400 text-blue-500' : 'border-gray-200 dark:border-slate-600'}`} title="Notes & tags">
          🗒
        </button>
        <button onClick={toggleDarkMode} className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600" title="Toggle dark mode">
          {darkMode ? '☀️' : '🌙'}
        </button>
        <button onClick={toggleFocusMode} className="rounded px-1.5 py-0.5 text-xs border border-gray-200 dark:border-slate-600" title="Focus mode (Esc to exit)">
          ⛶ Focus
        </button>
        <SprintButton />
        <AccountMenu user={user} onAuthChanged={onAuthChanged} />
      </div>
    </header>
  )
}

function SprintButton() {
  const { sprint, startSprint } = useUiStore()
  const elements = useScriptStore((s) => s.script.elements)
  if (sprint) return null
  return (
    <button
      onClick={() => {
        const words = elements.reduce(
          (a, el) => a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
          0,
        )
        startSprint(15, 300, words)
      }}
      className="rounded px-1.5 py-0.5 text-xs border border-green-300 text-green-600"
      title="15-minute writing sprint, 300-word goal. Enters focus mode."
    >
      ⚡ Sprint
    </button>
  )
}
