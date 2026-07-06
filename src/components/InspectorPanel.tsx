/**
 * Right-hand inspector — everything about the scene under the caret: synopsis,
 * storyline tags, open notes, the characters who speak in it, and the
 * production revision cycle. Absorbs the old Notes & tags panel. All edits go
 * through the existing store actions (setSceneMeta / tags / notes / revision).
 */
import { useMemo, useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { usePagination } from "./PaginationContext";
import {
  changedSinceLock,
  charactersInScene,
  type SceneCharacter,
} from "../engine/analysis";
import { REVISION_COLOR_ORDER, type RevisionColor } from "../types";

const TAG_COLORS = [
  "#3b82f6",
  "#4ade80",
  "#fbbf24",
  "#f472b6",
  "#22d3ee",
  "#a78bfa",
];

const AVATAR_COLORS = ["#4ade80", "#60a5fa", "#fbbf24", "#f472b6", "#22d3ee"];
const avatarColor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

/** First five revision colors as clickable swatches (production standard). */
const REV_SWATCH: Record<string, string> = {
  white: "#ffffff",
  blue: "#60a5fa",
  pink: "#f9a8d4",
  yellow: "#fde047",
  green: "#86efac",
};
const SWATCH_ORDER = ["white", "blue", "pink", "yellow", "green"] as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </div>
  );
}

