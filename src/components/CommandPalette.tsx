/**
 * Ctrl+K command palette: jump to any scene, switch views, run commands —
 * the keyboard-first writer never has to find a button.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { exportFdx } from "../engine/fdx";
import { exportFountain } from "../engine/fountain";
import { IconFilm } from "./icons";

interface Command {
  id: string;
  label: string;
  hint?: string;
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Release the editor immediately so keystrokes typed in the gap
      // between the shortcut and the input mounting can't land in the
      // script, then focus the input.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!open) return [];
    const ui = useUiStore.getState();
    const store = useScriptStore.getState();
    const out: Command[] = [];

    for (const sc of store.scenes()) {
      const el = store.script.elements[sc.index];
      out.push({
        id: `scene-${sc.id}`,
        label: sc.heading,
        hint: "scene",
        run: () => {
          ui.setView("editor");
          ui.requestCaret(sc.id, el ? el.text.length : 0, true);
        },
      });
    }
    for (const v of VIEW_LABELS) {
      out.push({ id: `view-${v.id}`, label: v.label, hint: "view", run: () => ui.setView(v.id) });
    }
    out.push(
      { id: "cmd-dark", label: "Toggle dark mode", hint: "command", run: () => ui.toggleDarkMode() },
      { id: "cmd-focus", label: "Focus mode", hint: "command", run: () => ui.toggleFocusMode() },
      { id: "cmd-print", label: "Print / Save as PDF", hint: "command", run: onPrint },
      {
        id: "cmd-fdx",
        label: "Export Final Draft (.fdx)",
        hint: "command",
        run: () => {
          const s = useScriptStore.getState().script;
          download(`${s.titlePage.title || "script"}.fdx`, exportFdx(s));
        },
      },
      {
        id: "cmd-fountain",
        label: "Export Fountain (.fountain)",
        hint: "command",
        run: () => {
          const s = useScriptStore.getState().script;
          download(`${s.titlePage.title || "script"}.fountain`, exportFountain(s));
        },
      },
      {
        id: "cmd-snapshot",
        label: "Snapshot this version",
        hint: "command",
        run: () => void useScriptStore.getState().recordSnapshot("Manual snapshot"),
      },
      {
        id: "cmd-sprint",
        label: "Start a 15-minute sprint",
        hint: "command",
        run: () => {
          const words = useScriptStore
            .getState()
            .script.elements.reduce(
              (a, el) => a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
              0,
            );
          ui.startSprint(15, 300, words);
        },
      },
    );
    return out;
  }, [open, onPrint]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    const starts = commands.filter((c) => c.label.toLowerCase().startsWith(q));
    const contains = commands.filter(
      (c) => !c.label.toLowerCase().startsWith(q) && c.label.toLowerCase().includes(q),
    );
    return [...starts, ...contains].slice(0, 12);
  }, [commands, query]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <div
      className="no-print fixed inset-0 z-40 flex items-start justify-center bg-ink/20 pt-[15vh] font-ui"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        data-testid="command-palette"
        className="w-[34rem] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-desk-raised shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <IconFilm size={14} className="shrink-0 text-brass" />
          <input
            ref={inputRef}
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
            className="w-full bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint"
            aria-label="Search commands"
          />
          <kbd className="rounded border border-line px-1 text-[10px] text-ink-faint">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-ink-faint">No matches.</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(c);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${
                  i === index ? "bg-brass-soft text-ink" : "text-ink-soft"
                }`}
              >
                <span className={c.hint === "scene" ? "font-screenplay uppercase" : ""}>
                  {c.label}
                </span>
                <span className="text-[10px] text-ink-faint">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
