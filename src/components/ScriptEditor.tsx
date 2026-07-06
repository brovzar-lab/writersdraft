/**
 * The paginated editor surface, rendered FROM the paginator's PageLine
 * output: block spacing is the paginator's real blank lines (a cue hugs its
 * dialogue, scene headings get two clear lines) and (MORE)/(CONT'D) markers
 * draw at page breaks — what you see is what the paginator counts and what
 * print emits.
 *
 * An element whose lines span a page break renders whole on the page it
 * starts on (an editable block can't be split across two contentEditables);
 * the break markers show where the paginator splits it, and the print view
 * is exact.
 *
 * Pages are virtualized: only pages near the viewport — plus any page
 * holding the active element or a pending caret target — mount their
 * blocks; the rest keep their height with a placeholder.
 */
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useUiStore } from "../stores/uiStore";
import { useScriptStore } from "../stores/scriptStore";
import { ELEMENT_LAYOUT } from "../engine/pagination";
import { usePagination, type PaginationValue } from "./PaginationContext";
import { ElementBlock } from "./ElementBlock";
import { getBlockSelection } from "./caret";
import { FirstRunCard } from "./FirstRunCard";
import {
  deleteSelectedRange,
  rangeToClipboardText,
  pastePlainText,
} from "./clipboard";
import type { ElementType, Page } from "../types";

export function ScriptEditor() {
  const { pages, getElement } = usePagination();

  /*
   * Cross-block selection support. contentEditable owns editing INSIDE one
   * block, but a selection spanning blocks lives in the parent DOM and the
   * browser's default handling would corrupt the element structure. These
   * capture-phase handlers intercept only when the selection spans blocks
   * (single-block editing stays native / in ElementBlock) and re-express
   * the edit as store operations.
   */
  const crossKeyDown = (e: React.KeyboardEvent) => {
    const sel = getBlockSelection();
    if (!sel?.crossBlock) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedRange(sel);
    } else if (e.key === "Enter" && !mod) {
      // Enter over a spanning selection deletes it; the caret lands at the
      // join and the next Enter splits normally.
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedRange(sel);
    } else if (!mod && !e.altKey && e.key.length === 1) {
      // Typing over a spanning selection: replace it with the character.
      e.preventDefault();
      e.stopPropagation();
      const res = deleteSelectedRange(sel);
      if (res) {
        const store = useScriptStore.getState();
        const el = store.script.elements.find((x) => x.id === res.focusId);
        if (el) {
          store.updateElementText(
            el.id,
            el.text.slice(0, res.offset) + e.key + el.text.slice(res.offset),
          );
          useUiStore.getState().requestCaret(el.id, res.offset + 1);
        }
      }
    }
  };

  const crossCopy = (e: React.ClipboardEvent) => {
    const sel = getBlockSelection();
    if (!sel?.crossBlock) return;
    e.preventDefault();
    // Fountain serialization so element types survive the round trip.
    e.clipboardData.setData("text/plain", rangeToClipboardText(sel));
  };

  const crossCut = (e: React.ClipboardEvent) => {
    const sel = getBlockSelection();
    if (!sel?.crossBlock) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", rangeToClipboardText(sel));
    deleteSelectedRange(sel);
  };

  const crossPaste = (e: React.ClipboardEvent) => {
    const sel = getBlockSelection();
    if (!sel?.crossBlock) return;
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData.getData("text/plain");
    const res = deleteSelectedRange(sel);
    if (res && text) pastePlainText(res.focusId, res.offset, text);
  };

  return (
    <div
      className="flex flex-col items-center gap-6 py-8"
      onKeyDownCapture={crossKeyDown}
      onCopyCapture={crossCopy}
      onCutCapture={crossCut}
      onPasteCapture={crossPaste}
    >
      <FirstRunCard />
      {pages.map((page) => (
        <EditorPage key={page.number} page={page} getElement={getElement} />
      ))}
    </div>
  );
}

/** One 12pt screenplay line of vertical space per blank line. */
function Spacer({ lines }: { lines: number }) {
  return <div aria-hidden style={{ height: `${lines * 12}pt` }} />;
}

/** Non-editable (MORE) / CHARACTER (CONT'D) page-break etiquette marker. */
function MarkerLine({ type, text }: { type: ElementType; text: string }) {
  const layout = ELEMENT_LAYOUT[type];
  return (
    <div
      aria-hidden
      className="font-screenplay select-none text-ink"
      style={{
        marginLeft: `${layout.indent}ch`,
        maxWidth: `${layout.width}ch`,
        lineHeight: "12pt",
        minHeight: "12pt",
      }}
    >
      {text}
    </div>
  );
}

const EditorPage = memo(function EditorPage({
  page,
  getElement,
}: {
  page: Page;
  getElement: PaginationValue["getElement"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(page.number <= 2);
  const tagFilter = useUiStore((s) => s.tagFilter);

  // A page must mount when the caret is headed to (or already in) one of
  // its elements, even off-screen — navigator jumps and Enter at a page
  // boundary depend on it.
  const holdsFocus = useUiStore((s) => {
    const target = s.pendingCaret?.elementId ?? s.activeElementId;
    return target != null && page.lines.some((l) => l.elementId === target);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Root must be the scrolling <main>: with the default viewport root,
    // rootMargin never reaches pages clipped by the scroll container, and
    // pages would only mount at the moment they become visible.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNearViewport(entry.isIntersecting);
      },
      { root: el.closest("main"), rootMargin: "1500px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const mounted = nearViewport || holdsFocus;

  let content: ReactNode = <div aria-hidden style={{ height: "660pt" }} />;
  if (mounted) {
    const rows: ReactNode[] = [];
    const lines = page.lines;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.kind === "blank") {
        let n = 0;
        while (i < lines.length && lines[i].kind === "blank") {
          n++;
          i++;
        }
        rows.push(<Spacer key={`sp-${i}`} lines={n} />);
      } else if (line.kind === "more" || line.kind === "contd") {
        rows.push(
          <MarkerLine
            key={`mk-${i}`}
            type={line.kind === "more" ? "dialogue" : "character"}
            text={line.text}
          />,
        );
        i++;
      } else {
        // A run of text lines belonging to one element.
        const first = line;
        while (
          i < lines.length &&
          lines[i].kind === "text" &&
          lines[i].elementId === first.elementId
        ) {
          i++;
        }
        if (first.lineIndex > 0) continue; // continuation: drawn whole on its start page
        const el = getElement(first.elementIndex, first.elementId);
        if (!el) continue;
        const dim = tagFilter && !(el.tags ?? []).includes(tagFilter);
        rows.push(
          <div key={el.id} className={dim ? "opacity-30" : ""}>
            <ElementBlock element={el} />
          </div>,
        );
      }
    }
    content = <div className="text-ink">{rows}</div>;
  }

  return (
    <div
      ref={ref}
      data-page-number={page.number}
      className="script-page paper-shadow relative rounded-[3px] border border-line/60 bg-page"
    >
      {page.number > 1 && (
        <span className="absolute top-[0.5in] right-[1in] font-screenplay text-ink select-none">
          {page.number}.
        </span>
      )}
      {content}
    </div>
  );
});

export { ELEMENT_LAYOUT };
