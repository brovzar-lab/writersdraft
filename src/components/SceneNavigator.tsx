/** Sidebar scene list: click to jump, shows page numbers and colors. */
import { useMemo } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { paginate, elementPageMap } from '../engine/pagination'

export function SceneNavigator() {
  const script = useScriptStore((s) => s.script)
  const scenes = useScriptStore((s) => s.scenes)()
  const requestCaret = useUiStore((s) => s.requestCaret)

  const pageOf = useMemo(() => elementPageMap(paginate(script.elements)), [script.elements])

  return (
    <nav className="flex flex-col gap-1 p-2 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-2 pt-2">
        Scenes
      </h2>
      {scenes.length === 0 && (
        <p className="text-sm text-gray-400 px-2">No scenes yet.</p>
      )}
      {scenes.map((sc, i) => (
        <button
          key={sc.id}
          onClick={() => {
            requestCaret(sc.id, script.elements[sc.index].text.length)
            document
              .querySelector(`[data-element-id="${sc.id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }}
          className="flex items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-200 dark:hover:bg-slate-700"
        >
          <span
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: sc.color ?? '#cbd5e1' }}
          />
          <span className="flex-1 min-w-0">
            <span className="block truncate font-medium text-gray-800 dark:text-gray-100">
              {sc.sceneNumber ? `${sc.sceneNumber}. ` : `${i + 1}. `}
              {sc.heading}
            </span>
            {sc.synopsis && (
              <span className="block truncate text-xs text-gray-500">{sc.synopsis}</span>
            )}
          </span>
          <span className="text-xs text-gray-400 shrink-0">p{pageOf.get(sc.id) ?? 1}</span>
        </button>
      ))}
    </nav>
  )
}
