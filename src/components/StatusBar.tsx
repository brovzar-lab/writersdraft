/** Dark status bar: page/word/scene counts, runtime, today's delta, sprint,
 *  element-flow hints, save state, honest storage state. */
import { useEffect, useMemo, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { usePagination } from "./PaginationContext";
import { countWords, wordsToday } from "../engine/analysis";
import { ELEMENT_LABELS } from "../types";
import { NEXT_ON_ENTER, NEXT_ON_TAB } from "../engine/stateMachine";
import { IconShield, IconAlert, IconZap } from "./icons";

/** Courier keyboard-hint chip. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[3px] border border-chrome-line px-1 font-screenplay text-[10px] leading-4 text-chrome-ink-2">
      {children}
    </span>
  );
}

export function StatusBar() {
  const elements = useScriptStore((s) => s.script.elements);
  const timeline = useScriptStore((s) => s.timeline);
  const dirty = useScriptStore((s) => s.dirty);
  const activeElementId = useUiStore((s) => s.activeElementId);

  const { pages: allPages, pageOf } = usePagination();
  const pages = allPages.length;
  const activePage = activeElementId ? pageOf.get(activeElementId) : undefined;
  const words = useMemo(
    () => elements.reduce((a, el) => a + countWords(el.text), 0),
    [elements],
  );
  const sceneCount = useMemo(
    () => elements.filter((e) => e.type === "scene_heading").length,
    [elements],
  );
  const today = wordsToday(timeline, words, Date.now());
  const active = elements.find((e) => e.id === activeElementId);

  return (
    <footer className="no-print flex items-center gap-4 bg-chrome-2 px-3.5 py-[5px] font-ui text-[11px] text-chrome-ink-3">
      <span data-testid="page-indicator">
        <b className="font-semibold text-chrome-ink">
          Page {activePage ?? 1}
        </b>{" "}
        / {pages}
      </span>
      <span>{words.toLocaleString()} words</span>
      <span>
        {sceneCount} scene{sceneCount === 1 ? "" : "s"}
      </span>
      <span>~{pages} min</span>
      <span className="text-chrome-line">|</span>
      <span>
        Today:{" "}
        <b className="font-semibold text-[#4ade80]">
          {today >= 0 ? "+" : "−"}
          {Math.abs(today).toLocaleString()} words
        </b>
      </span>
      <SprintStatus words={words} />

      <span className="ml-auto flex items-center gap-2">
        {active && (
          <>
            <b className="font-semibold text-chrome-ink">
              {ELEMENT_LABELS[active.type].toUpperCase()}
            </b>
            <Chip>⏎</Chip>
            <span>{ELEMENT_LABELS[NEXT_ON_ENTER[active.type]]}</span>
            <Chip>⇥</Chip>
            <span>{ELEMENT_LABELS[NEXT_ON_TAB[active.type]]}</span>
          </>
        )}
        {dirty ? (
          <span className="text-[#fbbf24]">● unsaved</span>
        ) : (
          <span className="text-[#4ade80]">✓ synced</span>
        )}
        <StorageIndicator />
      </span>
    </footer>
  );
}

/**
 * Honest storage state. 'granted' means the browser promised not to evict
 * this origin's data under disk pressure; anything else means it might, and
 * the tooltip says so instead of pretending saves are invincible.
 */
function StorageIndicator() {
  const persist = useUiStore((s) => s.storagePersist);
  if (persist === null || persist === "unsupported") return null;
  if (persist === "granted") {
    return (
      <span
        data-testid="storage-indicator"
        title="The browser granted persistent storage — your local drafts won't be evicted under disk pressure."
        className="flex items-center gap-1 text-[#4ade80]"
      >
        <IconShield size={12} /> protected
      </span>
    );
  }
  return (
    <span
      data-testid="storage-indicator"
      title="The browser declined persistent storage: under disk pressure it may evict this site's data. Adding an account (cloud copy) protects your work."
      className="flex items-center gap-1 text-[#fbbf24]"
    >
      <IconAlert size={12} /> evictable
    </span>
  );
}

function SprintStatus({ words }: { words: number }) {
  const sprint = useUiStore((s) => s.sprint);
  const endSprint = useUiStore((s) => s.endSprint);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sprint) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sprint]);

  if (!sprint) return null;
  const msLeft = Math.max(0, sprint.endsAt - now);
  const written = words - sprint.startWords;
  const done = msLeft === 0;
  const mm = Math.floor(msLeft / 60000);
  const ss = Math.floor((msLeft % 60000) / 1000);

  return (
    <span className="flex items-center gap-1.5 text-[#fbbf24]">
      <IconZap size={12} />
      {done ? "done!" : `${mm}:${String(ss).padStart(2, "0")}`} · {written}/
      {sprint.targetWords}
      <button
        onClick={() => {
          useScriptStore.getState().recordSnapshot(`Sprint: +${written} words`);
          endSprint();
        }}
        className="rounded border border-current px-1 text-[10px] hover:opacity-75"
      >
        {done ? "Gather" : "Stop"}
      </button>
    </span>
  );
}
