/**
 * ⌘K command palette: jump to any scene, switch views, run commands — the
 * keyboard-first writer never has to find a button. Two groups (JUMP TO /
 * COMMANDS); scene numbers render in Courier; the selected row shows its
 * action hint. The editor is blurred synchronously by the ⌘K handler (App)
 * so no keystroke leaks into the script before the input mounts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { usePagination } from "./PaginationContext";
import { exportFdx } from "../engine/fdx";
import { exportFountain } from "../engine/fountain";
import { ELEMENT_LABELS, ELEMENT_TYPES, type ElementType } from "../types";
import {
  IconSearch,
  IconFilm,
  IconArrowRight,
  IconDownload,
  IconZap,
  IconLock,
  IconUnlock,
  IconLayers,
  IconFocus,
} from "./icons";

interface Cmd {
  id: string;
  group: "jump" | "command";
  label: string;
  keywords?: string;
  sceneNumber?: string;
  page?: number;
  icon?: ReactNode;
  shortcut?: string;
  run: () => void;
}

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const VIEW_LABELS: Array<{ id: AppView; label: string }> = [
  { id: "editor", label: "Go to Script" },
  { id: "bible", label: "Go to Story Bible" },
  { id: "beatboard", label: "Go to Beat Board" },
  { id: "analytics", label: "Go to Analytics" },
  { id: "history", label: "Go to History" },
  { id: "titlepage", label: "Go to Title Page" },
  { id: "library", label: "Go to Library" },
];

export function CommandPalette({ onPrint }: { onPrint: () => void }) {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { pageOf } = usePagination();

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    if (!open) return [];
    const ui = useUiStore.getState();
    const store = useScriptStore.getState();
    const out: Cmd[] = [];

    store.scenes().forEach((sc, i) => {
      const el = store.script.elements[sc.index];
      out.push({
        id: `scene-${sc.id}`,
        group: "jump",
        label: sc.heading,
        keywords: sc.sceneNumber ?? String(i + 1),
        sceneNumber: sc.sceneNumber ?? String(i + 1),
        page: pageOf.get(sc.id) ?? 1,
        run: () => {
          ui.setView("editor");
          ui.requestCaret(sc.id, el ? el.text.length : 0, true);
        },
      });
    });

    for (const v of VIEW_LABELS)
      out.push({
        id: `view-${v.id}`,
        group: "command",
        label: v.label,
        icon: <IconFilm size={14} />,
        run: () => ui.setView(v.id),
      });

    // Change the active element's type.
    const activeId = ui.activeElementId;
    const activeType = store.script.elements.find(
      (e) => e.id === activeId,
    )?.type;
    if (activeId)
      for (const t of ELEMENT_TYPES) {
        if (t === activeType) continue;
        out.push({
          id: `type-${t}`,
          group: "command",
          label: `Change element to ${ELEMENT_LABELS[t]}`,
          icon: <IconArrowRight size={14} />,
          run: () => {
            store.checkpoint();
            store.setElementType(activeId, t as ElementType);
            ui.requestCaret(activeId, 0);
          },
        });
      }

    const title = () => useScriptStore.getState().script.titlePage.title || "script";
    out.push(
      {
        id: "cmd-print",
        group: "command",
        label: "Export / print PDF",
        icon: <IconDownload size={14} />,
        shortcut: "⌘P",
        run: onPrint,
      },
      {
        id: "cmd-fountain",
        group: "command",
        label: "Export Fountain (.fountain)",
        icon: <IconDownload size={14} />,
        run: () =>
          download(`${title()}.fountain`, exportFountain(store.script)),
      },
      {
        id: "cmd-fdx",
        group: "command",
        label: "Export Final Draft (.fdx)",
        icon: <IconDownload size={14} />,
        run: () => download(`${title()}.fdx`, exportFdx(store.script)),
      },
      {
        id: "cmd-sprint",
        group: "command",
        label: "Start a 15-minute sprint",
        keywords: "goal 300 words",
        icon: <IconZap size={14} />,
        run: () => {
          const words = useScriptStore
            .getState()
            .script.elements.reduce(
              (a, el) =>
                a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
              0,
            );
          ui.startSprint(15, 300, words);
        },
      },
      store.script.locked
        ? {
            id: "cmd-unlock",
            group: "command",
            label: "Unlock pages",
            icon: <IconUnlock size={14} />,
            run: () => useScriptStore.getState().unlockScript(),
          }
        : {
            id: "cmd-lock",
            group: "command",
            label: "Lock pages for production",
            icon: <IconLock size={14} />,
            run: () => {
              useScriptStore.getState().lockScript();
              useScriptStore.getState().recordSnapshot("Locked for production");
            },
          },
      {
        id: "cmd-snapshot",
        group: "command",
        label: "Snapshot this version",
        icon: <IconLayers size={14} />,
        run: () => void useScriptStore.getState().recordSnapshot("Manual snapshot"),
      },
      {
        id: "cmd-focus",
        group: "command",
        label: "Focus mode",
        icon: <IconFocus size={14} />,
        shortcut: "⌘⇧F",
        run: () => ui.toggleFocusMode(),
      },
    );
    return out;
  }, [open, onPrint, pageOf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: Cmd) =>
      c.label.toLowerCase().includes(q) ||
      (c.keywords?.toLowerCase().includes(q) ?? false);
    const list = q ? commands.filter(match) : commands;
    // Stable order: jumps first, then commands; cap the list.
    return list.slice(0, 40);
  }, [commands, query]);

  if (!open) return null;

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  let rowIndex = -1;
  const jumps = filtered.filter((c) => c.group === "jump");
  const cmds = filtered.filter((c) => c.group === "command");

  const renderRow = (c: Cmd) => {
    rowIndex++;
    const i = rowIndex;
    const selected = i === index;
    return (
      <li key={c.id}>
        <button
          role="option"
          aria-selected={selected}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            run(c);
          }}
          className={`flex w-full items-center gap-2.5 px-4 py-2 text-left ${
            selected ? "bg-accent-soft" : ""
          }`}
        >
          {c.group === "jump" ? (
            <span
              className={`font-screenplay text-[11px] font-bold ${
                selected ? "text-accent-deep" : "text-ink-4"
              }`}
            >
              {c.sceneNumber}
            </span>
          ) : (
            <span className="text-ink-3">{c.icon}</span>
          )}
          <span
            className={`flex-1 truncate text-[13px] ${
              c.group === "jump" && !selected ? "text-ink-2" : "text-ink"
            } ${c.group === "jump" ? "uppercase" : ""}`}
          >
            {c.label}
          </span>
          {c.group === "jump" ? (
            <span className="ml-auto shrink-0 text-[10.5px] text-ink-4">
              p{c.page}
              {selected && (
                <>
                  {" "}
                  · <b className="text-accent">Jump ⏎</b>
                </>
              )}
            </span>
          ) : (
            c.shortcut && (
              <span className="ml-auto rounded border border-line px-1.5 font-mono text-[10px] text-ink-4">
                {c.shortcut}
              </span>
            )
          )}
        </button>
      </li>
    );
  };

  return (
    <div
      className="no-print fixed inset-0 z-40 flex items-start justify-center bg-ink/32 pt-24 font-ui"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        data-testid="command-palette"
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl bg-surface shadow-[0_24px_64px_rgba(17,24,39,.35)]"
      >
        <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3.5">
          <IconSearch size={16} className="shrink-0 text-ink-4" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(filtered[index]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Jump to a scene, switch view, run a command…"
            className="w-full bg-transparent text-sm text-ink caret-accent outline-none placeholder:text-ink-4"
            aria-label="Search commands"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-ink-4">
            esc
          </kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-ink-3">
              No matches.
            </p>
          )}
          {jumps.length > 0 && (
            <>
              <GroupLabel>Jump to</GroupLabel>
              <ul role="listbox">{jumps.map(renderRow)}</ul>
            </>
          )}
          {cmds.length > 0 && (
            <>
              <GroupLabel className={jumps.length > 0 ? "border-t border-hairline mt-1 pt-2.5" : ""}>
                Commands
              </GroupLabel>
              <ul role="listbox">{cmds.map(renderRow)}</ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-4 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-4 ${className}`}
    >
      {children}
    </div>
  );
}
