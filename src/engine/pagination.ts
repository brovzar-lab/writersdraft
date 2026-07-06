/**
 * Real-time dynamic pagination.
 *
 * US Letter, Courier 12pt: 10 characters per horizontal inch, 6 lines per
 * vertical inch. Margins: 1.5" left, 1" right/top/bottom, giving a 6" wide
 * body and 55 usable lines per page (industry standard).
 *
 * Element layout (indent measured in characters from the 1.5" left margin):
 *
 *   Scene Heading  indent 0   width 60
 *   Action         indent 0   width 60
 *   Character      indent 22  width 38   (starts at 3.7")
 *   Parenthetical  indent 16  width 25   (starts at 3.1")
 *   Dialogue       indent 10  width 35   (starts at 2.5")
 *   Transition     right-aligned to the 7.5" column
 *   Shot           indent 0   width 60
 *
 * Page-break etiquette implemented here:
 *  - a Scene Heading or Shot is never orphaned at the bottom of a page;
 *  - a Character cue is never separated from its dialogue block;
 *  - dialogue split across pages gets (MORE) at the bottom and the character
 *    cue repeated with (CONT'D) at the top of the next page;
 *  - a Parenthetical line is never the last line before a break.
 */
import type { ElementType, Page, PageLine, ScriptElement } from '../types'

export const LINES_PER_PAGE = 55
export const PAGE_WIDTH_CHARS = 60

export interface ElementLayout {
  indent: number
  width: number
  rightAlign?: boolean
  /** Blank lines inserted before this element (when not at top of a page). */
  spaceBefore: number
}

export const ELEMENT_LAYOUT: Record<ElementType, ElementLayout> = {
  scene_heading: { indent: 0, width: 60, spaceBefore: 2 },
  action: { indent: 0, width: 60, spaceBefore: 1 },
  character: { indent: 22, width: 38, spaceBefore: 1 },
  dialogue: { indent: 10, width: 35, spaceBefore: 0 },
  parenthetical: { indent: 16, width: 25, spaceBefore: 0 },
  transition: { indent: 0, width: 60, rightAlign: true, spaceBefore: 1 },
  shot: { indent: 0, width: 60, spaceBefore: 1 },
  general: { indent: 0, width: 60, spaceBefore: 1 },
}

/** Word-wrap `text` to `width` columns (monospace). Never returns []. */
export function wrapText(text: string, width: number): string[] {
  if (text.length === 0) return ['']
  const lines: string[] = []
  for (const hard of text.split('\n')) {
    if (hard.length === 0) {
      lines.push('')
      continue
    }
    const words = hard.split(' ')
    let line = ''
    for (const word of words) {
      if (line === '') {
        // A single word longer than the column is hard-broken.
        let w = word
        while (w.length > width) {
          lines.push(w.slice(0, width))
          w = w.slice(width)
        }
        line = w
      } else if (line.length + 1 + word.length <= width) {
        line += ' ' + word
      } else {
        lines.push(line)
        let w = word
        while (w.length > width) {
          lines.push(w.slice(0, width))
          w = w.slice(width)
        }
        line = w
      }
    }
    lines.push(line)
  }
  return lines
}

/** Wrapped display lines for one element. */
export function elementLines(el: ScriptElement): string[] {
  return wrapText(el.text, ELEMENT_LAYOUT[el.type].width)
}

interface Block {
  element: ScriptElement
  elementIndex: number
  lines: string[]
}

function textLine(b: Block, lineIndex: number): PageLine {
  return {
    elementId: b.element.id,
    elementIndex: b.elementIndex,
    type: b.element.type,
    text: b.lines[lineIndex],
    lineIndex,
    kind: 'text',
  }
}

function blankLine(b: Block): PageLine {
  return {
    elementId: b.element.id,
    elementIndex: b.elementIndex,
    type: b.element.type,
    text: '',
    lineIndex: -1,
    kind: 'blank',
  }
}

const DIALOGUE_GROUP: ReadonlySet<ElementType> = new Set([
  'character', 'dialogue', 'parenthetical',
])

/**
 * Paginate the script into pages of LINES_PER_PAGE lines.
 * Deterministic and pure — drives both the on-screen page view and export.
 */
