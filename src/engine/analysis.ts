/**
 * Script analytics: per-character dialogue statistics and gender balance,
 * plus small derived read-models the Studio Frame chrome needs (runtime,
 * words-written-today, revision changed-set, characters-in-a-scene).
 */
import type { CharacterProfile, HistoryEntry, ScriptElement } from "../types";
import { canonicalCharacterName } from "./stateMachine";

export interface CharacterStats {
  name: string;
  gender: CharacterProfile["gender"];
  /** Number of dialogue blocks spoken. */
  speeches: number;
  /** Total words across all dialogue. */
  words: number;
  /** Scenes (by heading index) the character speaks in. */
  scenes: number;
}

export interface GenderBreakdown {
  speeches: Record<CharacterProfile["gender"], number>;
  words: Record<CharacterProfile["gender"], number>;
  characters: Record<CharacterProfile["gender"], number>;
}

export function countWords(text: string): number {
  const t = text.trim();
  if (t === "") return 0;
  return t.split(/\s+/).length;
}

/** Compute stats for every speaking character in the script. */
export function characterStats(
  elements: ScriptElement[],
  profiles: CharacterProfile[] = [],
): CharacterStats[] {
  const genderOf = new Map(
    profiles.map((p) => [p.name.toUpperCase(), p.gender]),
  );
  const stats = new Map<string, CharacterStats>();
  const scenesSpokenIn = new Map<string, Set<number>>();

  let currentSpeaker: string | null = null;
  let sceneIndex = -1;

  for (const el of elements) {
    if (el.type === "scene_heading") {
      sceneIndex++;
      currentSpeaker = null;
    } else if (el.type === "character") {
      const name = canonicalCharacterName(el.text);
      currentSpeaker = name || null;
    } else if (el.type === "dialogue" && currentSpeaker) {
      let s = stats.get(currentSpeaker);
      if (!s) {
        s = {
          name: currentSpeaker,
          gender: genderOf.get(currentSpeaker) ?? "unspecified",
          speeches: 0,
          words: 0,
          scenes: 0,
        };
        stats.set(currentSpeaker, s);
        scenesSpokenIn.set(currentSpeaker, new Set());
      }
      s.speeches++;
      s.words += countWords(el.text);
      if (sceneIndex >= 0) scenesSpokenIn.get(currentSpeaker)!.add(sceneIndex);
    } else if (
      el.type === "action" ||
      el.type === "transition" ||
      el.type === "shot"
    ) {
      currentSpeaker = el.type === "action" ? currentSpeaker : null;
    }
  }

  for (const [name, s] of stats) {
    s.scenes = scenesSpokenIn.get(name)?.size ?? 0;
  }
  return [...stats.values()].sort((a, b) => b.words - a.words);
}

const EMPTY_GENDER_RECORD = (): Record<CharacterProfile["gender"], number> => ({
  female: 0,
  male: 0,
  nonbinary: 0,
  unspecified: 0,
});

/** A speaking character within a single scene. */
export interface SceneCharacter {
  name: string;
  speeches: number;
}

/**
 * Characters who speak within one scene (from its heading up to the next
 * heading), with per-scene speech counts. Powers the inspector's
 * "In this scene" list. Order: most lines first, then alphabetical.
 */
export function charactersInScene(
  elements: ScriptElement[],
  sceneHeadingId: string,
): SceneCharacter[] {
  const start = elements.findIndex((e) => e.id === sceneHeadingId);
  if (start < 0 || elements[start].type !== "scene_heading") return [];
  const counts = new Map<string, number>();
  let speaker: string | null = null;
  for (let i = start + 1; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "scene_heading") break;
    if (el.type === "character") {
      speaker = canonicalCharacterName(el.text) || null;
    } else if (el.type === "dialogue" && speaker) {
      counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
    } else if (el.type === "transition" || el.type === "shot") {
      speaker = null;
    }
  }
  return [...counts.entries()]
    .map(([name, speeches]) => ({ name, speeches }))
    .sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name));
}

