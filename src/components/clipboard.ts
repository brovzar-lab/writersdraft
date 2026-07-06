/**
 * The clipboard pipeline: paste runs through the Fountain body parser so
 * raw script text splits into correctly typed elements, and cross-element
 * copies serialize as Fountain so types survive the round trip.
 */
import { parseFountainBody, elementsToFountain } from '../engine/fountain'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import type { BlockRange } from './caret'

/**
 * Paste plain text at a caret. Multi-line text is parsed into typed
 * elements; single-line text inserts literally into the current element.
 * Returns true when the paste was handled.
 */
export function pastePlainText(elementId: string, caret: number, raw: string): boolean {
  const text = raw.replace(/\r\n?/g, '\n')
  if (text === '') return false
  const store = useScriptStore.getState()

  if (!text.includes('\n')) {
    const el = store.script.elements.find((e) => e.id === elementId)
    if (!el) return false
    store.checkpoint()
    store.updateElementText(elementId, el.text.slice(0, caret) + text + el.text.slice(caret))
    useUiStore.getState().requestCaret(elementId, caret + text.length)
    return true
  }

  const parts = parseFountainBody(text.split('\n'))
  if (parts.length === 0) return false
  const target = store.pasteElements(elementId, caret, parts)
  if (target) useUiStore.getState().requestCaret(target.focusId, target.offset)
  return target !== null
}

/** Delete a (possibly cross-block) selection range; caret lands at the join. */
export function deleteSelectedRange(range: BlockRange): { focusId: string; offset: number } | null {
  const res = useScriptStore
    .getState()
    .deleteRange(range.startId, range.startOffset, range.endId, range.endOffset)
  if (res) useUiStore.getState().requestCaret(res.focusId, res.offset)
  return res
}

/** The selected range serialized as Fountain (for copy/cut). */
export function rangeToClipboardText(range: BlockRange): string {
  const parts = useScriptStore
    .getState()
    .extractRange(range.startId, range.startOffset, range.endId, range.endOffset)
  return elementsToFountain(parts)
}
