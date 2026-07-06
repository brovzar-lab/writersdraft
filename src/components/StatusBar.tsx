/** Bottom status bar: pages, words, scenes, current element hints. */
import { useMemo } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { paginate } from '../engine/pagination'
import { countWords } from '../engine/analysis'
import { ELEMENT_LABELS } from '../types'
import { NEXT_ON_ENTER, NEXT_ON_TAB } from '../engine/stateMachine'

export function StatusBar() {
  const elements = useScriptStore((s) => s.script.elements)
  const dirty = useScriptStore((s) => s.dirty)
  const activeElementId = useUiStore((s) => s.activeElementId)

  const pages = useMemo(() => paginate(elements).length, [elements])
  const words = useMemo(
    () => elements.reduce((a, el) => a + countWords(el.text), 0),
    [elements],
  )
  const sceneCount = useMemo(
    () => elements.filter((e) => e.type === 'scene_heading').length,
    [elements],
  )
  const active = elements.find((e) => e.id === activeElementId)

  return (
    <footer className="no-print flex items-center gap-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-xs text-gray-500">
      <span>
        {pages} page{pages === 1 ? '' : 's'}
      </span>
      <span>{words} words</span>
      <span>
        {sceneCount} scene{sceneCount === 1 ? '' : 's'}
      </span>
      {active && (
        <span className="ml-auto">
          <b className="text-gray-700 dark:text-gray-300">{ELEMENT_LABELS[active.type]}</b>
          {' · '}Enter → {ELEMENT_LABELS[NEXT_ON_ENTER[active.type]]}
          {' · '}Tab → {ELEMENT_LABELS[NEXT_ON_TAB[active.type]]}
        </span>
      )}
      <span className={active ? '' : 'ml-auto'}>{dirty ? '● unsaved' : '✓ saved'}</span>
    </footer>
  )
}
