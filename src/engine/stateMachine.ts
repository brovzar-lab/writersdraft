/**
 * The Tab/Enter editor state machine.
 *
 * Encodes Final Draft's element-flow conventions so a writer can format an
 * entire script without leaving the keyboard:
 *
 *   Enter (element has text, caret at end) -> create next element:
 *     Scene Heading -> Action        Character     -> Dialogue
 *     Action        -> Action        Parenthetical -> Dialogue
 *     Dialogue      -> Action        Transition    -> Scene Heading
 *     Shot          -> Action        General       -> General
 *
 *   Tab -> jump to the "sibling" element type:
 *     Scene Heading -> Action        Character     -> Transition
 *     Action        -> Character     Parenthetical -> Dialogue
 *     Dialogue      -> Parenthetical Transition    -> Scene Heading
 *     Shot          -> Character     General       -> Scene Heading
 *
 *   On an EMPTY element, Tab transforms the element in place and Enter
 *   converts it to Action (escape hatch out of any flow).
 */
import type { ElementType, ScriptElement } from "../types";

export const NEXT_ON_ENTER: Record<ElementType, ElementType> = {
  scene_heading: "action",
  action: "action",
  character: "dialogue",
  dialogue: "action",
  parenthetical: "dialogue",
  transition: "scene_heading",
  shot: "action",
  general: "general",
};

export const NEXT_ON_TAB: Record<ElementType, ElementType> = {
  scene_heading: "action",
  action: "character",
  character: "transition",
  dialogue: "parenthetical",
  parenthetical: "dialogue",
  transition: "scene_heading",
  shot: "character",
  general: "scene_heading",
};

/** Element types whose text is displayed in upper case. */
export const UPPERCASE_TYPES: ReadonlySet<ElementType> = new Set([
  "scene_heading",
  "character",
  "transition",
  "shot",
]);

export interface MachineAction {
  kind:
    | "transform" // change current element's type in place
    | "split" // split current element at caret into two elements
    | "create" // insert a new element after the current one
    | "merge" // merge current element into the previous one (backspace at start)
    | "none";
  /** For transform/create/split: the element type of the (new) element. */
  type?: ElementType;
}

export interface KeyContext {
  element: ScriptElement;
  caret: number;
  /** True when there is a non-collapsed selection (handled by the editor). */
  hasSelection?: boolean;
}

/** Decide what pressing Enter does given the current element and caret. */
export function onEnter(ctx: KeyContext): MachineAction {
  const { element, caret } = ctx;
  const text = element.text;
  if (text.length === 0) {
    // Escape hatch: an empty element becomes Action rather than spawning
    // an endless chain (empty Action stays put).
    if (element.type === "action" || element.type === "general") {
      return { kind: "create", type: NEXT_ON_ENTER[element.type] };
    }
    return { kind: "transform", type: "action" };
  }
  if (caret < text.length) {
    // Splitting mid-element keeps the same type for the remainder, except a
    // split scene heading's tail is really new action.
    const tail: ElementType =
      element.type === "scene_heading" || element.type === "character"
        ? "action"
        : element.type;
    return { kind: "split", type: tail };
  }
  return { kind: "create", type: NEXT_ON_ENTER[element.type] };
}

/** Decide what pressing Tab does. */
export function onTab(ctx: KeyContext): MachineAction {
  const { element } = ctx;
  if (element.text.length === 0) {
    return { kind: "transform", type: NEXT_ON_TAB[element.type] };
  }
  return { kind: "create", type: NEXT_ON_TAB[element.type] };
}

/** Decide what Backspace at caret position 0 does. */
export function onBackspaceAtStart(ctx: KeyContext): MachineAction {
  if (ctx.caret !== 0 || ctx.hasSelection) return { kind: "none" };
  return { kind: "merge" };
}

const SCENE_HEADING_PREFIXES = [
  "INT.",
  "EXT.",
  "INT/EXT.",
  "INT./EXT.",
  "EXT/INT.",
  "EXT./INT.",
  "I/E.",
  "EST.",
];

const TRANSITION_SUFFIXES = ["TO:", "OUT.", "IN:", "BLACK."];
const TRANSITION_EXACT = [
  "FADE IN:",
  "FADE OUT.",
  "CUT TO BLACK.",
  "DISSOLVE TO:",
  "SMASH CUT TO:",
  "MATCH CUT TO:",
  "FADE TO BLACK.",
];

const SHOT_PREFIXES = [
  "ANGLE ON",
  "CLOSE ON",
  "CLOSE UP",
  "POV",
  "INSERT",
  "AERIAL SHOT",
  "TRACKING SHOT",
  "WIDE SHOT",
  "EXTREME CLOSE UP",
];

/**
 * Smart auto-detection: as the writer types, recognise text that is
 * unambiguously another element type and suggest the conversion.
 * Returns the detected type or null when no conversion applies.
 */
export function detectTypeFromText(
  text: string,
  current: ElementType,
): ElementType | null {
  const t = text.trimStart().toUpperCase();
  if (current === "action" || current === "general") {
    if (SCENE_HEADING_PREFIXES.some((p) => t.startsWith(p)))
      return "scene_heading";
    if (TRANSITION_EXACT.includes(t.trim())) return "transition";
    if (
      t === t.trimEnd() &&
      t.length > 3 &&
      TRANSITION_SUFFIXES.some((s) => t.endsWith(s)) &&
      t === text.trimStart() // already upper case as typed
    ) {
      return "transition";
    }
    if (SHOT_PREFIXES.some((p) => t.startsWith(p))) return "shot";
  }
  if (current === "dialogue" && t.startsWith("(")) return "parenthetical";
  return null;
}

/** Wrap parenthetical text in parens for display/storage normalisation. */
export function normalizeParenthetical(text: string): string {
  let t = text.trim();
  if (t === "") return t;
  if (!t.startsWith("(")) t = `(${t}`;
  if (!t.endsWith(")")) t = `${t})`;
  return t;
}

/** Normalise element text according to its type (case rules etc.). */
export function normalizeText(type: ElementType, text: string): string {
  if (UPPERCASE_TYPES.has(type)) return text.toUpperCase();
  if (type === "parenthetical") return normalizeParenthetical(text);
  return text;
}

/**
 * Character extensions like (V.O.) / (O.S.) / (CONT'D) are stripped when
 * computing the canonical character name.
 */
export function canonicalCharacterName(text: string): string {
  return text
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Cycle order used by the element-type keyboard shortcut (Ctrl+Alt+Arrow). */
export const CYCLE_ORDER: ElementType[] = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "general",
];

export function cycleType(current: ElementType, dir: 1 | -1): ElementType {
  const i = CYCLE_ORDER.indexOf(current);
  const n = CYCLE_ORDER.length;
  return CYCLE_ORDER[(i + dir + n) % n];
}
