/**
 * Beat Board: color-coded index cards, one per scene. Drag a card onto
 * another to move the whole scene there in the actual script.
 */
import { useState } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'

const CARD_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#cbd5e1']

export function BeatBoard() {
  const scenes = useScriptStore((s) => s.scenes)()
  const { setSceneMeta, moveScene } = useScriptStore()
  const setView = useUiStore((s) => s.setView)
  const requestCaret = useUiStore((s) => s.requestCaret)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-1 text-gray-800 dark:text-gray-100">Beat Board</h1>
      <p className="text-sm text-gray-500 mb-4">
        Drag a card onto another to reorder scenes in the script. Click a color to code your storylines.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {scenes.map((sc, i) => (
          <div
            key={sc.id}
            draggable
            onDragStart={() => setDragId(sc.id)}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(sc.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dragId !== sc.id) moveScene(dragId, sc.id)
              setDragId(null)
              setOverId(null)
            }}
            className={`rounded-lg border bg-white dark:bg-slate-800 shadow-sm p-3 cursor-grab active:cursor-grabbing transition
              ${overId === sc.id && dragId !== sc.id ? 'ring-2 ring-blue-400' : 'border-gray-200 dark:border-slate-700'}
              ${dragId === sc.id ? 'opacity-50' : ''}`}
            style={{ borderTop: `6px solid ${sc.color ?? '#cbd5e1'}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400">#{sc.sceneNumber ?? i + 1}</span>
              <div className="flex gap-1">
                {CARD_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`color ${c}`}
                    onClick={() => setSceneMeta(sc.id, { color: c })}
                    className="h-3 w-3 rounded-full border border-black/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <button
              className="text-left font-screenplay text-sm font-bold uppercase text-gray-800 dark:text-gray-100 hover:underline"
              onClick={() => {
                setView('editor')
                requestCaret(sc.id, 0, true)
              }}
            >
              {sc.heading}
            </button>
            <textarea
              className="mt-2 w-full resize-none rounded border border-gray-200 dark:border-slate-700 bg-transparent p-1.5 text-xs text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
              rows={3}
              placeholder="Synopsis / beat…"
              value={sc.synopsis ?? ''}
              onChange={(e) => setSceneMeta(sc.id, { synopsis: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
