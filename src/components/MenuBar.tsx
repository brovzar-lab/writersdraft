/**
 * Studio Frame menu bar (Row 1 of the header): a classic desktop menu bar —
 * File · Edit · View · Production · Tools · Help — whose items map onto
 * WritersDraft's existing features. Click a trigger to open; while a menu is
 * open, moving to another trigger switches to it; arrows navigate, Escape
 * closes. Every item is also reachable from the ⌘K palette.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { exportFdx, importFdx } from "../engine/fdx";
import { exportFountain, importFountain } from "../engine/fountain";
import { checkFormatting } from "../engine/analysis";
import { REVISION_COLOR_ORDER } from "../types";
import { toast } from "./ui";

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

type Row =
  | { kind: "sep" }
  | {
      kind: "item";
      label: string;
      shortcut?: string;
      hint?: string;
      onSelect?: () => void;
      submenu?: Row[];
      disabled?: boolean;
      active?: boolean;
    };

interface MenuDef {
  id: string;
  label: string;
  rows: Row[];
}

export function MenuBar({
  onSave,
  onPrint,
}: {
  onSave: () => void;
  onPrint: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [help, setHelp] = useState<null | "shortcuts" | "about">(null);
  const barRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const locked = useScriptStore((s) => s.script.locked);
  const revisionColor = useScriptStore((s) => s.script.revisionColor);
  const canUndo = useScriptStore((s) => s.past.length > 0);
  const canRedo = useScriptStore((s) => s.future.length > 0);
  const notesOpen = useUiStore((s) => s.notesOpen);
  const viewMode = useUiStore((s) => s.viewMode);
  const showSceneNumbers = useUiStore((s) => s.showSceneNumbers);
  const sprint = useUiStore((s) => s.sprint);

  // Close on outside click.
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node))
        setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentWords = () =>
    useScriptStore
      .getState()
      .script.elements.reduce(
        (a, el) => a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
        0,
      );

  const renameCharacterFlow = () => {
    const active = useUiStore.getState().activeElementId;
    const el = useScriptStore
      .getState()
      .script.elements.find((e) => e.id === active);
    const from = window.prompt(
      "Rename character — current cue name:",
      el?.type === "character" ? el.text : "",
    );
    if (!from) return;
    const to = window.prompt(`Rename “${from}” to:`, from);
    if (!to) return;
    const n = useScriptStore.getState().renameCharacter(from, to);
    toast(
      n > 0
        ? `Renamed ${n} cue${n === 1 ? "" : "s"} to ${to.toUpperCase()}`
        : `No cues matched “${from}”`,
      n > 0 ? "success" : "info",
    );
  };

  const runFormatCheck = () => {
    const issues = checkFormatting(useScriptStore.getState().script.elements);
    toast(
      issues.length === 0
        ? "Formatting looks clean — no issues found."
        : `Formatting: ${issues.join(" · ")}`,
      issues.length === 0 ? "success" : "info",
    );
  };

  const menus = useMemo<MenuDef[]>(() => {
    const script = () => useScriptStore.getState().script;
    const ui = () => useUiStore.getState();
    const store = () => useScriptStore.getState();
    return [
      {
        id: "file",
        label: "File",
        rows: [
          { kind: "item", label: "Save", shortcut: "⌘S", onSelect: onSave },
          {
            kind: "item",
            label: "Save snapshot…",
            hint: "to History",
            onSelect: () => {
              store().recordSnapshot("Manual snapshot");
              toast("Snapshot saved to History", "success");
            },
          },
          { kind: "sep" },
          {
            kind: "item",
            label: "Import…",
            hint: ".fountain · .fdx",
            onSelect: () => importRef.current?.click(),
          },
          {
            kind: "item",
            label: "Export",
            hint: "▸",
            submenu: [
              {
                kind: "item",
                label: "PDF (print)",
                shortcut: "⌘P",
                onSelect: onPrint,
              },
              {
                kind: "item",
                label: "Fountain (.fountain)",
                onSelect: () =>
                  download(
                    `${script().titlePage.title || "script"}.fountain`,
                    exportFountain(script()),
                  ),
              },
              {
                kind: "item",
                label: "Final Draft (.fdx)",
                onSelect: () =>
                  download(
                    `${script().titlePage.title || "script"}.fdx`,
                    exportFdx(script()),
                  ),
              },
            ],
          },
          { kind: "item", label: "Print…", shortcut: "⌘P", onSelect: onPrint },
          { kind: "sep" },
          {
            kind: "item",
            label: "Title Page…",
            onSelect: () => ui().setView("titlepage"),
          },
          {
            kind: "item",
            label: "Locally saved backups…",
            onSelect: () => ui().setView("library"),
          },
        ],
      },
      {
        id: "edit",
        label: "Edit",
        rows: [
          {
            kind: "item",
            label: "Undo",
            shortcut: "⌘Z",
            disabled: !canUndo,
            onSelect: () => store().undo(),
          },
          {
            kind: "item",
            label: "Redo",
            shortcut: "⇧⌘Z",
            disabled: !canRedo,
            onSelect: () => store().redo(),
          },
          { kind: "sep" },
          {
            kind: "item",
            label: "Find…",
            shortcut: "⌘K",
            onSelect: () => ui().setPaletteOpen(true),
          },
          {
            kind: "item",
            label: "Rename character…",
            onSelect: renameCharacterFlow,
          },
        ],
      },
      {
        id: "view",
        label: "View",
        rows: [
          {
            kind: "item",
            label: viewMode === "pages" ? "Switch to Flow" : "Switch to Pages",
            hint: viewMode === "pages" ? "Pages ⇄ Flow" : "Flow ⇄ Pages",
            onSelect: () =>
              ui().setViewMode(viewMode === "pages" ? "flow" : "pages"),
          },
          {
            kind: "item",
            label: "Focus mode",
            shortcut: "⌘⇧F",
            onSelect: () => ui().toggleFocusMode(),
          },
          {
            kind: "item",
            label: "Notes panel",
            active: notesOpen,
            onSelect: () => ui().toggleNotes(),
          },
          {
            kind: "item",
            label: "Dark mode",
            hint: "soon",
            onSelect: () =>
              toast("Dark mode is coming in a later pass.", "info"),
          },
        ],
      },
      {
        id: "production",
        label: "Production",
        rows: [
          locked
            ? {
                kind: "item",
                label: "Unlock pages",
                onSelect: () => store().unlockScript(),
              }
            : {
                kind: "item",
                label: "Lock pages",
                hint: "number scenes",
                onSelect: () => {
                  store().lockScript();
                  store().recordSnapshot("Locked for production");
                  toast("Pages locked & scenes numbered", "success");
                },
              },
          {
            kind: "item",
            label: "Next revision",
            disabled: !locked,
            hint: locked ? `${revisionColor} →` : "lock first",
            onSelect: () => {
              const next = store().bumpRevision();
              toast(`Revision → ${next}`, "info");
            },
          },
          {
            kind: "item",
            label: "Revision color",
            hint: "▸",
            disabled: !locked,
            submenu: REVISION_COLOR_ORDER.map((c) => ({
              kind: "item" as const,
              label: c.charAt(0).toUpperCase() + c.slice(1),
              active: c === revisionColor,
              onSelect: () => {
                // Cycle bumpRevision until it lands on the chosen color.
                let guard = 0;
                while (
                  useScriptStore.getState().script.revisionColor !== c &&
                  guard++ < REVISION_COLOR_ORDER.length
                )
                  store().bumpRevision();
              },
            })),
          },
          {
            kind: "item",
            label: "Scene numbers",
            active: showSceneNumbers,
            onSelect: () => ui().toggleSceneNumbers(),
          },
        ],
      },
      {
        id: "tools",
        label: "Tools",
        rows: [
          {
            kind: "item",
            label: "Start 15-min sprint",
            disabled: !!sprint,
            onSelect: () => ui().startSprint(15, 300, currentWords()),
          },
          {
            kind: "item",
            label: "Dialogue analytics",
            onSelect: () => ui().setView("analytics"),
          },
          {
            kind: "item",
            label: "Check formatting",
            onSelect: runFormatCheck,
          },
        ],
      },
      {
        id: "help",
        label: "Help",
        rows: [
          {
            kind: "item",
            label: "Keyboard shortcuts",
            onSelect: () => setHelp("shortcuts"),
          },
          { kind: "item", label: "About WritersDraft", onSelect: () => setHelp("about") },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    locked,
    revisionColor,
    canUndo,
    canRedo,
    notesOpen,
    viewMode,
    showSceneNumbers,
    sprint,
  ]);

  const onBarKey = (e: React.KeyboardEvent) => {
    if (open === null) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setOpen((o) => ((o ?? 0) + 1) % menus.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setOpen((o) => ((o ?? 0) - 1 + menus.length) % menus.length);
    } else if (e.key === "Escape") {
      setOpen(null);
    }
  };

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Main menu"
      className="flex items-center gap-0.5"
      onKeyDown={onBarKey}
    >
      {menus.map((m, i) => (
        <div key={m.id} className="relative">
          <button
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            className={`rounded-t-[5px] px-[11px] py-1 text-xs transition-colors ${
              open === i
                ? "bg-chrome-raised text-white"
                : "text-chrome-ink-3 hover:text-chrome-ink"
            }`}
          >
            {m.label}
          </button>
          {open === i && (
            <MenuPanel rows={m.rows} onClose={() => setOpen(null)} />
          )}
        </div>
      ))}

      <input
        ref={importRef}
        type="file"
        accept=".fdx,.fountain,.txt"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            try {
              const text = await f.text();
              const imported = f.name.toLowerCase().endsWith(".fdx")
                ? importFdx(text)
                : importFountain(text);
              useScriptStore.getState().loadScript(imported);
              useScriptStore.getState().loadTimeline([]);
              useScriptStore.getState().markDirty();
              toast(`Imported ${f.name}`, "success");
            } catch (err) {
              toast(
                `Could not import ${f.name}: ${err instanceof Error ? err.message : err}`,
                "error",
              );
            }
          }
          e.target.value = "";
        }}
      />

      {help && <HelpModal which={help} onClose={() => setHelp(null)} />}
    </div>
  );
}

function MenuPanel({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [subAt, setSubAt] = useState<number | null>(null);

  // Focus the first item when the panel opens (keyboard entry).
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLButtonElement>(
      "[data-mi]:not([disabled])",
    );
    first?.focus();
  }, []);

  const move = (dir: 1 | -1, from: HTMLElement) => {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-mi]:not([disabled])",
      ) ?? [],
    );
    const idx = items.indexOf(from as HTMLButtonElement);
    const next = items[(idx + dir + items.length) % items.length];
    next?.focus();
  };

  return (
    <div
      ref={panelRef}
      role="menu"
      className="absolute left-0 top-full z-40 mt-0 w-72 rounded-b-[8px] rounded-tr-[8px] border border-chrome-line bg-chrome-2 py-1.5 text-chrome-ink shadow-[0_18px_48px_rgba(17,24,39,.45)]"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(1, e.target as HTMLElement);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          move(-1, e.target as HTMLElement);
        }
      }}
    >
      {rows.map((row, i) =>
        row.kind === "sep" ? (
          <div key={i} className="my-1.5 h-px bg-chrome-line" />
        ) : (
          <div
            key={i}
            className="relative"
            onMouseEnter={() => setSubAt(row.submenu ? i : null)}
          >
            <button
              data-mi
              role="menuitem"
              disabled={row.disabled}
              onClick={() => {
                if (row.submenu) {
                  setSubAt(subAt === i ? null : i);
                  return;
                }
                onClose();
                row.onSelect?.();
              }}
              className={`flex w-full items-center gap-3 px-4 py-[7px] text-left text-[12.5px] transition-colors disabled:opacity-40 ${
                subAt === i ? "bg-chrome-raised" : "hover:bg-chrome-raised"
              }`}
            >
              {row.active && <span className="text-accent-light">✓</span>}
              <span className={row.active ? "" : "pl-0"}>{row.label}</span>
              {row.shortcut && (
                <span className="ml-auto font-mono text-[10.5px] text-chrome-ink-4">
                  {row.shortcut}
                </span>
              )}
              {row.hint && !row.shortcut && (
                <span className="ml-auto text-[10.5px] text-chrome-ink-4">
                  {row.hint}
                </span>
              )}
            </button>
            {row.submenu && subAt === i && (
              <div
                role="menu"
                className="absolute left-full top-0 z-50 -mt-1.5 ml-0.5 w-56 rounded-[8px] border border-chrome-line bg-chrome-2 py-1.5 text-chrome-ink shadow-[0_18px_48px_rgba(17,24,39,.45)]"
              >
                {row.submenu.map((s, j) =>
                  s.kind === "item" ? (
                    <button
                      key={j}
                      data-mi
                      role="menuitem"
                      disabled={s.disabled}
                      onClick={() => {
                        onClose();
                        s.onSelect?.();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-[7px] text-left text-[12.5px] transition-colors hover:bg-chrome-raised disabled:opacity-40"
                    >
                      {s.active && (
                        <span className="text-accent-light">✓</span>
                      )}
                      <span>{s.label}</span>
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ["Enter", "Next element (Scene → Action, Character → Dialogue…)"],
  ["Tab", "Sibling element (Action → Character, Dialogue → Parenthetical…)"],
  ["⌘K", "Command palette — jump to a scene or run a command"],
  ["⌘S", "Save now"],
  ["⌘P", "Print / export a PDF"],
  ["⌘Z / ⇧⌘Z", "Undo / Redo"],
  ["⌘⇧F", "Focus mode (Esc to exit)"],
];

function HelpModal({
  which,
  onClose,
}: {
  which: "shortcuts" | "about";
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/32 pt-[15vh] font-ui"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={which === "shortcuts" ? "Keyboard shortcuts" : "About"}
    >
      <div className="card w-[30rem] max-w-[90vw] p-5 text-ink">
        {which === "shortcuts" ? (
          <>
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs text-ink-2">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="contents">
                  <dt>
                    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                      {k}
                    </kbd>
                  </dt>
                  <dd className="self-center">{d}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold">About WritersDraft</h2>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">
              A distraction-free screenwriting editor with industry-exact
              pagination, Final Draft (.fdx) and Fountain interop, versioned
              history, and local-first durability. Tab and Enter are the whole
              craft — the rest gets out of the way.
            </p>
          </>
        )}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-press"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
