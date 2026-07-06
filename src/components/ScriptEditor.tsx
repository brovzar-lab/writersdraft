/**
 * The paginated editor surface. Elements render in page-sized containers;
 * page breaks come from the real paginator so what you see is what prints.
 */
import { useMemo } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { paginate, elementPageMap, ELEMENT_LAYOUT } from '../engine/pagination'
import { ElementBlock } from './ElementBlock'

export function ScriptEditor() {
  const elements = useScriptStore((s) => s.script.elements)
  const tagFilter = useUiStore((s) => s.tagFilter)

  const pages = useMemo(() => paginate(elements), [elements])
  const pageOf = useMemo(() => elementPageMap(pages), [pages])

  // Group elements by the page they start on.
  const grouped = useMemo(() => {
    const map = new Map<number, typeof elements>()
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
        <div
          key={n}
          className="script-page bg-white dark:bg-slate-900 shadow-lg rounded-sm relative"
        >
          {n > 1 && (
            <span className="absolute top-[0.5in] right-[1in] font-screenplay text-black dark:text-gray-200 select-none">
              {n}.
            </span>
          )}
          <div className="flex flex-col gap-[12pt] text-black dark:text-gray-100">
            {grouped.get(n)!.map((el) => {
              const dim =
                tagFilter && !(el.tags ?? []).includes(tagFilter)
              return (
                <div key={el.id} className={dim ? 'opacity-30' : ''}>
                  <ElementBlock element={el} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export { ELEMENT_LAYOUT }
