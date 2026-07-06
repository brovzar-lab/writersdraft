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

/**
 * Wrapped display lines for one element, memoized on element identity.
 * Elements are immutable (every edit creates a new object), so a WeakMap
 * keyed on the object is exact: an unchanged element can never return stale
 * lines, and dropped elements are garbage-collected with their cache entry.
 * Correctness never depends on the cache — only speed.
 */
const lineCache = new WeakMap<ScriptElement, string[]>()

export function elementLines(el: ScriptElement): string[] {
  const cached = lineCache.get(el)
  if (cached) return cached
  const lines = wrapText(el.text, ELEMENT_LAYOUT[el.type].width)
  lineCache.set(el, lines)
  return lines
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

function toBlocks(elements: ScriptElement[]): Block[] {
  return elements.map((element, elementIndex) => ({
    element,
    elementIndex,
    lines: elementLines(element),
  }))
}

/**
 * Paginate the script into pages of LINES_PER_PAGE lines.
 * Deterministic and pure — drives both the on-screen page view and export.
 */
export function paginate(elements: ScriptElement[]): Page[] {
  return paginateBlocks(toBlocks(elements), 0, 0)
}

/**
 * Core layout loop. `startBlock`/`pageOffset` let paginateIncremental resume
 * at a clean page boundary; paginate() always runs it from the top.
 */
function paginateBlocks(blocks: Block[], startBlock: number, pageOffset: number): Page[] {
  const pages: Page[] = []
  let current: PageLine[] = []

  const remaining = () => LINES_PER_PAGE - current.length
  // All mutation goes through these closures: `current` is reassigned by
  // flushPage, so helpers must never hold a direct reference to the array.
  const push = (l: PageLine) => current.push(l)
  const pageIsEmpty = () => current.length === 0

  const flushPage = () => {
    pages.push({ number: pageOffset + pages.length + 1, lines: current })
    current = []
  }

  /**
   * Flush because a dialogue-group block didn't fit — but a character cue
   * (and any parentheticals) sitting at the bottom of the page belong WITH
   * that block: carry them over so the cue is never orphaned.
   */
  const flushPageCarryingGroup = () => {
    let cut = current.length
    while (cut > 0) {
      const line = current[cut - 1]
      if (line.kind === 'text' && (line.type === 'character' || line.type === 'parenthetical')) {
        cut--
      } else {
        break
      }
    }
    if (cut === current.length) {
      // Nothing to carry (e.g. page ends in action).
      flushPage()
      return
    }
    const carried = current.slice(cut)
    // The spacing blank(s) before the carried cue must not end the page.
    let end = cut
    while (end > 0 && current[end - 1].kind === 'blank') end--
    if (end === 0) {
      // The page is nothing but the group — carrying would flush an empty
      // page; fall back to a plain flush.
      flushPage()
      return
    }
    current = current.slice(0, end)
    flushPage()
    current = carried
  }

  /**
   * Lines the block needs on the current page including spacing, and the
   * minimum chunk that must fit to avoid an ugly break.
   */
  const spaceBefore = (b: Block) =>
    current.length === 0 ? 0 : ELEMENT_LAYOUT[b.element.type].spaceBefore

  for (let i = startBlock; i < blocks.length; i++) {
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

    // Dialogue and parentheticals must drag their character cue along when
    // they flush; anything else flushes plainly.
    const isCuedGroupMember = b.element.type === 'dialogue' || b.element.type === 'parenthetical'

    if (b.lines.length <= 2 || keepWithNext || isEmpty) {
      // Small or protected blocks move to the next page whole.
      if (need > remaining() && !pageIsEmpty()) {
        if (isCuedGroupMember) flushPageCarryingGroup()
        else flushPage()
      }
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
      if (isCuedGroupMember) flushPageCarryingGroup()
      else flushPage()
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

  // A script always renders at least one page (only relevant to full runs;
  // a resumed run contributing zero pages is legitimate).
  if (current.length > 0 || (pages.length === 0 && pageOffset === 0)) flushPage()
  return pages
}

/** Previous pagination run, for incremental repagination. */
export interface PaginationCache {
  elements: ScriptElement[]
  pages: Page[]
}

/**
 * Repaginate after an edit, reusing every page from the previous run that
 * provably cannot have changed. Pages are reusable while (a) every block on
 * them — including the one-block keep-with-next lookahead — precedes the
 * first changed element, and (b) they end exactly at a block boundary (a
 * mid-block split resumes with paginator state we can't reconstruct).
 * Falls back to the full pure paginate() whenever unsure; output is always
 * identical to paginate(elements), which the equivalence tests enforce.
 */
export function paginateIncremental(
  elements: ScriptElement[],
  prev: PaginationCache | null,
): Page[] {
  if (!prev || prev.pages.length === 0) return paginate(elements)
  const old = prev.elements
  if (old === elements) return prev.pages

  // First structurally changed element (elements are immutable, so identity
  // comparison is exact).
  const minLen = Math.min(old.length, elements.length)
  let changed = 0
  while (changed < minLen && old[changed] === elements[changed]) changed++
  if (changed === old.length && changed === elements.length) return prev.pages

  let reuse = 0 // number of leading pages to reuse verbatim
  for (let p = 0; p < prev.pages.length - 1; p++) {
    const page = prev.pages[p]
    let maxIdx = -1
    for (const line of page.lines) {
      if (line.elementIndex > maxIdx) maxIdx = line.elementIndex
    }
    // Even the keep-with-next lookahead from this page's last block must
    // have seen only unchanged elements.
    if (maxIdx > changed - 2) break
    const first = prev.pages[p + 1].lines[0]
    const cleanBoundary =
      first !== undefined &&
      first.kind === 'text' &&
      first.lineIndex === 0 &&
      first.elementIndex === maxIdx + 1
    if (!cleanBoundary) continue
    // WHY the page ended is decided while processing the next page's first
    // block, so that decision's entire read-horizon must precede the change:
    //  - a dialogue-group member can trigger a cue carry-over, which reads
    //    the whole contiguous group plus one lookahead block;
    //  - a keep-with-next block (scene heading / shot) reads one block ahead;
    //  - anything else reads only itself.
    const startIdx = maxIdx + 1
    let decisionEnd = startIdx
    const startType = old[startIdx].type
    if (DIALOGUE_GROUP.has(startType)) {
      let groupEnd = startIdx
      while (groupEnd < old.length && DIALOGUE_GROUP.has(old[groupEnd].type)) groupEnd++
      decisionEnd = groupEnd
    } else if (startType === 'scene_heading' || startType === 'shot') {
      decisionEnd = startIdx + 1
    }
    if (decisionEnd >= changed) continue
    reuse = p + 1
  }
  if (reuse === 0) return paginate(elements)

  // Elements before `changed` are identical in both arrays, so the resume
  // index (< changed) addresses the same element in the new array.
  const resumeIdx = prev.pages[reuse].lines[0].elementIndex
  const tail = paginateBlocks(toBlocks(elements), resumeIdx, reuse)
  return [...prev.pages.slice(0, reuse), ...tail]
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
