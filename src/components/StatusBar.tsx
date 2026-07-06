/** Bottom status bar: pages, words, scenes, sprint, current element hints. */
import { useEffect, useMemo, useState } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { usePagination } from './PaginationContext'
import { countWords } from '../engine/analysis'
import { ELEMENT_LABELS } from '../types'
import { NEXT_ON_ENTER, NEXT_ON_TAB } from '../engine/stateMachine'

export function StatusBar() {
  const elements = useScriptStore((s) => s.script.elements)
  const dirty = useScriptStore((s) => s.dirty)
  const activeElementId = useUiStore((s) => s.activeElementId)

  const pages = usePagination().pages.length
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
      <SprintStatus words={words} />
      {active && (
        <span className="ml-auto">
          <b className="text-gray-700 dark:text-gray-300">{ELEMENT_LABELS[active.type]}</b>
          {' · '}Enter → {ELEMENT_LABELS[NEXT_ON_ENTER[active.type]]}
          {' · '}Tab → {ELEMENT_LABELS[NEXT_ON_TAB[active.type]]}
        </span>
      )}
      <span className={active ? '' : 'ml-auto'}>{dirty ? '● unsaved' : '✓ saved'}</span>
      <StorageIndicator />
    </footer>
  )
}

/**
 * Honest storage state. 'granted' means the browser promised not to evict
 * this origin's data under disk pressure; anything else means it might,
 * and the tooltip says so instead of pretending saves are invincible.
 */
function StorageIndicator() {
  const persist = useUiStore((s) => s.storagePersist)
  if (persist === null || persist === 'unsupported') return null
  if (persist === 'granted') {
    return (
      <span
        data-testid="storage-indicator"
        title="The browser granted persistent storage — your local drafts won't be evicted under disk pressure."
        className="text-green-600"
      >
        🛡 storage protected
      </span>
    )
  }
  return (
    <span
      data-testid="storage-indicator"
      title="The browser declined persistent storage: under disk pressure it may evict this site's data. Adding an account (cloud copy) protects your work."
      className="text-amber-600"
    >
      ⚠ storage evictable
    </span>
  )
}

function SprintStatus({ words }: { words: number }) {
  const sprint = useUiStore((s) => s.sprint)
  const endSprint = useUiStore((s) => s.endSprint)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!sprint) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sprint])

  if (!sprint) return null
  const msLeft = Math.max(0, sprint.endsAt - now)
  const written = words - sprint.startWords
  const done = msLeft === 0
  const mm = Math.floor(msLeft / 60000)
  const ss = Math.floor((msLeft % 60000) / 1000)

  return (
    <span className={`flex items-center gap-2 ${done ? 'text-green-600' : 'text-amber-600'}`}>
      ⚡ {done ? 'Sprint done!' : `${mm}:${String(ss).padStart(2, '0')}`} · {written}/
      {sprint.targetWords} words
      <button
        onClick={() => {
          useScriptStore.getState().recordSnapshot(`Sprint: +${written} words`)
          endSprint()
        }}
        className="rounded border border-current px-1 text-[10px]"
      >
        {done ? 'Gather' : 'Stop'}
      </button>
    </span>
  )
}
