/** Notes & tags side panel: localized notes plus tag management/filtering. */
import { useState } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";

/* Tag colors from the data set — categories, not warnings. */
const TAG_COLORS = [
  "#2b54f0",
  "#6e4bf0",
  "#119c8b",
  "#ff6b5c",
  "#5e80ff",
  "#2fc9b0",
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
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-bg p-3 text-sm">
      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Tags
        </h2>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {script.tags.map((t) => (
            <span key={t.id} className="group flex items-center">
              <button
                onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
                className={`rounded-full px-2 py-0.5 text-xs text-white ${tagFilter === t.id ? "ring-2 ring-offset-1 ring-accent" : ""}`}
                style={{ background: t.color }}
                title="Click to filter script by this tag"
              >
                {t.name}
              </button>
              <button
                onClick={() => removeTag(t.id)}
                className="ml-0.5 hidden text-ink-3 hover:text-on-error group-hover:inline"
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
            className="w-full rounded border border-line bg-surface px-2 py-1 text-xs"
          />
        </form>
        {activeEl && script.tags.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-ink-3 mb-1">Tag current element:</p>
            <div className="flex flex-wrap gap-1">
              {script.tags.map((t) => {
                const on = (activeEl.tags ?? []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleElementTag(activeEl.id, t.id)}
                    className={`rounded px-1.5 py-0.5 text-xs border ${on ? "text-white" : "text-ink-3 border-line"}`}
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
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
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
              className="w-full rounded border border-line bg-surface px-2 py-1 text-xs"
            />
            <button className="mt-1 rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-press">
              Add note
            </button>
          </form>
        ) : (
          <p className="text-xs text-ink-3">
            Click into the script to attach a note.
          </p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {openNotes.map((n) => {
            const el = script.elements.find((e) => e.id === n.elementId);
            return (
              <li
                key={n.id}
                className="rounded border border-accent/30 bg-accent-soft/50 p-2"
              >
                <p className="text-xs text-ink-2">{n.text}</p>
                <p className="mt-1 truncate text-[10px] text-ink-3 font-screenplay">
                  {el
                    ? el.text.slice(0, 40) || "(empty element)"
                    : "(deleted element)"}
                </p>
                <button
                  onClick={() => resolveNote(n.id)}
                  className="mt-1 text-[10px] text-on-success hover:underline"
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
