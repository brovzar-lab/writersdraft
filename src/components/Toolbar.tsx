/**
 * Studio Frame header — two dark rows.
 *   Row 1 (#111827): logo · menu bar · sync pill · presence · Sprint.
 *   Row 2 (#1f2937): element-type dropdown · ⌘K chip · centered view tabs ·
 *   draft/revision chip · Notes toggle.
 * The menus (File/Edit/…) carry the commands; this component is layout +
 * the always-visible controls.
 */
import { useShallow } from "zustand/react/shallow";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { useCollabStore } from "../stores/collabStore";
import { ELEMENT_LABELS, ELEMENT_TYPES, type ElementType } from "../types";
import { AccountMenu, type AccountUser } from "./AccountMenu";
import { MenuBar } from "./MenuBar";
import { IconZap, IconLock, IconMenu, IconSearch } from "./icons";

const TABS: Array<{ id: AppView; label: string }> = [
  { id: "editor", label: "Script" },
  { id: "bible", label: "Bible" },
  { id: "beatboard", label: "Beats" },
  { id: "analytics", label: "Analytics" },
  { id: "history", label: "History" },
];

export function Toolbar({
  syncState,
  user,
  onAuthChanged,
  onPrint,
  onSave,
}: {
  syncState: string;
  user: AccountUser | null;
  onAuthChanged: () => void;
  onPrint: () => void;
  onSave: () => void;
}) {
  const title = useScriptStore((s) => s.script.titlePage.title);
  const locked = useScriptStore((s) => s.script.locked);
  const revisionColor = useScriptStore((s) => s.script.revisionColor);
  const setElementType = useScriptStore((s) => s.setElementType);
  const checkpoint = useScriptStore((s) => s.checkpoint);

  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const notesOpen = useUiStore((s) => s.notesOpen);
  const toggleNotes = useUiStore((s) => s.toggleNotes);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const activeElementId = useUiStore((s) => s.activeElementId);

  const activeId = useScriptStore(
    (s) => s.script.elements.find((e) => e.id === activeElementId)?.id ?? null,
  );
  const activeType = useScriptStore(
    (s) => s.script.elements.find((e) => e.id === activeElementId)?.type,
  );

  return (
    <header className="no-print flex-none font-ui">
      {/* Row 1 — menu bar */}
      <div className="flex items-center gap-0.5 bg-chrome px-3.5 py-1">
        <span className="mr-3 flex select-none items-center gap-2">
          <span className="grid h-[18px] w-[18px] place-items-center rounded bg-accent font-screenplay text-[11px] font-bold text-white">
            W
          </span>
          <span className="text-[12.5px] font-semibold text-chrome-ink">
            Writers<span className="text-accent-light">Draft</span>
          </span>
        </span>

        <MenuBar onSave={onSave} onPrint={onPrint} />

        <div className="ml-auto flex items-center gap-2">
          <AccountMenu
            user={user}
            onAuthChanged={onAuthChanged}
            syncState={syncState}
          />
          <Presence />
          <SprintButton />
        </div>
      </div>

      {/* Row 2 — context bar */}
      <div className="relative flex items-center gap-3 bg-chrome-2 px-3.5 py-1.5">
        {view === "editor" && (
          <button
            onClick={() => useUiStore.getState().setDrawerOpen(true)}
            aria-label="Scenes"
            className="rounded-[7px] p-1 text-chrome-ink-3 hover:bg-chrome-raised hover:text-chrome-ink lg:hidden"
          >
            <IconMenu size={16} />
          </button>
        )}

        {view === "editor" && (
          <label className="relative flex items-center rounded-[7px] border border-chrome-line">
            <select
              className="cursor-pointer appearance-none rounded-[7px] bg-transparent py-1 pl-2.5 pr-7 text-xs text-chrome-ink outline-none"
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
                <option key={t} value={t} className="text-ink">
                  {ELEMENT_LABELS[t]}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-[9px] text-chrome-ink-4">
              ▼
            </span>
          </label>
        )}

        <button
          onClick={() => {
            if (document.activeElement instanceof HTMLElement)
              document.activeElement.blur();
            setPaletteOpen(true);
          }}
          className="flex items-center gap-2 rounded-[7px] border border-chrome-line px-2.5 py-1 text-[11.5px] text-chrome-ink-3 hover:text-chrome-ink"
          aria-label="Open command palette"
        >
          <IconSearch size={13} />
          <span className="font-mono">⌘K</span>
        </button>

        <nav
          aria-label="Views"
          className="absolute left-1/2 flex -translate-x-1/2 gap-px rounded-[7px] bg-chrome p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? "page" : undefined}
              className={`rounded-md px-3 py-[3px] text-xs transition-colors ${
                view === t.id
                  ? "bg-chrome-raised font-medium text-white"
                  : "text-chrome-ink-3 hover:text-chrome-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded border border-chrome-line px-2 py-[3px] text-[11px] text-chrome-ink-3">
            <span className="max-w-[16ch] truncate text-chrome-ink-2">
              {title || "Untitled"}
            </span>
            {locked ? (
              <>
                <span className="text-chrome-ink-4">·</span>
                <IconLock size={11} className="text-accent-light" />
                <span className="capitalize">{revisionColor} rev.</span>
              </>
            ) : (
              <>
                <span className="text-chrome-ink-4">·</span>
                <span>Draft</span>
              </>
            )}
          </span>
          <button
            onClick={toggleNotes}
            aria-pressed={notesOpen}
            className={`rounded-[7px] border px-2.5 py-1 text-xs transition-colors ${
              notesOpen
                ? "border-accent-light/60 bg-chrome-raised text-white"
                : "border-chrome-line text-chrome-ink-2 hover:text-chrome-ink"
            }`}
          >
            Notes
          </button>
        </div>
      </div>
    </header>
  );
}

function Presence() {
  // Shallow-compare: filtering inside the selector makes a new array each
  // render, which would loop useSyncExternalStore without this.
  const peers = useCollabStore(
    useShallow((s) => s.peers.filter((p) => p.userId !== s.selfId)),
  );
  if (peers.length === 0) return null;
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-chrome-ink-3">
      {peers.slice(0, 3).map((p) => (
        <span
          key={p.userId}
          className="rounded px-1.5 py-px text-[10px] font-semibold"
          style={{ background: "#93c5fd", color: "#1e3a8a" }}
          title={`${p.name} is here`}
        >
          {initials(p.name)}
        </span>
      ))}
      <span>
        {peers.length} {peers.length === 1 ? "writer" : "writers"} here
      </span>
    </span>
  );
}

function SprintButton() {
  const sprint = useUiStore((s) => s.sprint);
  const startSprint = useUiStore((s) => s.startSprint);
  if (sprint) return null;
  return (
    <button
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
      title="15-minute writing sprint, 300-word goal. Enters focus mode."
      className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-accent-press"
    >
      <IconZap size={13} /> Sprint
    </button>
  );
}
