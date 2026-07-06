/** Top chrome: view switcher, element type selector, undo/redo, production tools. */
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { ELEMENT_LABELS, ELEMENT_TYPES, type ElementType } from "../types";
import { exportFountain, importFountain } from "../engine/fountain";
import { exportFdx, importFdx } from "../engine/fdx";
import { AccountMenu, type AccountUser } from "./AccountMenu";
import { Button, Menu, MenuItem, toast } from "./ui";
import {
  IconUndo,
  IconRedo,
  IconLock,
  IconUnlock,
  IconDownload,
  IconUpload,
  IconPrinter,
  IconNote,
  IconMoon,
  IconSun,
  IconFocus,
  IconZap,
  IconChevronDown,
  IconFilm,
  IconMenu,
  IconDots,
} from "./icons";

function download(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const VIEWS: Array<{ id: AppView; label: string }> = [
  { id: "editor", label: "Script" },
  { id: "bible", label: "Story Bible" },
  { id: "beatboard", label: "Beat Board" },
  { id: "analytics", label: "Analytics" },
  { id: "history", label: "History" },
  { id: "titlepage", label: "Title Page" },
  { id: "library", label: "Library" },
];

export function Toolbar({
  syncState,
  user,
  onAuthChanged,
  onPrint,
}: {
  syncState: string;
  user: AccountUser | null;
  onAuthChanged: () => void;
  onPrint: () => void;
}) {
  // Narrow selectors: the toolbar must not re-render on every keystroke.
  const locked = useScriptStore((s) => s.script.locked);
  const revisionColor = useScriptStore((s) => s.script.revisionColor);
  const undo = useScriptStore((s) => s.undo);
  const redo = useScriptStore((s) => s.redo);
  const setElementType = useScriptStore((s) => s.setElementType);
  const lockScript = useScriptStore((s) => s.lockScript);
  const unlockScript = useScriptStore((s) => s.unlockScript);
  const bumpRevision = useScriptStore((s) => s.bumpRevision);
  const loadScript = useScriptStore((s) => s.loadScript);
  const checkpoint = useScriptStore((s) => s.checkpoint);
  const canUndo = useScriptStore((s) => s.past.length > 0);
  const canRedo = useScriptStore((s) => s.future.length > 0);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleNotes = useUiStore((s) => s.toggleNotes);
  const notesOpen = useUiStore((s) => s.notesOpen);
  const activeElementId = useUiStore((s) => s.activeElementId);

  const activeId = useScriptStore(
    (s) => s.script.elements.find((e) => e.id === activeElementId)?.id ?? null,
  );
  const activeType = useScriptStore(
    (s) => s.script.elements.find((e) => e.id === activeElementId)?.type,
  );

  return (
    <header className="no-print flex items-center gap-2 border-b border-line bg-surface px-3 py-1.5 font-ui text-sm text-ink">
      {view === "editor" && (
        <Button
          iconOnly
          tip="Scenes"
          className="lg:hidden"
          onClick={() => useUiStore.getState().setDrawerOpen(true)}
        >
          <IconMenu />
        </Button>
      )}
      <span className="mr-1 hidden items-center gap-1.5 select-none sm:flex">
        <IconFilm size={16} className="text-ink-2" />
        <span className="text-[13px] font-semibold tracking-tight text-ink">
          WritersDraft
        </span>
      </span>

      <nav
        aria-label="Views"
        className="flex max-w-[42vw] overflow-x-auto rounded-lg bg-sunken p-0.5 md:max-w-none"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? "page" : undefined}
            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
              view === v.id
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-3 hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === "editor" && (
        <select
          className="hidden rounded-md border border-line bg-transparent px-1.5 py-1 text-xs text-ink-2 hover:border-line sm:block"
          value={activeType ?? "action"}
          aria-label="Element type"
          onChange={(e) => {
            if (activeId) {
              checkpoint();
              setElementType(activeId, e.target.value as ElementType);
            }
          }}
          title="Element type (Tab/Enter also switch types)"
        >
          {ELEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ELEMENT_LABELS[t]}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-1">
        <Button iconOnly tip="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <IconUndo />
        </Button>
        <Button
          iconOnly
          tip="Redo (Ctrl+Shift+Z)"
          onClick={redo}
          disabled={!canRedo}
        >
          <IconRedo />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden px-1 text-[11px] text-ink-3 sm:inline">
          {syncState}
        </span>

        {locked ? (
          <>
            <span
              className="rounded-md border border-line px-1.5 py-1 text-[11px] capitalize text-ink-2"
              title="Current revision color"
            >
              {revisionColor} rev.
            </span>
            <Button tip="Advance revision color" onClick={() => bumpRevision()}>
              Next rev
            </Button>
            <Button
              variant="toggle-on"
              tip="Unlock script"
              onClick={unlockScript}
            >
              <IconUnlock /> Unlock
            </Button>
          </>
        ) : (
          <Button
            tip="Lock pages & number scenes for production"
            onClick={() => {
              lockScript();
              // A production lock is a milestone — always snapshot it.
              useScriptStore.getState().recordSnapshot("Locked for production");
            }}
          >
            <IconLock /> Lock
          </Button>
        )}

        <Menu
          trigger={() => (
            <Button tip="Export the script">
              <IconDownload /> Export <IconChevronDown size={12} />
            </Button>
          )}
        >
          <MenuItem
            tip="Final Draft document (industry standard)"
            onClick={() => {
              const s = useScriptStore.getState().script;
              download(`${s.titlePage.title || "script"}.fdx`, exportFdx(s));
            }}
          >
            Final Draft (.fdx)
          </MenuItem>
          <MenuItem
            tip="Plain-text screenplay format"
            onClick={() => {
              const s = useScriptStore.getState().script;
              download(
                `${s.titlePage.title || "script"}.fountain`,
                exportFountain(s),
              );
            }}
          >
            Fountain (.fountain)
          </MenuItem>
        </Menu>

        <label
          className="tip hidden cursor-pointer select-none items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 transition-colors hover:border-line hover:bg-sunken/60 hover:text-ink md:inline-flex"
          data-tip="Import a .fdx or .fountain file"
        >
          <IconUpload /> Import
          <input
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
                  loadScript(imported);
                  useScriptStore.getState().loadTimeline([]);
                  // Imports must persist even before the first edit.
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
        </label>

        <Button iconOnly tip="Print / Save as PDF (Ctrl+P)" onClick={onPrint}>
          <IconPrinter />
        </Button>
        <Button
          iconOnly
          variant={notesOpen ? "toggle-on" : "ghost"}
          tip="Notes & tags"
          className="hidden md:inline-flex"
          onClick={toggleNotes}
        >
          <IconNote />
        </Button>
        <Button
          iconOnly
          tip="Toggle dark mode"
          className="hidden md:inline-flex"
          onClick={toggleDarkMode}
        >
          {darkMode ? <IconSun /> : <IconMoon />}
        </Button>
        <Button
          iconOnly
          tip="Focus mode (Esc to exit)"
          className="hidden md:inline-flex"
          onClick={toggleFocusMode}
        >
          <IconFocus />
        </Button>
        <SprintButton />
        <Menu
          trigger={() => (
            <Button iconOnly tip="More" className="md:hidden">
              <IconDots />
            </Button>
          )}
        >
          <MenuItem onClick={toggleNotes}>Notes & tags</MenuItem>
          <MenuItem onClick={toggleDarkMode}>
            {darkMode ? "Light mode" : "Dark mode"}
          </MenuItem>
          <MenuItem onClick={toggleFocusMode}>Focus mode</MenuItem>
        </Menu>
        <AccountMenu user={user} onAuthChanged={onAuthChanged} />
      </div>
    </header>
  );
}

function SprintButton() {
  const sprint = useUiStore((s) => s.sprint);
  const startSprint = useUiStore((s) => s.startSprint);
  if (sprint) return null;
  return (
    <Button
      className="hidden md:inline-flex"
      tip="15-minute writing sprint, 300-word goal. Enters focus mode."
      onClick={() => {
        const words = useScriptStore
          .getState()
          .script.elements.reduce(
            (a, el) =>
              a + (el.text.trim() ? el.text.trim().split(/\s+/).length : 0),
            0,
          );
        startSprint(15, 300, words);
      }}
    >
      <IconZap className="text-ink-2" /> Sprint
    </Button>
  );
}
