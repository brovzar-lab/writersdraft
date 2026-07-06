/**
 * Story Bible: treatment, outline, character bios and research live in the
 * same file as the screenplay — plot in prose, then draft in the editor.
 */
import { useState } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import type { StoryDoc } from '../types'

const KINDS: Array<{ kind: StoryDoc['kind']; label: string }> = [
  { kind: 'treatment', label: 'Treatment' },
  { kind: 'outline', label: 'Outline' },
  { kind: 'bio', label: 'Character Bios' },
  { kind: 'research', label: 'Research' },
]

export function StoryBible() {
  const docs = useScriptStore((s) => s.script.docs)
  const { addDoc, updateDoc, removeDoc } = useScriptStore()
  const [kind, setKind] = useState<StoryDoc['kind']>('treatment')
  const [openId, setOpenId] = useState<string | null>(null)

  const inKind = docs.filter((d) => d.kind === kind)
  const open = docs.find((d) => d.id === openId && d.kind === kind) ?? inKind[0]

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-3 overflow-y-auto">
        <div className="flex flex-col gap-1 mb-4">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => {
                setKind(k.kind)
                setOpenId(null)
              }}
              className={`rounded px-2 py-1 text-left text-sm ${
                kind === k.kind
                  ? 'bg-blue-100 dark:bg-slate-700 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {k.label}
              <span className="ml-1 text-xs text-gray-400">
                {docs.filter((d) => d.kind === k.kind).length || ''}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const d = addDoc(kind, 'Untitled')
            setOpenId(d.id)
          }}
          className="w-full rounded border border-dashed border-gray-300 dark:border-slate-600 px-2 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          + New document
        </button>
        <ul className="mt-3 flex flex-col gap-1">
          {inKind.map((d) => (
            <li key={d.id} className="group flex items-center">
              <button
                onClick={() => setOpenId(d.id)}
                className={`flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                  open?.id === d.id
                    ? 'bg-white dark:bg-slate-900 shadow-sm'
                    : 'hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {d.title || 'Untitled'}
              </button>
              <button
                onClick={() => removeDoc(d.id)}
                className="ml-1 hidden text-gray-400 hover:text-red-500 group-hover:inline"
                aria-label={`delete ${d.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        {open ? (
          <div className="mx-auto max-w-2xl">
            <input
              className="w-full bg-transparent text-2xl font-semibold outline-none text-gray-800 dark:text-gray-100"
              value={open.title}
              placeholder="Title"
              onChange={(e) => updateDoc(open.id, { title: e.target.value })}
            />
            <textarea
              className="mt-4 min-h-[70vh] w-full resize-none bg-transparent leading-relaxed outline-none text-gray-700 dark:text-gray-200"
              value={open.content}
              placeholder="Write your treatment, beats, bios, research…"
              onChange={(e) => updateDoc(open.id, { content: e.target.value })}
            />
          </div>
        ) : (
          <p className="mt-20 text-center text-gray-400">
            No {KINDS.find((k) => k.kind === kind)?.label.toLowerCase()} yet — create one on the left.
          </p>
        )}
      </main>
    </div>
  )
}
