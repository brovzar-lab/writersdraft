/** Bottom status bar: pages, words, scenes, sprint, current element hints. */
import { useEffect, useMemo, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { usePagination } from "./PaginationContext";
import { countWords } from "../engine/analysis";
import { ELEMENT_LABELS } from "../types";
import { NEXT_ON_ENTER, NEXT_ON_TAB } from "../engine/stateMachine";
import { IconShield, IconAlert, IconZap } from "./icons";

export function StatusBar() {
  const elements = useScriptStore((s) => s.script.elements);
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
  const active = elements.find((e) => e.id === activeElementId);

  return (
    <footer className="no-print flex items-center gap-4 border-t border-line bg-surface px-3 py-1 font-ui text-[11px] text-ink-3">
      <span data-testid="page-indicator">
        {activePage != null
          ? `page ${activePage} of ${pages}`
          : `${pages} page${pages === 1 ? "" : "s"}`}
      </span>
      <span>{words} words</span>
      <span>
        {sceneCount} scene{sceneCount === 1 ? "" : "s"}
      </span>
      <SprintStatus words={words} />
      {active && (
        <span className="ml-auto text-ink-3">
          <b className="font-medium text-ink-2">
            {ELEMENT_LABELS[active.type]}
          </b>
          <span className="mx-1.5 opacity-60">·</span>
          Enter <span className="text-ink-3">→</span>{" "}
          {ELEMENT_LABELS[NEXT_ON_ENTER[active.type]]}
          <span className="mx-1.5 opacity-60">·</span>
          Tab <span className="text-ink-3">→</span>{" "}
          {ELEMENT_LABELS[NEXT_ON_TAB[active.type]]}
        </span>
      )}
      <span className={active ? "" : "ml-auto"}>
        {dirty ? (
          // Semantic color never as small text — soft-pair on-* (flips per theme).
          <span className="text-on-warning">● unsaved</span>
        ) : (
          <span className="text-ink-3">✓ saved</span>
        )}
      </span>
      <StorageIndicator />
    </footer>
  );
}

/**
 * Honest storage state. 'granted' means the browser promised not to evict
 * this origin's data under disk pressure; anything else means it might,
 * and the tooltip says so instead of pretending saves are invincible.
 */
function StorageIndicator() {
  const persist = useUiStore((s) => s.storagePersist);
  if (persist === null || persist === "unsupported") return null;
  if (persist === "granted") {
    return (
      <span
        data-testid="storage-indicator"
        title="The browser granted persistent storage — your local drafts won't be evicted under disk pressure."
        className="flex items-center gap-1 text-on-success"
      >
        <IconShield size={12} className="text-success" /> storage protected
      </span>
    );
  }
  return (
    <span
      data-testid="storage-indicator"
      title="The browser declined persistent storage: under disk pressure it may evict this site's data. Adding an account (cloud copy) protects your work."
      className="flex items-center gap-1 text-on-warning"
    >
      <IconAlert size={12} className="text-warning" /> storage evictable
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
    <span
      className={`flex items-center gap-2 ${done ? "text-success" : "text-ink-2"}`}
    >
      <IconZap size={12} />
      {done ? "Sprint done!" : `${mm}:${String(ss).padStart(2, "0")}`} ·{" "}
      {written}/{sprint.targetWords} words
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