export function InspectorPanel() {
  const elements = useScriptStore((s) => s.script.elements);
  const sceneMeta = useScriptStore((s) => s.script.sceneMeta);
  const tags = useScriptStore((s) => s.script.tags);
  const notes = useScriptStore((s) => s.script.notes);
  const locked = useScriptStore((s) => s.script.locked);
  const revisionColor = useScriptStore((s) => s.script.revisionColor);
  const timeline = useScriptStore((s) => s.timeline);
  const activeElementId = useUiStore((s) => s.activeElementId);
  const { pageOf } = usePagination();

  const {
    setSceneMeta,
    addTag,
    toggleElementTag,
    addNote,
    resolveNote,
    bumpRevision,
  } = useScriptStore();

  const [noteText, setNoteText] = useState("");

  const activeEl = elements.find((e) => e.id === activeElementId) ?? null;
  const scenes = useMemo(
    () => useScriptStore.getState().scenes(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, sceneMeta],
  );
  const activeSceneId = useMemo(() => {
    if (!activeElementId) return null;
    const idx = elements.findIndex((e) => e.id === activeElementId);
    for (let i = idx; i >= 0; i--)
      if (elements[i].type === "scene_heading") return elements[i].id;
    return null;
  }, [elements, activeElementId]);

  const sceneIndex = scenes.findIndex((s) => s.id === activeSceneId);
  const scene = sceneIndex >= 0 ? scenes[sceneIndex] : null;
  const inScene: SceneCharacter[] = useMemo(
    () => (activeSceneId ? charactersInScene(elements, activeSceneId) : []),
    [elements, activeSceneId],
  );

  const changedPages = useMemo(() => {
    if (!locked) return 0;
    const changed = changedSinceLock(elements, timeline);
    const pages = new Set<number>();
    for (const id of changed) pages.add(pageOf.get(id) ?? 1);
    return pages.size;
  }, [locked, elements, timeline, pageOf]);

  const openNotes = notes.filter((n) => !n.resolved);

  const setRevision = (color: RevisionColor) => {
    let guard = 0;
    while (
      useScriptStore.getState().script.revisionColor !== color &&
      guard++ < REVISION_COLOR_ORDER.length
    )
      bumpRevision();
  };

  return (
    <aside className="no-print flex w-[264px] shrink-0 flex-col overflow-y-auto border-l border-line bg-panel font-ui">
      {!scene ? (
        <div className="p-4 text-xs text-ink-3">
          Click into a scene to inspect it.
        </div>
      ) : (
        <>
          {/* Synopsis */}
          <section className="border-b border-hairline p-3.5">
            <Label>
              Scene {scene.sceneNumber ?? sceneIndex + 1} · Synopsis
            </Label>
            <textarea
              key={scene.id}
              defaultValue={scene.synopsis ?? ""}
              onChange={(e) =>
                setSceneMeta(scene.id, { synopsis: e.target.value })
              }
              rows={2}
              placeholder="One line on what this scene does…"
              className="inset-input w-full resize-none rounded-md border border-line bg-surface px-2.5 py-2 text-xs leading-relaxed text-ink-2 outline-none focus:border-accent"
            />
          </section>

          {/* Storyline & tags */}
          <section className="border-b border-hairline p-3.5">
            <Label>Storyline &amp; tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => {
                const on = (activeEl?.tags ?? []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() =>
                      activeEl && toggleElementTag(activeEl.id, t.id)
                    }
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-opacity"
                    style={
                      on
                        ? { background: t.color, color: "#fff" }
                        : {
                            background: "transparent",
                            color: "var(--ink-3)",
                            border: "1px solid var(--line)",
                          }
                    }
                    title={
                      activeEl
                        ? on
                          ? "Remove from this element"
                          : "Tag this element"
                        : "Click into an element to tag it"
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  const name = window.prompt("New storyline / tag name:");
                  if (name?.trim())
                    addTag(
                      name.trim(),
                      TAG_COLORS[tags.length % TAG_COLORS.length],
                    );
                }}
                className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-[11px] text-ink-3 hover:text-ink-2"
              >
                + tag
              </button>
            </div>
          </section>

          {/* Notes */}
          <section className="border-b border-hairline p-3.5">
            <Label>
              Notes{openNotes.length > 0 ? ` · ${openNotes.length} open` : ""}
            </Label>
            {activeEl ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (noteText.trim()) {
                    addNote(activeEl.id, "Me", noteText.trim());
                    setNoteText("");
                  }
                }}
                className="mb-2"
              >
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  placeholder="Note on the current element…"
                  className="inset-input w-full resize-none rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2 outline-none focus:border-accent"
                />
                {noteText.trim() && (
                  <button className="mt-1 rounded bg-accent px-2 py-1 text-[11px] text-on-accent hover:bg-accent-press">
                    Add note
                  </button>
                )}
              </form>
            ) : (
              <p className="mb-2 text-[11px] text-ink-3">
                Click into the script to attach a note.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {openNotes.map((n) => {
                const el = elements.find((e) => e.id === n.elementId);
                return (
                  <li
                    key={n.id}
                    className="rounded-md border border-[#fde68a] bg-[#fefce8] px-2.5 py-2"
                  >
                    <p className="text-[11.5px] leading-snug text-[#52461f]">
                      {n.text}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[#a16207]">
                      <span className="min-w-0 flex-1 truncate font-screenplay">
                        {el
                          ? `"${el.text.slice(0, 28) || "(empty)"}…"`
                          : "(deleted element)"}
                      </span>
                      <button
                        onClick={() => resolveNote(n.id)}
                        className="font-semibold text-[#16a34a] hover:underline"
                      >
                        Resolve
                      </button>
                    </div>
                  </li>
                );
              })}
              {openNotes.length === 0 && (
                <li className="text-[11px] text-ink-3">No open notes.</li>
              )}
            </ul>
          </section>

          {/* In this scene */}
          <section className="border-b border-hairline p-3.5">
            <Label>In this scene</Label>
            {inScene.length === 0 ? (
              <p className="text-[11px] text-ink-3">No dialogue yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {inScene.map((c) => (
                  <span
                    key={c.name}
                    className="flex items-center gap-2 text-xs text-ink-2"
                  >
                    <span
                      className="grid h-[18px] w-[18px] place-items-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: avatarColor(c.name) }}
                    >
                      {c.name[0]}
                    </span>
                    <span className="truncate">
                      {c.name} · {c.speeches} speech
                      {c.speeches === 1 ? "" : "es"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Revision */}
          <section className="p-3.5">
            <Label>Revision</Label>
            <div className="mb-1.5 flex gap-1">
              {SWATCH_ORDER.map((c) => (
                <button
                  key={c}
                  onClick={() => setRevision(c as RevisionColor)}
                  aria-label={`Set ${c} revision`}
                  className="h-2.5 flex-1"
                  style={{
                    background: REV_SWATCH[c],
                    border:
                      c === revisionColor
                        ? "2px solid var(--accent-deep)"
                        : "1px solid var(--line)",
                  }}
                />
              ))}
            </div>
            <div className="text-[10.5px] text-ink-3">
              {locked ? (
                <>
                  <span className="capitalize">{revisionColor}</span> rev. ·{" "}
                  {changedPages} changed page{changedPages === 1 ? "" : "s"} ·{" "}
                  <button
                    onClick={() => bumpRevision()}
                    className="font-semibold text-accent-deep hover:underline"
                  >
                    Next rev
                  </button>
                </>
              ) : (
                "Lock pages (Production menu) to start revision tracking."
              )}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
