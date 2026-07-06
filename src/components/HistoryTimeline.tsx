/**
 * Version timeline: restorable snapshots recorded on save/lock/sprint,
 * with page/word deltas so you can see the draft grow.
 */
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'

export function HistoryTimeline() {
  const timeline = useScriptStore((s) => s.timeline)
  const { restoreSnapshot, recordSnapshot } = useScriptStore()
  const setView = useUiStore((s) => s.setView)

  const entries = [...timeline].reverse()

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Version History</h1>
          <p className="text-sm text-gray-500">
            Snapshots are captured automatically as you save. Restore any point — restoring is
            itself undoable.
          </p>
        </div>
        <button
          onClick={() => recordSnapshot('Manual snapshot')}
          className="rounded border border-gray-200 dark:border-slate-600 px-2 py-1 text-xs hover:border-blue-400"
        >
          + Snapshot now
        </button>
      </div>
      {entries.length === 0 && (
        <p className="mt-16 text-center text-gray-400">No snapshots yet — start writing.</p>
      )}
      <ol className="relative flex flex-col gap-3 border-l border-gray-200 dark:border-slate-700 pl-5">
        {entries.map((e, i) => {
          const prev = entries[i + 1]
          const dWords = prev ? e.words - prev.words : e.words
          return (
            <li key={e.id} className="relative rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-white dark:border-slate-950 bg-blue-400" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{e.label}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(e.at).toLocaleString()} · {e.pageCount} pages · {e.words} words{' '}
                    {prev && (
                      <span className={dWords >= 0 ? 'text-green-600' : 'text-red-500'}>
                        ({dWords >= 0 ? '+' : ''}
                        {dWords} words)
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    restoreSnapshot(e.id)
                    setView('editor')
                  }}
                  className="rounded border border-gray-200 dark:border-slate-600 px-2 py-1 text-xs hover:border-blue-400 hover:text-blue-500"
                >
                  Restore
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
