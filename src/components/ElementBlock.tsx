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
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ScriptElement } from "../types";
import { ELEMENT_LAYOUT } from "../engine/pagination";
import { buildContext, suggest } from "../engine/smartType";
import {
  onEnter,
  onTab,
  onBackspaceAtStart,
  detectTypeFromText,
  normalizeText,
  cycleType,
  UPPERCASE_TYPES,
  NEXT_ON_ENTER,
} from "../engine/stateMachine";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { useCollabStore } from "../stores/collabStore";
import {
  getCaretOffset,
  setCaretOffset,
  hasSelection,
  getBlockSelection,
} from "./caret";
import { pastePlainText } from "./clipboard";
import { parseFountainBody } from "../engine/fountain";
import { Menu, MenuItem } from "./ui";
import { ELEMENT_LABELS, ELEMENT_TYPES } from "../types";

const PLACEHOLDERS: Partial<Record<ScriptElement["type"], string>> = {
  scene_heading: "INT. LOCATION - DAY",
  character: "CHARACTER NAME",
  dialogue: "Dialogue…",
  parenthetical: "(beat)",
  transition: "CUT TO:",
  action: "Action…",
};

export const ElementBlock = memo(function ElementBlock({
  element,
}: {
  element: ScriptElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const updateElementText = useScriptStore((s) => s.updateElementText);
  const setElementType = useScriptStore((s) => s.setElementType);
  const insertElementAfter = useScriptStore((s) => s.insertElementAfter);
  const splitElement = useScriptStore((s) => s.splitElement);
  const mergeWithPrevious = useScriptStore((s) => s.mergeWithPrevious);
  const checkpoint = useScriptStore((s) => s.checkpoint);

  const active = useUiStore((s) => s.activeElementId === element.id);
  const setActiveElement = useUiStore((s) => s.setActiveElement);
  const requestCaret = useUiStore((s) => s.requestCaret);
  const clearPendingCaret = useUiStore((s) => s.clearPendingCaret);
  // Non-null only when the caret handoff targets this block.
  const caretTarget = useUiStore((s) =>
    s.pendingCaret?.elementId === element.id ? s.pendingCaret : null,
  );

  // ---- SmartType: completions for cues, headings and transitions.
  // Computed only for the active block; buildContext walks the script at
  // popup time (cheap, and only one block is ever active).
  const [sugIndex, setSugIndex] = useState(0);
  const [sugDismissed, setSugDismissed] = useState(false);
  const suggestions = useMemo(() => {
    if (!active || sugDismissed || element.locked) return [];
    return suggest(
      element.type,
      element.text,
      buildContext(useScriptStore.getState().script.elements),
    );
  }, [active, sugDismissed, element.type, element.text, element.locked]);

  useEffect(() => {
    // New element focus or type change: popup state resets.
    setSugDismissed(false);
    setSugIndex(0);
  }, [active, element.type]);

  const acceptSuggestion = (i: number) => {
    const s = suggestions[i];
    if (!s) return;
    checkpoint();
    updateElementText(element.id, s.text);
    setSugDismissed(true);
    requestCaret(element.id, s.text.length);
  };

  // Keep DOM text in sync with store (skip when it already matches — that is
  // the common case for self-originated edits and preserves the caret).
  useEffect(() => {
    const div = ref.current;
    if (div && div.textContent !== element.text) {
      div.textContent = element.text;
    }
  }, [element.text]);

  // Programmatic caret handoff (after Enter/Tab/merge/navigation).
  useEffect(() => {
    if (caretTarget && ref.current) {
      if (caretTarget.center) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setCaretOffset(ref.current, caretTarget.offset);
      setActiveElement(element.id);
      clearPendingCaret();
    }
  }, [caretTarget, element.id, setActiveElement, clearPendingCaret]);

  const layout = ELEMENT_LAYOUT[element.type];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const div = ref.current!;
    const caret = getCaretOffset(div);
    const ctx = { element, caret, hasSelection: hasSelection() };

    // SmartType popup owns navigation keys while it is open.
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSugIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSugIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(sugIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSugDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      checkpoint();
      const act = onEnter(ctx);
      if (act.kind === "transform" && act.type) {
        setElementType(element.id, act.type);
        requestCaret(element.id, 0);
      } else if (act.kind === "create" && act.type) {
        const id = insertElementAfter(element.id, act.type);
        requestCaret(id, 0);
      } else if (act.kind === "split" && act.type) {
        const id = splitElement(element.id, caret, act.type);
        requestCaret(id, 0);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      checkpoint();
      if (e.shiftKey) {
        setElementType(element.id, cycleType(element.type, -1));
        requestCaret(element.id, caret);
        return;
      }
      const act = onTab(ctx);
      if (act.kind === "transform" && act.type) {
        setElementType(element.id, act.type);
        requestCaret(element.id, 0);
      } else if (act.kind === "create" && act.type) {
        const id = insertElementAfter(element.id, act.type);
        requestCaret(id, 0);
      }
      return;
    }

    if (e.key === "Backspace") {
      const act = onBackspaceAtStart(ctx);
      if (act.kind === "merge") {
        e.preventDefault();
        checkpoint();
        const res = mergeWithPrevious(element.id);
        if (res) requestCaret(res.prevId, res.joinAt);
      }
      return;
    }

    // Arrow navigation across element boundaries.
    if (e.key === "ArrowUp" && caret === 0) {
      const prev = neighbour(element.id, -1);
      if (prev) {
        e.preventDefault();
        requestCaret(prev.id, prev.text.length);
      }
    } else if (
      e.key === "ArrowDown" &&
      caret === (div.textContent?.length ?? 0)
    ) {
      const next = neighbour(element.id, +1);
      if (next) {
        e.preventDefault();
        requestCaret(next.id, next.text.length);
      }
    }
  };

  const neighbour = (id: string, dir: -1 | 1) => {
    const els = useScriptStore.getState().script.elements;
    const i = els.findIndex((el) => el.id === id);
    return els[i + dir] ?? null;
  };

  const handleInput = () => {
    const div = ref.current!;
    const text = div.textContent ?? "";
    setSugDismissed(false);
    setSugIndex(0);
    updateElementText(element.id, text);
    const detected = detectTypeFromText(text, element.type);
    if (detected) {
      const caret = getCaretOffset(div);
      checkpoint();
      setElementType(element.id, detected);
      requestCaret(element.id, caret);
    }
  };

  const handleBlur = () => {
    const normal = normalizeText(element.type, element.text);
    if (normal !== element.text) updateElementText(element.id, normal);
  };

  /**
   * Paste, single-block case (cross-block pastes are captured by the
   * editor container before this fires). Multi-line text runs through the
   * Fountain parser and splits into typed elements — never one action blob;
   * single lines insert literally. Always plain text: the browser's default
   * would inject foreign HTML into the contentEditable.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (text === "") return;
    const div = ref.current!;
    const sel = getBlockSelection();
    // A selection inside this block is replaced by the paste, atomically.
    if (sel && !sel.crossBlock && sel.startId === element.id) {
      const [from, to] =
        sel.startOffset <= sel.endOffset
          ? [sel.startOffset, sel.endOffset]
          : [sel.endOffset, sel.startOffset];
      if (text.includes("\n")) {
        const parts = parseFountainBody(text.split("\n"));
        const target = useScriptStore
          .getState()
          .pasteElements(element.id, from, parts, to);
        if (target) requestCaret(target.focusId, target.offset);
      } else {
        checkpoint();
        updateElementText(
          element.id,
          element.text.slice(0, from) + text + element.text.slice(to),
        );
        requestCaret(element.id, from + text.length);
      }
      return;
    }
    pastePlainText(element.id, getCaretOffset(div), text);
  };

  // Re-renders only when the peers on THIS element change (shallow compare).
  const peers = useCollabStore(
    useShallow((s) =>
      s.peers.filter(
        (p) => p.elementId === element.id && p.userId !== s.selfId,
      ),
    ),
  );

  return (
    <div className="relative">
      {active && !element.locked && (
        <div
          className="absolute top-0 z-10 hidden -translate-x-full pr-3 lg:block"
          contentEditable={false}
        >
          <Menu
            align="left"
            width="w-36"
            trigger={() => (
              <button
                data-testid="type-pill"
                className="whitespace-nowrap rounded-full border border-line bg-desk-raised px-2 py-px font-ui text-[10px] font-medium text-ink-faint shadow-sm transition-colors hover:border-brass hover:text-brass"
                title="Change element type"
              >
                {ELEMENT_LABELS[element.type]}
              </button>
            )}
          >
            {ELEMENT_TYPES.map((t) => (
              <MenuItem
                key={t}
                onClick={() => {
                  checkpoint();
                  setElementType(element.id, t);
                  requestCaret(element.id, element.text.length);
                }}
              >
                <span className={t === element.type ? "text-brass" : ""}>
                  {ELEMENT_LABELS[t]}
                </span>
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
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
        spellCheck={element.type === "action" || element.type === "dialogue"}
        className={`element-block font-screenplay transition-colors duration-150 ${active ? "bg-brass-soft/50" : ""}`}
        style={{
          marginLeft: layout.rightAlign ? undefined : `${layout.indent}ch`,
          maxWidth: `${layout.width}ch`,
          textAlign: layout.rightAlign ? "right" : "left",
          textTransform: UPPERCASE_TYPES.has(element.type)
            ? "uppercase"
            : undefined,
          marginRight: layout.rightAlign ? 0 : undefined,
        }}
        data-element-id={element.id}
        data-element-type={element.type}
        data-placeholder={active ? (PLACEHOLDERS[element.type] ?? "") : ""}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setActiveElement(element.id)}
        onBlur={handleBlur}
      />
      {suggestions.length > 0 && (
        <ul
          data-testid="smarttype-popup"
          role="listbox"
          aria-label="SmartType suggestions"
          className="absolute z-20 mt-0.5 min-w-44 overflow-hidden rounded-md border border-line bg-desk-raised py-0.5 font-ui shadow-lg"
          style={{ left: `${layout.indent}ch` }}
        >
          {suggestions.map((s, i) => (
            <li key={s.text}>
              <button
                role="option"
                aria-selected={i === sugIndex}
                // preventDefault so the editable block keeps focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSuggestion(i);
                }}
                onMouseEnter={() => setSugIndex(i)}
                className={`flex w-full items-baseline gap-0 px-2.5 py-1 text-left text-[11px] ${
                  i === sugIndex ? "bg-brass-soft text-ink" : "text-ink-soft"
                }`}
              >
                <span className="font-screenplay text-xs uppercase">
                  {s.text.slice(0, s.text.length - s.completion.length)}
                  <span className="text-brass">{s.completion}</span>
                </span>
              </button>
            </li>
          ))}
          <li
            aria-hidden
            className="border-t border-line/60 px-2.5 pb-0.5 pt-1 text-[9px] text-ink-faint"
          >
            ↑↓ choose · Enter accept · Esc dismiss
          </li>
        </ul>
      )}
      {element.sceneNumber && element.type === "scene_heading" && (
        <span className="absolute -left-10 top-0 font-screenplay text-ink-faint select-none">
          {element.sceneNumber}
        </span>
      )}
    </div>
  );
});

/** What Enter would create next — shown in the status bar as a hint. */
export function nextTypeHint(type: ScriptElement["type"]): string {
  return NEXT_ON_ENTER[type];
}
