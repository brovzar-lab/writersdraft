/** Dialogue & gender analytics: composition bar + per-character bar table. */
import { useMemo } from "react";
import { useScriptStore } from "../stores/scriptStore";
import { characterStats, genderBreakdown } from "../engine/analysis";
import type { CharacterProfile } from "../types";
import { useUiStore } from "../stores/uiStore";
import { IconFilm } from "./icons";

const GENDERS: CharacterProfile["gender"][] = ["female", "male", "nonbinary", "unspecified"];
/** Validated categorical hues; 'unspecified' is the neutral Other slot
 *  (identity is never color-alone: every use pairs a swatch with a label). */
const GENDER_COLORS: Record<CharacterProfile["gender"], string> = {
  female: "var(--viz-1)",
  male: "var(--viz-2)",
  nonbinary: "var(--viz-3)",
  unspecified: "var(--viz-neutral)",
};

export function AnalyticsPanel() {
  const script = useScriptStore((s) => s.script);
  const setCharacterGender = useScriptStore((s) => s.setCharacterGender);
  const setView = useUiStore((s) => s.setView);

  const stats = useMemo(
    () => characterStats(script.elements, script.characters),
    [script.elements, script.characters],
  );
  const byGender = useMemo(() => genderBreakdown(stats), [stats]);
  const totalWords = stats.reduce((a, s) => a + s.words, 0);
  const maxWords = stats.reduce((a, s) => Math.max(a, s.words), 0) || 1;

  if (stats.length === 0) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center font-ui">
        <IconFilm size={28} className="text-ink-faint" />
        <h1 className="text-base font-semibold text-ink">No dialogue yet</h1>
        <p className="text-sm text-ink-faint">
          Once your characters start talking, this view shows who speaks, how much, and how your
          gender balance breaks down.
        </p>
        <button
          onClick={() => setView("editor")}
          className="rounded-md bg-brass px-3 py-1.5 text-xs font-medium text-on-brass hover:bg-brass-strong"
        >
          Back to the script
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 font-ui">
      <h1 className="text-lg font-semibold text-ink">Dialogue Analytics</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Who speaks, how much, and in how many scenes. Assign genders to see your balance.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Words spoken by gender
        </h2>
        {/* Composition bar: thin, 2px surface gaps between segments. */}
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded">
          {GENDERS.map((g) =>
            byGender.words[g] > 0 ? (
              <div
                key={g}
                className="tip"
                data-tip={`${g}: ${byGender.words[g]} words (${Math.round((byGender.words[g] / (totalWords || 1)) * 100)}%)`}
                style={{
                  width: `${(byGender.words[g] / (totalWords || 1)) * 100}%`,
                  background: GENDER_COLORS[g],
                  minWidth: 4,
                }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
          {GENDERS.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: GENDER_COLORS[g] }}
              />
              <span className="text-ink-soft">{g}</span> {byGender.words[g]} words ·{" "}
              {byGender.speeches[g]} speeches · {byGender.characters[g]}{" "}
              {byGender.characters[g] === 1 ? "character" : "characters"}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Words per character
        </h2>
        {/* Bar table: each row is name · gender · bar · value — the chart IS
            the table view, so identity and magnitude never rely on color. */}
        <div className="flex flex-col">
          <div className="grid grid-cols-[10rem_7rem_1fr_7rem] gap-2 border-b border-line pb-1 text-[10px] uppercase tracking-wide text-ink-faint">
            <span>Character</span>
            <span>Gender</span>
            <span>Words</span>
            <span className="text-right">Speeches · Scenes</span>
          </div>
          {stats.map((s) => (
            <div
              key={s.name}
              className="tip grid grid-cols-[10rem_7rem_1fr_7rem] items-center gap-2 border-b border-line/50 py-1.5"
              data-tip={`${s.name}: ${s.words} words · ${s.speeches} speeches · ${s.scenes} scene${s.scenes === 1 ? "" : "s"} · ${totalWords ? ((s.words / totalWords) * 100).toFixed(1) : 0}% of dialogue`}
            >
              <span className="truncate font-screenplay text-xs font-bold uppercase text-ink">
                {s.name}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: GENDER_COLORS[s.gender] }}
                />
                <select
                  className="w-full rounded border border-line bg-transparent px-1 py-0.5 text-[11px] text-ink-soft"
                  value={s.gender}
                  aria-label={`Gender of ${s.name}`}
                  onChange={(e) =>
                    setCharacterGender(s.name, e.target.value as CharacterProfile["gender"])
                  }
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </span>
              <span className="flex items-center gap-2">
                {/* Thin mark, rounded at the value end only, anchored left. */}
                <span
                  aria-hidden
                  className="h-2.5 rounded-r bg-brass"
                  style={{ width: `${Math.max((s.words / maxWords) * 100, 1)}%` }}
                />
                <span className="shrink-0 text-[11px] text-ink-soft">{s.words}</span>
              </span>
              <span className="text-right text-[11px] text-ink-faint">
                {s.speeches} · {s.scenes}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
