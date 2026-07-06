/**
 * The paginated editor surface, rendered FROM the paginator's PageLine
 * output: block spacing is the paginator's real blank lines and (MORE)/
 * (CONT'D) markers draw at page breaks — what you see is what the paginator
 * counts and what print emits. Adds three Studio Frame surfaces:
 *   • a Pages ⇄ Flow toggle (Flow drops page breaks into one scroll),
 *   • locked-script revision marks (blue page strip + right-margin asterisks
 *     on elements changed since the lock snapshot), and
 *   • a typewriter Focus mode (warm page, current line centered, neighbors
 *     dimmed by distance).
 *
 * Pages are virtualized: only pages near the viewport — plus any page holding
 * the active element or a pending caret target — mount their blocks. (Flow
 * view renders continuously and is not virtualized.)
 */
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUiStore } from "../stores/uiStore";
import { useScriptStore } from "../stores/scriptStore";
import { ELEMENT_LAYOUT } from "../engine/pagination";
import { usePagination, type PaginationValue } from "./PaginationContext";
import { ElementBlock } from "./ElementBlock";
import { FirstRunCard } from "./FirstRunCard";
import { getBlockSelection } from "./caret";
import {
  deleteSelectedRange,
  rangeToClipboardText,
  pastePlainText,
} from "./clipboard";
import {
  changedSinceLock,
  charactersInScene,
} from "../engine/analysis";
import { NEXT_ON_ENTER, NEXT_ON_TAB } from "../engine/stateMachine";
import {
  ELEMENT_LABELS,
  type ElementType,
  type Page,
  type PageLine,
} from "../types";

/** US Letter page width (8.5in at 96dpi) plus breathing room. */
const PAGE_PX = 816;
const NO_REVISIONS: Set<string> = new Set();

/** Capture-phase handlers that intercept only cross-block selections and
 *  re-express the edit as store operations (single-block editing stays in
 *  ElementBlock / native contentEditable). Shared by Pages/Flow/Focus. */
function useCrossBlockHandlers() {
  const crossKeyDown = (e: React.KeyboardEvent) => {
    const sel = getBlockSelection();
    if (!sel?.crossBlock) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedRange(sel);
    } else if (e.key === "Enter" && !mod) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedRange(sel);
    } else if (!mod && !e.altKey && e.key.length === 1) {
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
  return {
    onKeyDownCapture: crossKeyDown,
    onCopyCapture: crossCopy,
    onCutCapture: crossCut,
    onPasteCapture: crossPaste,
  };
}

