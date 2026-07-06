/**
 * One editable screenplay element. A contentEditable div whose Tab/Enter/
 * Backspace behaviour is decided by the state machine in
 * src/engine/stateMachine.ts.
 *
 * Performance contract: this component renders thousands of times in a
 * feature-length script, so every store read is a narrow selector that only
 * changes for THIS block (actions are stable references; active/caret state
 * selects to a per-block boolean). A keystroke re-renders exactly the edited
 * block, not the script.
 */
import { memo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ScriptElement } from '../types'
import { ELEMENT_LAYOUT } from '../engine/pagination'
import {
  onEnter,
  onTab,
  onBackspaceAtStart,
  detectTypeFromText,
  normalizeText,
  cycleType,
  UPPERCASE_TYPES,
  NEXT_ON_ENTER,
} from '../engine/stateMachine'
import { useScriptStore } from '../stores/scriptStore'
import { useUiStore } from '../stores/uiStore'
import { useCollabStore } from '../stores/collabStore'
import { getCaretOffset, setCaretOffset, hasSelection } from './caret'

const PLACEHOLDERS: Partial<Record<ScriptElement['type'], string>> = {
  scene_heading: 'INT. LOCATION - DAY',
  character: 'CHARACTER NAME',
  dialogue: 'Dialogue…',
  parenthetical: '(beat)',
  transition: 'CUT TO:',
  action: 'Action…',
}

export const ElementBlock = memo(function ElementBlock({ element }: { element: ScriptElement }) {
  const ref = useRef<HTMLDivElement>(null)
  const updateElementText = useScriptStore((s) => s.updateElementText)
  const setElementType = useScriptStore((s) => s.setElementType)
  const insertElementAfter = useScriptStore((s) => s.insertElementAfter)
  const splitElement = useScriptStore((s) => s.splitElement)
  const mergeWithPrevious = useScriptStore((s) => s.mergeWithPrevious)
  const checkpoint = useScriptStore((s) => s.checkpoint)

  const active = useUiStore((s) => s.activeElementId === element.id)
  const setActiveElement = useUiStore((s) => s.setActiveElement)
  const requestCaret = useUiStore((s) => s.requestCaret)
  const clearPendingCaret = useUiStore((s) => s.clearPendingCaret)
  // Non-null only when the caret handoff targets this block.
  const caretTarget = useUiStore((s) =>
    s.pendingCaret?.elementId === element.id ? s.pendingCaret : null,
  )

  // Keep DOM text in sync with store (skip when it already matches — that is
  // the common case for self-originated edits and preserves the caret).
  useEffect(() => {
    const div = ref.current
    if (div && div.textContent !== element.text) {
      div.textContent = element.text
    }
  }, [element.text])

  // Programmatic caret handoff (after Enter/Tab/merge/navigation).
  useEffect(() => {
    if (caretTarget && ref.current) {
      if (caretTarget.center) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      setCaretOffset(ref.current, caretTarget.offset)
      setActiveElement(element.id)
      clearPendingCaret()
    }
  }, [caretTarget, element.id, setActiveElement, clearPendingCaret])

  const layout = ELEMENT_LAYOUT[element.type]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const div = ref.current!
    const caret = getCaretOffset(div)
    const ctx = { element, caret, hasSelection: hasSelection() }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      checkpoint()
      const act = onEnter(ctx)
      if (act.kind === 'transform' && act.type) {
        setElementType(element.id, act.type)
        requestCaret(element.id, 0)
      } else if (act.kind === 'create' && act.type) {
        const id = insertElementAfter(element.id, act.type)
        requestCaret(id, 0)
      } else if (act.kind === 'split' && act.type) {
        const id = splitElement(element.id, caret, act.type)
        requestCaret(id, 0)
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      checkpoint()
      if (e.shiftKey) {
        setElementType(element.id, cycleType(element.type, -1))
        requestCaret(element.id, caret)
        return
      }
      const act = onTab(ctx)
      if (act.kind === 'transform' && act.type) {
        setElementType(element.id, act.type)
        requestCaret(element.id, 0)
      } else if (act.kind === 'create' && act.type) {
        const id = insertElementAfter(element.id, act.type)
        requestCaret(id, 0)
      }
      return
    }

    if (e.key === 'Backspace') {
      const act = onBackspaceAtStart(ctx)
      if (act.kind === 'merge') {
        e.preventDefault()
        checkpoint()
        const res = mergeWithPrevious(element.id)
        if (res) requestCaret(res.prevId, res.joinAt)
      }
      return
    }

    // Arrow navigation across element boundaries.
    if (e.key === 'ArrowUp' && caret === 0) {
      const prev = neighbour(element.id, -1)
      if (prev) {
        e.preventDefault()
        requestCaret(prev.id, prev.text.length)
      }
    } else if (e.key === 'ArrowDown' && caret === (div.textContent?.length ?? 0)) {
      const next = neighbour(element.id, +1)
      if (next) {
        e.preventDefault()
        requestCaret(next.id, next.text.length)
      }
    }
  }

  const neighbour = (id: string, dir: -1 | 1) => {
    const els = useScriptStore.getState().script.elements
    const i = els.findIndex((el) => el.id === id)
    return els[i + dir] ?? null
  }

  const handleInput = () => {
    const div = ref.current!
    const text = div.textContent ?? ''
    updateElementText(element.id, text)
    const detected = detectTypeFromText(text, element.type)
    if (detected) {
      const caret = getCaretOffset(div)
      checkpoint()
      setElementType(element.id, detected)
      requestCaret(element.id, caret)
    }
  }

  const handleBlur = () => {
    const normal = normalizeText(element.type, element.text)
    if (normal !== element.text) updateElementText(element.id, normal)
  }

  // Re-renders only when the peers on THIS element change (shallow compare).
  const peers = useCollabStore(
    useShallow((s) => s.peers.filter((p) => p.elementId === element.id && p.userId !== s.selfId)),
  )

  return (
    <div className="relative">
      {peers.length > 0 && (
        <div className="absolute -right-2 top-0 flex translate-x-full flex-col gap-0.5">
          {peers.map((p) => (
            <span
              key={p.userId}
              className="rounded px-1 py-px text-[10px] text-white select-none"
              style={{ background: p.color }}
              title={`${p.name} is here`}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable={!element.locked}
        suppressContentEditableWarning
        spellCheck={element.type === 'action' || element.type === 'dialogue'}
        className={`element-block font-screenplay ${active ? 'bg-blue-50 dark:bg-slate-800/60' : ''}`}
        style={{
          marginLeft: layout.rightAlign ? undefined : `${layout.indent}ch`,
          maxWidth: `${layout.width}ch`,
          textAlign: layout.rightAlign ? 'right' : 'left',
          textTransform: UPPERCASE_TYPES.has(element.type) ? 'uppercase' : undefined,
          marginRight: layout.rightAlign ? 0 : undefined,
        }}
        data-element-id={element.id}
        data-element-type={element.type}
        data-placeholder={active ? PLACEHOLDERS[element.type] ?? '' : ''}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onFocus={() => setActiveElement(element.id)}
        onBlur={handleBlur}
      />
      {element.sceneNumber && element.type === 'scene_heading' && (
        <span className="absolute -left-10 top-0 font-screenplay text-gray-500 select-none">
          {element.sceneNumber}
        </span>
      )}
    </div>
  )
})

/** What Enter would create next — shown in the status bar as a hint. */
export function nextTypeHint(type: ScriptElement['type']): string {
  return NEXT_ON_ENTER[type]
}
