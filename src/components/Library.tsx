/**
 * Script library: every script in this browser (IndexedDB) plus, when signed
 * in, the cloud copies owned by this account — the recovery path for a new
 * device or cleared site data.
 */
import { useEffect, useState } from 'react'
import { listScripts, type LocalScriptMeta } from '../storage/local'
import { useScriptStore } from '../stores/scriptStore'
import type { CloudScriptMeta } from '../firebase/sync'

export interface LibraryProps {
  userId: string | null
  onOpen: (scriptId: string) => void
  onNew: () => void
  onDelete: (scriptId: string) => void
}

export function Library({ userId, onOpen, onNew, onDelete }: LibraryProps) {
  const currentId = useScriptStore((s) => s.script.id)
  const [local, setLocal] = useState<LocalScriptMeta[] | null>(null)
  const [cloud, setCloud] = useState<CloudScriptMeta[] | null>(null)
  const [cloudError, setCloudError] = useState(false)

  const refresh = () => {
    listScripts()
      .then(setLocal)
      .catch(() => setLocal([]))
    if (userId) {
      import('../firebase/sync')
        .then(({ listCloudScripts }) => listCloudScripts(userId))
        .then(setCloud)
        .catch(() => setCloudError(true))
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [userId, currentId])

  const localIds = new Set((local ?? []).map((s) => s.id))
  const cloudOnly = (cloud ?? []).filter((c) => !localIds.has(c.id))

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Scripts</h1>
          <p className="text-sm text-gray-500">
            Stored in this browser{userId ? ' and synced to your account' : ''}.
          </p>
        </div>
        <button
          onClick={onNew}
          className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
        >
          + New script
        </button>
      </div>

      {local === null && <p className="text-sm text-gray-400">Loading…</p>}
      {local !== null && local.length === 0 && cloudOnly.length === 0 && (
        <p className="mt-12 text-center text-gray-400">No scripts yet — create one.</p>
      )}

      <ul className="flex flex-col gap-2">
        {(local ?? []).map((s) => (
          <li
            key={s.id}
            className="group flex items-center gap-3 rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
          >
            <button onClick={() => onOpen(s.id)} className="flex-1 text-left">
              <span className="block font-medium text-gray-800 dark:text-gray-100">
                {s.title}
                {s.id === currentId && (
                  <span className="ml-2 rounded bg-blue-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-300">
                    open
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-400">
                {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : 'never saved'} ·{' '}
                {s.elementCount} elements
              </span>
            </button>
            {s.id !== currentId && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${s.title}" from this browser? A cloud copy (if synced) is kept.`,
                    )
                  ) {
                    onDelete(s.id)
                    refresh()
                  }
                }}
                className="hidden rounded border border-gray-200 dark:border-slate-600 px-2 py-1 text-xs text-gray-400 hover:border-red-300 hover:text-red-500 group-hover:block"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>

      {userId && (
        <div className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            In the cloud only
          </h2>
          {cloudError && (
            <p className="text-xs text-gray-400">Couldn't reach the cloud library.</p>
          )}
          {cloud === null && !cloudError && <p className="text-xs text-gray-400">Loading…</p>}
          {cloud !== null && cloudOnly.length === 0 && (
            <p className="text-xs text-gray-400">Everything in the cloud is also on this device.</p>
          )}
          <ul className="flex flex-col gap-2">
            {cloudOnly.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded border border-dashed border-gray-300 dark:border-slate-600 p-3"
              >
                <button onClick={() => onOpen(s.id)} className="flex-1 text-left">
                  <span className="block font-medium text-gray-700 dark:text-gray-200">
                    {s.title}
                  </span>
                  <span className="text-xs text-gray-400">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ''} · download & open
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
