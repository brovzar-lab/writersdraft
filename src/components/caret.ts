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
