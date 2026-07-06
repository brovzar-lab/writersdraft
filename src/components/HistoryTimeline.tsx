/**
 * Version timeline: restorable snapshots recorded on save/lock/sprint,
 * with page/word deltas so you can see the draft grow.
 */
import { useScriptStore } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";

export function HistoryTimeline() {
  const timeline = useScriptStore((s) => s.timeline);
  const { restoreSnapshot, recordSnapshot } = useScriptStore();
  const setView = useUiStore((s) => s.setView);

  const entries = [...timeline].reverse();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Version History</h1>
          <p className="text-sm text-ink-3">
            Snapshots are captured automatically as you save. Restore any point
            — restoring is itself undoable.
          </p>
        </div>
        <button
          onClick={() => recordSnapshot("Manual snapshot")}
          className="rounded border border-line px-2 py-1 text-xs hover:border-accent"
        >
          + Snapshot now
        </button>
      </div>
      {entries.length === 0 && (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <p className="text-sm font-medium text-ink-2">No versions yet</p>
          <p className="mt-1 text-xs text-ink-3">
            Snapshots are captured automatically as you write. Each one is a
            restorable version of the whole script, with word and page deltas —
            so you can always find the draft where it was better.
          </p>
        </div>
      )}
      <ol className="relative flex flex-col gap-3 border-l border-line pl-5">
        {entries.map((e, i) => {
          const prev = entries[i + 1];
          const dWords = prev ? e.words - prev.words : e.words;
          return (
            <li key={e.id} className="card relative p-3">
              <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-bg bg-accent" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{e.label}</p>
                  <p className="text-xs text-ink-3">
                    {new Date(e.at).toLocaleString()} · {e.pageCount} pages ·{" "}
                    {e.words} words{" "}
                    {prev && (
                      <span
                        className={dWords >= 0 ? "text-on-success" : "text-on-error"}
                      >
                        ({dWords >= 0 ? "+" : ""}
                        {dWords} words)
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    restoreSnapshot(e.id);
                    setView("editor");
                  }}
                  className="rounded border border-line px-2 py-1 text-xs hover:border-accent hover:text-accent"
                >
                  Restore
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
