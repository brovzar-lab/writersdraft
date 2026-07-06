/** Notes & tags side panel: localized notes plus tag management/filtering. */
import { useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";

const TAG_COLORS = [
  "#f87171",
  "#fbbf24",
  "#4ade80",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

export function NotesPanel() {
  const script = useScriptStore((s) => s.script);
  const { addNote, resolveNote, addTag, removeTag, toggleElementTag } =
    useScriptStore();
  const { activeElementId, tagFilter, setTagFilter } = useUiStore();
  const [noteText, setNoteText] = useState("");
  const [tagName, setTagName] = useState("");

  const activeEl = script.elements.find((e) => e.id === activeElementId);
  const openNotes = script.notes.filter((n) => !n.resolved);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-desk p-3 text-sm">
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Tags
        </h2>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {script.tags.map((t) => (
            <span key={t.id} className="group flex items-center">
              <button
                onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
                className={`rounded-full px-2 py-0.5 text-xs text-white ${tagFilter === t.id ? "ring-2 ring-offset-1 ring-brass" : ""}`}
                style={{ background: t.color }}
                title="Click to filter script by this tag"
              >
                {t.name}
              </button>
              <button
                onClick={() => removeTag(t.id)}
                className="ml-0.5 hidden text-ink-faint hover:text-danger group-hover:inline"
                aria-label={`delete tag ${t.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (tagName.trim()) {
              addTag(
                tagName.trim(),
                TAG_COLORS[script.tags.length % TAG_COLORS.length],
              );
              setTagName("");
            }
          }}
        >
          <input
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="New tag (subplot, theme…)"
            className="w-full rounded border border-line bg-desk-raised px-2 py-1 text-xs"
          />
        </form>
        {activeEl && script.tags.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-ink-faint mb-1">Tag current element:</p>
            <div className="flex flex-wrap gap-1">
              {script.tags.map((t) => {
                const on = (activeEl.tags ?? []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleElementTag(activeEl.id, t.id)}
                    className={`rounded px-1.5 py-0.5 text-xs border ${on ? "text-white" : "text-ink-faint border-line-strong"}`}
                    style={
                      on ? { background: t.color, borderColor: t.color } : {}
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="flex-1">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Notes {openNotes.length > 0 && `(${openNotes.length})`}
        </h2>
        {activeEl ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (noteText.trim()) {
                addNote(activeEl.id, "Me", noteText.trim());
                setNoteText("");
              }
            }}
          >
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Note on the current element…"
              className="w-full rounded border border-line bg-desk-raised px-2 py-1 text-xs"
            />
            <button className="mt-1 rounded bg-brass px-2 py-1 text-xs text-white hover:bg-brass-strong">
              Add note
            </button>
          </form>
        ) : (
          <p className="text-xs text-ink-faint">
            Click into the script to attach a note.
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {openNotes.map((n) => {
            const el = script.elements.find((e) => e.id === n.elementId);
            return (
              <li
                key={n.id}
                className="rounded border border-brass/30 bg-brass-soft/50 p-2"
              >
                <p className="text-xs text-ink-soft">{n.text}</p>
                <p className="mt-1 truncate text-[10px] text-ink-faint font-screenplay">
                  {el
                    ? el.text.slice(0, 40) || "(empty element)"
                    : "(deleted element)"}
                </p>
                <button
                  onClick={() => resolveNote(n.id)}
                  className="mt-1 text-[10px] text-ok hover:underline"
                >
                  Resolve
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
