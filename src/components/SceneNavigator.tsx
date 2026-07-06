/**
 * Scene navigator — storyline coding, act grouping, filters, drag-reorder and
 * an act-progress footer. Acts are derived from the classic three-act page
 * proportions (there is no act model in the document); everything else reads
 * from the real scene list, pagination and scene meta.
 */
import { useMemo, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { usePagination } from "./PaginationContext";
import { characterStats, charactersInScene } from "../engine/analysis";
import { IconGrip } from "./icons";
import type { SceneInfo } from "../types";

const NEUTRAL = "#cbd5e1";

export function SceneNavigator() {
  const elements = useScriptStore((s) => s.script.elements);
  const sceneMeta = useScriptStore((s) => s.script.sceneMeta);
  const moveScene = useScriptStore((s) => s.moveScene);
  const activeElementId = useUiStore((s) => s.activeElementId);
  const requestCaret = useUiStore((s) => s.requestCaret);
  const navStorylines = useUiStore((s) => s.navStorylines);
  const toggleNavStoryline = useUiStore((s) => s.toggleNavStoryline);
  const navCharacter = useUiStore((s) => s.navCharacter);
  const setNavCharacter = useUiStore((s) => s.setNavCharacter);
  const { pages, pageOf } = usePagination();

  const scenes = useMemo(
    () => useScriptStore.getState().scenes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, sceneMeta],
  );
  const characters = useMemo(
    () => characterStats(elements).map((c) => c.name),
    [elements],
  );

  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeSceneId = useMemo(() => {
    if (!activeElementId) return null;
    const idx = elements.findIndex((e) => e.id === activeElementId);
    for (let i = idx; i >= 0; i--)
      if (elements[i].type === "scene_heading") return elements[i].id;
    return null;
  }, [elements, activeElementId]);

  const storylineColors = useMemo(() => {
    const set = new Set<string>();
    for (const sc of scenes) set.add(sc.color ?? NEUTRAL);
    return [...set];
  }, [scenes]);

  // Three-act boundaries by page proportion (25% / 50% / 25%).
  const P = Math.max(1, pages.length);
  const a1 = Math.max(1, Math.round(P * 0.25));
  const a2 = Math.max(a1 + 1, Math.round(P * 0.75));
  const actOf = (page: number) => (page <= a1 ? 1 : page <= a2 ? 2 : 3);
  const pageFor = (sc: SceneInfo) => pageOf.get(sc.id) ?? 1;
  const currentAct = actOf(
    (activeElementId ? pageOf.get(activeElementId) : undefined) ?? 1,
  );
  const actRange = (act: 1 | 2 | 3): [number, number] =>
    act === 1 ? [1, a1] : act === 2 ? [a1 + 1, a2] : [a2 + 1, P];

  const passes = (sc: SceneInfo) => {
    const color = sc.color ?? NEUTRAL;
    if (navStorylines.length && !navStorylines.includes(color)) return false;
    if (navCharacter) {
      const names = charactersInScene(elements, sc.id).map((c) => c.name);
      if (!names.includes(navCharacter)) return false;
    }
    return true;
  };
  const filtering = navStorylines.length > 0 || !!navCharacter;
  const shownCount = scenes.filter(passes).length;

  // Rows interleaved with act headers.
  const rows: Array<
    | { kind: "act"; act: 1 | 2 | 3 }
    | { kind: "scene"; scene: SceneInfo; num: number }
  > = [];
  let lastAct = 0;
  scenes.forEach((sc, i) => {
    const act = actOf(pageFor(sc));
    if (act !== lastAct) {
      rows.push({ kind: "act", act: act as 1 | 2 | 3 });
      lastAct = act;
    }
    rows.push({ kind: "scene", scene: sc, num: i + 1 });
  });

  return (
    <nav className="flex h-full flex-col bg-panel px-2 py-3 font-ui">
      <div className="flex items-baseline px-2 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Scenes
        </span>
        <span className="ml-auto text-[10.5px] text-ink-4">
          {scenes.length} · {pages.length}pp
        </span>
      </div>

      {/* Filter row */}
      {(storylineColors.length > 1 || characters.length > 0) && (
        <div className="relative flex flex-wrap items-center gap-1.5 px-2 pb-2.5">
          {storylineColors.length > 1 && (
            <span className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1">
              {storylineColors.map((c) => {
                const on = navStorylines.length === 0 || navStorylines.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleNavStoryline(c)}
                    aria-label="Toggle storyline"
                    className="h-2 w-2 rounded-full transition-opacity"
                    style={{ background: c, opacity: on ? 1 : 0.35 }}
                  />
                );
              })}
            </span>
          )}
          {navCharacter && (
            <button
              onClick={() => setNavCharacter(null)}
              className="rounded-full border border-accent-pale bg-accent-pale px-2 py-0.5 text-[10.5px] font-medium text-accent-deep"
            >
              {navCharacter} ×
            </button>
          )}
          {characters.length > 0 && !navCharacter && (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-full border border-dashed border-line px-2 py-0.5 text-[10.5px] text-ink-4 hover:text-ink-3"
            >
              filter
            </button>
          )}
          {pickerOpen && (
            <div className="absolute left-2 top-full z-20 max-h-56 w-44 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
              {characters.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setNavCharacter(name);
                    setPickerOpen(false);
                  }}
                  className="block w-full truncate px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {scenes.length === 0 && (
          <p className="px-2 text-sm text-ink-3">No scenes yet.</p>
        )}
        {filtering && (
          <p className="px-2 pb-1 text-[10px] text-ink-4">
            {shownCount} of {scenes.length} shown
          </p>
        )}
        {rows.map((row) => {
          if (row.kind === "act") {
            const [from, to] = actRange(row.act);
            const isCollapsed = collapsed.has(row.act);
            return (
              <button
                key={`act-${row.act}`}
                onClick={() =>
                  setCollapsed((s) => {
                    const n = new Set(s);
                    n.has(row.act) ? n.delete(row.act) : n.add(row.act);
                    return n;
                  })
                }
                className="flex w-full items-center gap-2 px-2 pb-1 pt-3 text-left"
              >
                <span
                  className="text-[9px] text-ink-4 transition-transform"
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "" }}
                >
                  ▾
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  Act {row.act}
                </span>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[9.5px] text-ink-4">
                  pp {from}–{to}
                </span>
              </button>
            );
          }
          const sc = row.scene;
          if (collapsed.has(actOf(pageFor(sc)))) return null;
          const color = sc.color ?? NEUTRAL;
          const active = sc.id === activeSceneId;
          const dim = !passes(sc);
          return (
            <div
              key={sc.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", sc.id);
                setDragId(sc.id);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData("text/plain");
                if (from && from !== sc.id) moveScene(from, sc.id);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              className={`group flex cursor-pointer items-start gap-2 rounded-[5px] px-2 py-1.5 ${
                active ? "bg-sunken" : "hover:bg-sunken/70"
              } ${dragId === sc.id ? "opacity-40" : ""}`}
              style={{ opacity: dim ? 0.45 : undefined }}
              onClick={() => {
                const el = useScriptStore.getState().script.elements[sc.index];
                requestCaret(sc.id, el ? el.text.length : 0, true);
              }}
            >
              <span className="mt-0.5 hidden text-ink-4 group-hover:block">
                <IconGrip size={12} />
              </span>
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full group-hover:hidden"
                style={{ background: color }}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[12.5px] ${
                    active ? "font-semibold text-ink" : "font-medium text-ink-2"
                  }`}
                >
                  {sc.sceneNumber ? `${sc.sceneNumber}. ` : `${row.num}. `}
                  {sc.heading}
                </span>
                {active && sc.synopsis && (
                  <span className="block truncate text-[11px] text-ink-3">
                    {sc.synopsis}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[10px] text-ink-4">
                p{pageFor(sc)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Act-progress footer */}
      {scenes.length > 0 && (
        <div className="mt-2 border-t border-line px-2 pt-2.5">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Act progress
          </div>
          <div className="flex h-[7px] gap-px overflow-hidden rounded">
            {([1, 2, 3] as const).map((act) => {
              const [from, to] = actRange(act);
              const span = Math.max(1, to - from + 1);
              const bg =
                act < currentAct
                  ? "var(--accent)"
                  : act === currentAct
                    ? "var(--accent-pale)"
                    : "#e2e8f0";
              return (
                <span key={act} style={{ flex: span, background: bg }} />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9.5px] text-ink-4">
            {(["I", "II", "III"] as const).map((r, i) => {
              const act = (i + 1) as 1 | 2 | 3;
              return (
                <span key={r}>
                  {r}
                  {act < currentAct
                    ? ` · p.${actRange(act)[1]}`
                    : act === currentAct
                      ? " · current"
                      : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
