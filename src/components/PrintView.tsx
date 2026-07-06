/**
 * Print-exact rendering: a title page plus one fixed 55-line body per US
 * Letter page, produced from the same paginate() output as the editor.
 * Mounted only while printing (App wires beforeprint/afterprint and Ctrl+P),
 * always black-on-white regardless of the app theme, and paged with
 * break-after so the browser's Save-as-PDF emits a submittable screenplay.
 */
import { useScriptStore } from '../stores/scriptStore'
import { ELEMENT_LAYOUT } from '../engine/pagination'
import { usePagination } from './PaginationContext'
import { UPPERCASE_TYPES } from '../engine/stateMachine'
import type { PageLine } from '../types'

function PrintLine({ line, sceneNumber }: { line: PageLine; sceneNumber?: string }) {
  if (line.kind === 'blank') {
    return <div style={{ height: '12pt' }} />
  }
  const type = line.kind === 'more' ? 'dialogue' : line.kind === 'contd' ? 'character' : line.type
  const layout = ELEMENT_LAYOUT[type]
  const upper = line.kind === 'contd' || UPPERCASE_TYPES.has(type)
  return (
    <div
      style={{
        marginLeft: layout.rightAlign ? undefined : `${layout.indent}ch`,
        maxWidth: `${layout.width}ch`,
        textAlign: layout.rightAlign ? 'right' : 'left',
        textTransform: upper ? 'uppercase' : undefined,
        lineHeight: '12pt',
        height: '12pt',
        whiteSpace: 'pre',
        position: 'relative',
      }}
    >
      {sceneNumber && (
        <>
          <span style={{ position: 'absolute', left: '-0.9in' }}>{sceneNumber}</span>
          <span style={{ position: 'absolute', right: '-0.7in' }}>{sceneNumber}</span>
        </>
      )}
      {line.text}
    </div>
  )
}

export function PrintView() {
  const { pages } = usePagination()
  const titlePage = useScriptStore((s) => s.script.titlePage)
  const elements = useScriptStore((s) => s.script.elements)
  const sceneNumberOf = new Map<string, string>()
  for (const el of elements) {
    if (el.type === 'scene_heading' && el.sceneNumber) sceneNumberOf.set(el.id, el.sceneNumber)
  }

  return (
    <div className="print-root font-screenplay">
      <section className="print-page">
        <div className="print-title-block">
          <div style={{ textTransform: 'uppercase' }}>{titlePage.title || 'UNTITLED'}</div>
          <div style={{ height: '48pt' }} />
          <div>written by</div>
          <div style={{ height: '24pt' }} />
          <div>{titlePage.author}</div>
          {titlePage.draftDate && (
            <>
              <div style={{ height: '48pt' }} />
              <div>{titlePage.draftDate}</div>
            </>
          )}
        </div>
        {titlePage.contact && <div className="print-contact">{titlePage.contact}</div>}
      </section>
      {pages.map((page) => (
        <section key={page.number} className="print-page">
          {page.number > 1 && <span className="print-page-number">{page.number}.</span>}
          <div className="print-body">
            {page.lines.map((line, i) => (
              <PrintLine
                key={i}
                line={line}
                sceneNumber={
                  line.kind === 'text' && line.lineIndex === 0 && line.type === 'scene_heading'
                    ? sceneNumberOf.get(line.elementId)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