export function ScriptEditor() {
  const { pages, getElement } = usePagination();
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const cross = useCrossBlockHandlers();

  const focusMode = useUiStore((s) => s.focusMode);
  const viewMode = useUiStore((s) => s.viewMode);
  const navCharacter = useUiStore((s) => s.navCharacter);
  const navStorylines = useUiStore((s) => s.navStorylines);
  const clearNavFilters = useUiStore((s) => s.clearNavFilters);
  const locked = useScriptStore((s) => s.script.locked);
  const revisionColor = useScriptStore((s) => s.script.revisionColor);
  const elements = useScriptStore((s) => s.script.elements);
  const timeline = useScriptStore((s) => s.timeline);

  const revised = useMemo(
    () => (locked ? changedSinceLock(elements, timeline) : NO_REVISIONS),
    [locked, elements, timeline],
  );

  useEffect(() => {
    const el = containerRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => {
      setZoom(Math.min(1, (parent.clientWidth - 24) / PAGE_PX));
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  if (focusMode) return <FocusView />;

  const filtering = navStorylines.length > 0 || !!navCharacter;
  const shownScenes = filtering
    ? useScriptStore
        .getState()
        .scenes()
        .filter((sc) => {
          const color = sc.color ?? "#cbd5e1";
          if (navStorylines.length && !navStorylines.includes(color))
            return false;
          if (
            navCharacter &&
            !charactersInScene(elements, sc.id).some(
              (c) => c.name === navCharacter,
            )
          )
            return false;
          return true;
        }).length
    : 0;

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center gap-6 py-6"
      style={zoom < 1 ? ({ zoom } as React.CSSProperties) : undefined}
      {...cross}
    >
      <div className="flex w-[816px] max-w-full items-center gap-3 px-2">
        {filtering ? (
          <span className="text-[11px] text-ink-3">
            Filtered:{" "}
            <b className="text-accent-deep">
              {navCharacter ?? `${navStorylines.length} storylines`}
            </b>{" "}
            · {shownScenes} scenes
            <button
              onClick={clearNavFilters}
              className="ml-2 text-accent hover:underline"
            >
              clear
            </button>
          </span>
        ) : (
          <span />
        )}
        <ViewModeToggle />
      </div>

      <FirstRunCard />

      {viewMode === "flow" ? (
        <FlowView
          pages={pages}
          getElement={getElement}
          revised={revised}
          locked={locked}
        />
      ) : (
        pages.map((page) => (
          <EditorPage
            key={page.number}
            page={page}
            getElement={getElement}
            revised={revised}
            locked={locked}
            revisionColor={revisionColor}
          />
        ))
      )}
    </div>
  );
}

function ViewModeToggle() {
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  return (
    <span className="ml-auto flex rounded-[7px] bg-line p-0.5 text-[11px]">
      {(["pages", "flow"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setViewMode(m)}
          className={`rounded-[5px] px-2.5 py-0.5 capitalize transition-colors ${
            viewMode === m
              ? "bg-surface font-semibold text-ink shadow-sm"
              : "text-ink-3"
          }`}
        >
          {m}
        </button>
      ))}
    </span>
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

/** Build editor rows from a run of PageLines (shared by pages + flow). */
function buildRows(
  lines: PageLine[],
  getElement: PaginationValue["getElement"],
  tagFilter: string | null,
  revised: Set<string>,
  locked: boolean,
  flow: boolean,
): ReactNode[] {
  const rows: ReactNode[] = [];
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
      if (!flow)
        rows.push(
          <MarkerLine
            key={`mk-${i}`}
            type={line.kind === "more" ? "dialogue" : "character"}
            text={line.text}
          />,
        );
      i++;
    } else {
      const first = line;
      while (
        i < lines.length &&
        lines[i].kind === "text" &&
        lines[i].elementId === first.elementId
      ) {
        i++;
      }
      if (first.lineIndex > 0) continue; // continuation: drawn whole on start
      const el = getElement(first.elementIndex, first.elementId);
      if (!el) continue;
      const dim = tagFilter && !(el.tags ?? []).includes(tagFilter);
      const mark = locked && revised.has(el.id);
      rows.push(
        <div key={el.id} className={`relative ${dim ? "opacity-30" : ""}`}>
          {mark && (
            <span
              aria-hidden
              className="absolute right-0 top-0 font-screenplay font-bold text-accent"
              title="Changed since lock"
            >
              *
            </span>
          )}
          <ElementBlock element={el} />
        </div>,
      );
    }
  }
  return rows;
}

const EditorPage = memo(function EditorPage({
  page,
  getElement,
  revised,
  locked,
  revisionColor,
}: {
  page: Page;
  getElement: PaginationValue["getElement"];
  revised: Set<string>;
  locked: boolean;
  revisionColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(page.number <= 2);
  const tagFilter = useUiStore((s) => s.tagFilter);

  const holdsFocus = useUiStore((s) => {
    const target = s.pendingCaret?.elementId ?? s.activeElementId;
    return target != null && page.lines.some((l) => l.elementId === target);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    content = (
      <div className="text-ink">
        {buildRows(page.lines, getElement, tagFilter, revised, locked, false)}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-page-number={page.number}
      className="script-page paper-shadow relative rounded-[3px] border border-line/60 bg-surface"
    >
      {locked && (
        <>
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px] rounded-t-[3px]"
            style={{ background: "var(--accent-light)" }}
          />
          <span className="absolute left-[1.5in] top-[0.5in] font-ui text-[9px] uppercase tracking-[0.08em] text-accent-light">
            {revisionColor} revision · {new Date().toLocaleDateString()}
          </span>
        </>
      )}
      {page.number > 1 && (
        <span className="absolute top-[0.5in] right-[1in] font-screenplay text-ink select-none">
          {page.number}.
        </span>
      )}
      {content}
    </div>
  );
});

/** Continuous scroll — all pages' lines concatenated, no page breaks. */
function FlowView({
  pages,
  getElement,
  revised,
  locked,
}: {
  pages: Page[];
  getElement: PaginationValue["getElement"];
  revised: Set<string>;
  locked: boolean;
}) {
  const tagFilter = useUiStore((s) => s.tagFilter);
  const lines = useMemo(() => pages.flatMap((p) => p.lines), [pages]);
  return (
    <div className="script-page paper-shadow relative min-h-0 rounded-[3px] border border-line/60 bg-surface !h-auto">
      <div className="text-ink">
        {buildRows(lines, getElement, tagFilter, revised, locked, true)}
      </div>
    </div>
  );
}

/**
 * Typewriter focus mode: warm paper, only the page, the current line held
 * near the vertical center with neighbors fading by distance.
 */
function FocusView() {
  const cross = useCrossBlockHandlers();
  const elements = useScriptStore((s) => s.script.elements);
  const activeId = useUiStore((s) => s.activeElementId);
  const sprint = useUiStore((s) => s.sprint);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);
  const { pageOf } = usePagination();
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeIdx = elements.findIndex((e) => e.id === activeId);
  const active = activeIdx >= 0 ? elements[activeIdx] : elements[0];

  // Current scene heading (nearest preceding) + page for the top-left label.
  let heading = "";
  for (let i = activeIdx >= 0 ? activeIdx : 0; i >= 0; i--) {
    if (elements[i].type === "scene_heading") {
      heading = elements[i].text;
      break;
    }
  }
  const page = activeId ? (pageOf.get(activeId) ?? 1) : 1;

  // Typewriter scroll: keep the active line centered.
  useEffect(() => {
    if (!activeId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-element-id="${CSS.escape(activeId)}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId]);

  return (
    <div className="focus-typewriter relative min-h-full">
      <div className="pointer-events-none fixed left-[18px] top-[14px] z-10 text-[11.5px] text-[#c6c1b5]">
        p. {page}
        {heading ? ` · ${heading}` : ""}
      </div>
      <div className="fixed right-[18px] top-[14px] z-10 flex items-center gap-2.5 text-[11.5px]">
        {sprint && <SprintHud />}
        <button
          onClick={toggleFocusMode}
          className="rounded-full border border-[#e0dcd2] px-2.5 py-[3px] text-[#b3aea3] hover:text-[#8a8578]"
        >
          Esc to exit
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col items-center py-[45vh]"
        {...cross}
      >
        <div className="w-[620px] max-w-[92vw]">
          {elements.map((el, i) => {
            const d = Math.abs(i - (activeIdx < 0 ? 0 : activeIdx));
            const opacity = d === 0 ? 1 : d === 1 ? 0.55 : d === 2 ? 0.35 : 0.18;
            return (
              <div key={el.id} style={{ opacity }}>
                <ElementBlock element={el} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-[14px] left-0 right-0 z-10 flex justify-center text-[11px] tracking-[0.02em] text-[#c6c1b5]">
        {active && (
          <span>
            {ELEMENT_LABELS[active.type].toUpperCase()} · ⏎{" "}
            {ELEMENT_LABELS[NEXT_ON_ENTER[active.type]].toLowerCase()} · ⇥{" "}
            {ELEMENT_LABELS[NEXT_ON_TAB[active.type]].toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function SprintHud() {
  const sprint = useUiStore((s) => s.sprint)!;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const words = useScriptStore((s) =>
    s.script.elements.reduce(
      (a, el) => a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
      0,
    ),
  );
  const msLeft = Math.max(0, sprint.endsAt - now);
  const mm = Math.floor(msLeft / 60000);
  const ss = Math.floor((msLeft % 60000) / 1000);
  return (
    <span className="rounded-full border border-[#fde68a] bg-[#fef3c7] px-3 py-[3px] font-semibold text-[#b45309]">
      ⚡ {mm}:{String(ss).padStart(2, "0")} · {words - sprint.startWords}/
      {sprint.targetWords}
    </span>
  );
}

export { ELEMENT_LAYOUT };