/**
 * Lightweight formatting check ("Tools → Check formatting"): flags the
 * common structural slips a screenwriter wants caught. Returns one
 * human-readable line per issue kind (empty), so an empty array means clean.
 */
export function checkFormatting(elements: ScriptElement[]): string[] {
  let emptyHeadings = 0;
  let cuesWithoutDialogue = 0;
  let orphanDialogue = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "scene_heading" && el.text.trim() === "") emptyHeadings++;
    if (el.type === "character") {
      const next = elements[i + 1];
      if (!next || (next.type !== "dialogue" && next.type !== "parenthetical"))
        cuesWithoutDialogue++;
    }
    if (el.type === "dialogue") {
      const prev = elements[i - 1];
      if (!prev || (prev.type !== "character" && prev.type !== "parenthetical"))
        orphanDialogue++;
    }
  }
  const issues: string[] = [];
  if (emptyHeadings)
    issues.push(
      `${emptyHeadings} empty scene heading${emptyHeadings === 1 ? "" : "s"}`,
    );
  if (cuesWithoutDialogue)
    issues.push(
      `${cuesWithoutDialogue} character cue${cuesWithoutDialogue === 1 ? "" : "s"} with no dialogue`,
    );
  if (orphanDialogue)
    issues.push(
      `${orphanDialogue} dialogue block${orphanDialogue === 1 ? "" : "s"} with no character cue`,
    );
  return issues;
}

/** Local midnight (start of the calendar day) for a timestamp. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Net words written "today" — current total minus a baseline. The baseline
 * is the word count of the latest version snapshot taken *before* local
 * midnight; if the whole timeline is from today (writing started today) the
 * earliest snapshot is the baseline; with no snapshots at all the delta is
 * zero. Derived from the existing version timeline — no extra bookkeeping.
 * Can be negative on a heavy-cut day; the caller formats the sign.
 */
export function wordsToday(
  timeline: HistoryEntry[],
  currentWords: number,
  now: number,
): number {
  if (timeline.length === 0) return 0;
  const midnight = startOfDay(now);
  let baseline: number | null = null;
  for (const entry of timeline) {
    if (entry.at < midnight) baseline = entry.words;
  }
  if (baseline === null) baseline = timeline[0].words;
  return currentWords - baseline;
}

/**
 * Element ids that changed since the script was locked for production — the
 * set that earns a revision asterisk. Baseline is the most recent version
 * snapshot whose label marks a production lock; an element is "changed" if
 * its text differs from the baseline, or it did not exist at lock time.
 * Empty when the script was never locked. Reuses the version timeline, so
 * no revision state is persisted on the document.
 */
export function changedSinceLock(
  elements: ScriptElement[],
  timeline: HistoryEntry[],
): Set<string> {
  let lockEntry: HistoryEntry | null = null;
  for (const entry of timeline) {
    if (entry.label.toLowerCase().startsWith("locked")) lockEntry = entry;
  }
  if (!lockEntry) return new Set();
  const baseline = new Map(lockEntry.elements.map((e) => [e.id, e.text]));
  const changed = new Set<string>();
  for (const el of elements) {
    if (!baseline.has(el.id) || baseline.get(el.id) !== el.text)
      changed.add(el.id);
  }
  return changed;
}

/** Aggregate speech/word counts by gender. */
export function genderBreakdown(stats: CharacterStats[]): GenderBreakdown {
  const out: GenderBreakdown = {
    speeches: EMPTY_GENDER_RECORD(),
    words: EMPTY_GENDER_RECORD(),
    characters: EMPTY_GENDER_RECORD(),
  };
  for (const s of stats) {
    out.speeches[s.gender] += s.speeches;
    out.words[s.gender] += s.words;
    out.characters[s.gender] += 1;
  }
  return out;
}
