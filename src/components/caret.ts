/** Caret helpers for contentEditable element blocks (plain-text content). */

export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return 0
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

export function hasSelection(): boolean {
  const sel = window.getSelection()
  return !!sel && !sel.isCollapsed
}

/** Character offset of a (node, nodeOffset) boundary within a block. */
function offsetIn(block: HTMLElement, node: Node, nodeOffset: number): number {
  const r = document.createRange()
  r.selectNodeContents(block)
  r.setEnd(node, nodeOffset)
  return r.toString().length
}

export interface BlockRange {
  startId: string
  startOffset: number
  endId: string
  endOffset: number
}

/**
 * The current DOM selection resolved to element blocks. Returns null when
 * there is no selection or a boundary is outside any element block;
 * `crossBlock` distinguishes a spanning selection from a same-block one.
 */
export function getBlockSelection(): (BlockRange & { crossBlock: boolean }) | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const blockOf = (node: Node): HTMLElement | null => {
    const el = node instanceof HTMLElement ? node : node.parentElement
    return el?.closest('[data-element-id]') ?? null
  }
  const startBlock = blockOf(range.startContainer)
  const endBlock = blockOf(range.endContainer)
  if (!startBlock || !endBlock) return null
  return {
    startId: startBlock.dataset.elementId!,
    startOffset: offsetIn(startBlock, range.startContainer, range.startOffset),
    endId: endBlock.dataset.elementId!,
    endOffset: offsetIn(endBlock, range.endContainer, range.endOffset),
    crossBlock: startBlock !== endBlock,
  }
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  let remaining = Math.max(0, Math.min(offset, el.textContent?.length ?? 0))
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  if (!node) {
    range.selectNodeContents(el)
    range.collapse(false)
  } else {
    while (node) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) {
        range.setStart(node, remaining)
        range.collapse(true)
        break
      }
      remaining -= len
      const next = walker.nextNode() as Text | null
      if (!next) {
        range.setStart(node, len)
        range.collapse(true)
        break
      }
      node = next
    }
  }
  sel.removeAllRanges()
  sel.addRange(range)
  el.focus()
}
