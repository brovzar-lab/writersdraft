/**
 * SmartType: as-you-type completion for the elements screenwriters repeat
 * constantly — character names, scene-heading prefixes/locations/times,
 * transitions, and character extensions. Pure functions over the script's
 * own contents; the editor popup is just a view of these suggestions.
 */
import type { ElementType, ScriptElement } from "../types";
import { canonicalCharacterName } from "./stateMachine";

export const SCENE_PREFIXES = [
  "INT. ",
  "EXT. ",
  "INT./EXT. ",
  "I/E. ",
  "EST. ",
];
export const TIMES_OF_DAY = [
  "DAY",
  "NIGHT",
  "MORNING",
  "AFTERNOON",
  "EVENING",
  "DUSK",
  "DAWN",
  "CONTINUOUS",
  "LATER",
  "MOMENTS LATER",
  "SAME TIME",
];
export const STANDARD_TRANSITIONS = [
  "CUT TO:",
  "SMASH CUT TO:",
  "MATCH CUT TO:",
  "DISSOLVE TO:",
  "FADE OUT.",
  "FADE TO BLACK.",
  "FADE IN:",
  "INTERCUT WITH:",
];
export const CHARACTER_EXTENSIONS = [
  "(V.O.)",
  "(O.S.)",
  "(O.C.)",
  "(CONT'D)",
  "(INTO PHONE)",
  "(SUBTITLED)",
];

export interface SmartTypeContext {
  /** Canonical character names, most recently used first. */
  characters: string[];
  /** Known locations from existing scene headings, most recent first. */
  locations: string[];
}

/** Harvest characters + locations from the script (call at popup time). */
export function buildContext(elements: ScriptElement[]): SmartTypeContext {
  const chars: string[] = [];
  const locs: string[] = [];
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "character") {
      const name = canonicalCharacterName(el.text);
      if (name && !chars.includes(name)) chars.push(name);
    } else if (el.type === "scene_heading") {
      const loc = locationOf(el.text);
      if (loc && !locs.includes(loc)) locs.push(loc);
    }
  }
  return { characters: chars, locations: locs };
}

/** "INT. MABEL'S DINER - NIGHT" -> "MABEL'S DINER" */
export function locationOf(heading: string): string {
  let t = heading.trim().toUpperCase();
  for (const p of SCENE_PREFIXES) {
    if (t.startsWith(p.trim())) {
      t = t.slice(p.trim().length).trimStart();
      break;
    }
  }
  const dash = t.lastIndexOf(" - ");
  if (dash >= 0) t = t.slice(0, dash);
  return t.trim();
}

export interface Suggestion {
  /** Full replacement text for the element. */
  text: string;
  /** The portion shown emphasized (what would be inserted). */
  completion: string;
}

function prefixMatches(
  candidates: string[],
  typed: string,
  prefix = "",
): Suggestion[] {
  const t = typed.toUpperCase();
  return candidates
    .filter((c) => c.toUpperCase().startsWith(t) && c.toUpperCase() !== t)
    .slice(0, 6)
    .map((c) => ({ text: prefix + c, completion: c.slice(typed.length) }));
}

/**
 * Suggestions for the current element given the full text typed so far.
 * Returns [] when there is nothing worth offering (never suggests on an
 * empty character cue's behalf — a single letter is enough to start).
 */
export function suggest(
  type: ElementType,
  text: string,
  ctx: SmartTypeContext,
): Suggestion[] {
  if (type === "character") {
    // "MAB" -> MABEL; "MABEL (" -> extensions.
    const parenAt = text.indexOf("(");
    if (parenAt >= 0) {
      const base = text.slice(0, parenAt).trimEnd();
      const typedExt = text.slice(parenAt);
      return prefixMatches(CHARACTER_EXTENSIONS, typedExt, base + " ");
    }
    if (text.length === 0) return [];
    return prefixMatches(ctx.characters, text.toUpperCase());
  }

  if (type === "scene_heading") {
    const up = text.toUpperCase();
    const prefix = SCENE_PREFIXES.find((p) => up.startsWith(p));
    if (!prefix) {
      // Still typing the prefix (or nothing): offer prefixes.
      return prefixMatches(SCENE_PREFIXES, up).map((s) => ({
        ...s,
        text: s.text,
      }));
    }
    const rest = up.slice(prefix.length);
    const dash = rest.lastIndexOf(" - ");
    if (dash >= 0) {
      // After " - ": time of day.
      const typedTime = rest.slice(dash + 3);
      return prefixMatches(
        TIMES_OF_DAY,
        typedTime,
        prefix + rest.slice(0, dash + 3),
      );
    }
    if (rest.length === 0) {
      // Fresh location: offer known locations outright.
      return ctx.locations
        .slice(0, 6)
        .map((l) => ({ text: prefix + l, completion: l }));
    }
    return prefixMatches(ctx.locations, rest, prefix);
  }

  if (type === "transition") {
    if (text.length === 0) return [];
    return prefixMatches(STANDARD_TRANSITIONS, text.toUpperCase());
  }

  return [];
}
