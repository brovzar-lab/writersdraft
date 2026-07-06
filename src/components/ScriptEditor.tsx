/**
 * The paginated editor surface. Page breaks come from the shared pagination
 * context (one incremental pagination per keystroke). Pages are virtualized:
 * only pages near the viewport — plus any page holding the active element or
 * a pending caret target — mount their contentEditable blocks; the rest keep
 * their height with an empty placeholder.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { ELEMENT_LAYOUT } from '../engine/pagination'
import { usePagination } from './PaginationContext'
import { ElementBlock } from './ElementBlock'
import type { ScriptElement } from '../types'

export function ScriptEditor() {
  const elements = useScriptStore((s) => s.script.elements)
  const { pageOf } = usePagination()
  const [printing, setPrinting] = useState(false)

  // window.print() must never truncate to the mounted window.
  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  // Group elements by the page they start on.
  const grouped = useMemo(() => {
    const map = new Map<number, ScriptElement[]>()
    for (const el of elements) {
      const p = pageOf.get(el.id) ?? 1
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(el)
    }
    return map
  }, [elements, pageOf])

  const pageNumbers = [...grouped.keys()].sort((a, b) => a - b)

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {pageNumbers.map((n) => (
        <EditorPage key={n} number={n} pageElements={grouped.get(n)!} forceMount={printing} />
      ))}
    </div>
  )
}

const EditorPage = memo(function EditorPage({
  number,
  pageElements,
  forceMount,
}: {
  number: number
  pageElements: ScriptElement[]
  forceMount: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(number <= 2)
  const tagFilter = useUiStore((s) => s.tagFilter)

  // A page must mount when the caret is headed to (or already in) one of its
  // elements, even if it is off-screen — navigator jumps and Enter at a page
  // boundary depend on it.
  const holdsFocus = useUiStore((s) => {
    const target = s.pendingCaret?.elementId ?? s.activeElementId
    return target != null && pageElements.some((el) => el.id === target)
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNearViewport(entry.isIntersecting)
      },
      { rootMargin: '1500px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const mounted = nearViewport || holdsFocus || forceMount

  return (
    <div
      ref={ref}
      data-page-number={number}
      className="script-page bg-white dark:bg-slate-900 shadow-lg rounded-sm relative"
    >
      {number > 1 && (
        <span className="absolute top-[0.5in] right-[1in] font-screenplay text-black dark:text-gray-200 select-none">
          {number}.
        </span>
      )}
      {mounted ? (
        <div className="flex flex-col gap-[12pt] text-black dark:text-gray-100">
          {pageElements.map((el) => {
            const dim = tagFilter && !(el.tags ?? []).includes(tagFilter)
            return (
              <div key={el.id} className={dim ? 'opacity-30' : ''}>
                <ElementBlock element={el} />
              </div>
            )
          })}
        </div>
      ) : (
        <div aria-hidden className="h-[9in]" />
      )}
    </div>
  )
})

export { ELEMENT_LAYOUT }