export function paginate(elements: ScriptElement[]): Page[] {
  const blocks: Block[] = elements.map((element, elementIndex) => ({
    element,
    elementIndex,
    lines: elementLines(element),
  }))

  const pages: Page[] = []
  let current: PageLine[] = []

  const remaining = () => LINES_PER_PAGE - current.length
  // All mutation goes through these closures: `current` is reassigned by
  // flushPage, so helpers must never hold a direct reference to the array.
  const push = (l: PageLine) => current.push(l)
  const pageIsEmpty = () => current.length === 0

  const flushPage = () => {
    pages.push({ number: pages.length + 1, lines: current })
    current = []
  }

  /**
   * Lines the block needs on the current page including spacing, and the
   * minimum chunk that must fit to avoid an ugly break.
   */
  const spaceBefore = (b: Block) =>
    current.length === 0 ? 0 : ELEMENT_LAYOUT[b.element.type].spaceBefore

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const isEmpty = b.element.text === '' && b.lines.length === 1

    // Keep-with-next: never orphan a scene heading / shot / character cue.
    const keepWithNext =
      b.element.type === 'scene_heading' ||
      b.element.type === 'shot' ||
      b.element.type === 'character' ||
      b.element.type === 'parenthetical'

    const gap = spaceBefore(b)
    let need = gap + b.lines.length
    if (keepWithNext) {
      // Require at least one following line to also fit.
      const next = blocks[i + 1]
      if (next) need += ELEMENT_LAYOUT[next.element.type].spaceBefore + 1
    }

    if (b.lines.length <= 2 || keepWithNext || isEmpty) {
      // Small or protected blocks move to the next page whole.
      if (need > remaining() && !pageIsEmpty()) flushPage()
      const g = spaceBefore(b)
      for (let k = 0; k < g; k++) push(blankLine(b))
      for (let li = 0; li < b.lines.length; li++) {
        if (remaining() === 0) flushPage()
        push(textLine(b, li))
      }
      continue
    }

    // Large action/dialogue blocks may split across pages.
    let gap2 = spaceBefore(b)
    if (gap2 + 2 > remaining() && !pageIsEmpty()) {
      // Not enough room for the gap plus a decent chunk (2 lines minimum).
      flushPage()
      gap2 = 0
    }
    for (let k = 0; k < gap2; k++) push(blankLine(b))

    if (b.element.type === 'dialogue') {
      paginateDialogue(b, blocks, i, push, flushPage, remaining)
    } else {
      for (let li = 0; li < b.lines.length; li++) {
        if (remaining() === 0) flushPage()
        push(textLine(b, li))
      }
    }
  }

  if (current.length > 0 || pages.length === 0) flushPage()
  return pages
}

/** Split dialogue with (MORE) / CHARACTER (CONT'D) etiquette. */
function paginateDialogue(
  b: Block,
  blocks: Block[],
  i: number,
  push: (l: PageLine) => void,
  flushPage: () => void,
  remaining: () => number,
): void {
  // Find the owning character cue (walk back over parentheticals).
  let cueText = ''
  for (let j = i - 1; j >= 0; j--) {
    const t = blocks[j].element.type
    if (t === 'character') {
      cueText = blocks[j].element.text.toUpperCase()
      break
    }
    if (!DIALOGUE_GROUP.has(t)) break
  }

  let li = 0
  while (li < b.lines.length) {
    const left = remaining()
    const linesLeft = b.lines.length - li
    if (linesLeft <= left) {
      for (; li < b.lines.length; li++) push(textLine(b, li))
      return
    }
    // Need to break: leave room for the (MORE) marker and keep at least
    // one dialogue line on this page; otherwise push it all to next page.
    const usable = left - 1 // reserve one line for (MORE)
    if (usable < 1) {
      flushPage()
      if (cueText) {
        push({
          elementId: b.element.id,
          elementIndex: b.elementIndex,
          type: 'character',
          text: `${cueText} (CONT'D)`,
          lineIndex: -1,
          kind: 'contd',
        })
      }
      continue
    }
    const take = Math.min(usable, linesLeft - 1)
    for (let k = 0; k < take; k++, li++) push(textLine(b, li))
    push({
      elementId: b.element.id,
      elementIndex: b.elementIndex,
      type: 'dialogue',
      text: '(MORE)',
      lineIndex: -1,
      kind: 'more',
    })
    flushPage()
    if (cueText) {
      push({
        elementId: b.element.id,
        elementIndex: b.elementIndex,
        type: 'character',
        text: `${cueText} (CONT'D)`,
        lineIndex: -1,
        kind: 'contd',
      })
    }
  }
}

/** Estimated page count without building full page objects. */
export function pageCount(elements: ScriptElement[]): number {
  return paginate(elements).length
}

/** 1-based page number each element starts on (for the scene navigator). */
export function elementPageMap(pages: Page[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.kind === 'text' && !map.has(line.elementId)) {
        map.set(line.elementId, page.number)
      }
    }
  }
  return map
}
