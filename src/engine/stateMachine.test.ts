import { describe, it, expect } from "vitest";
import {
  onEnter,
  onTab,
  onBackspaceAtStart,
  detectTypeFromText,
  normalizeText,
  normalizeParenthetical,
  canonicalCharacterName,
  cycleType,
  NEXT_ON_ENTER,
  NEXT_ON_TAB,
} from "./stateMachine";
import { makeElement } from "../stores/scriptStore";
import type { ElementType } from "../types";

const ctx = (type: ElementType, text: string, caret = text.length) => ({
  element: makeElement(type, text),
  caret,
});

describe("Enter transitions (caret at end, element has text)", () => {
  const cases: Array<[ElementType, ElementType]> = [
    ["scene_heading", "action"],
    ["action", "action"],
    ["character", "dialogue"],
    ["dialogue", "action"],
    ["parenthetical", "dialogue"],
    ["transition", "scene_heading"],
    ["shot", "action"],
  ];
  for (const [from, to] of cases) {
    it(`${from} -> ${to}`, () => {
      const a = onEnter(ctx(from, "SOME TEXT"));
      expect(a).toEqual({ kind: "create", type: to });
      expect(NEXT_ON_ENTER[from]).toBe(to);
    });
  }
});

describe("Enter on empty element", () => {
  it("transforms empty character to action (escape hatch)", () => {
    expect(onEnter(ctx("character", ""))).toEqual({
      kind: "transform",
      type: "action",
    });
  });
  it("transforms empty dialogue to action", () => {
    expect(onEnter(ctx("dialogue", ""))).toEqual({
      kind: "transform",
      type: "action",
    });
  });
  it("empty action creates a new action (blank line flow)", () => {
    expect(onEnter(ctx("action", ""))).toEqual({
      kind: "create",
      type: "action",
    });
  });
  it("transforms empty scene heading to action", () => {
    expect(onEnter(ctx("scene_heading", ""))).toEqual({
      kind: "transform",
      type: "action",
    });
  });
});

describe("Enter mid-text splits the element", () => {
  it("splits action into two actions", () => {
    expect(onEnter(ctx("action", "He runs. She follows.", 8))).toEqual({
      kind: "split",
      type: "action",
    });
  });
  it("splits dialogue into dialogue", () => {
    expect(onEnter(ctx("dialogue", "Hello there world", 5))).toEqual({
      kind: "split",
      type: "dialogue",
    });
  });
  it("scene heading tail becomes action", () => {
    expect(onEnter(ctx("scene_heading", "INT. HOUSE - DAY", 4))).toEqual({
      kind: "split",
      type: "action",
    });
  });
});

describe("Tab transitions", () => {
  const cases: Array<[ElementType, ElementType]> = [
    ["scene_heading", "action"],
    ["action", "character"],
    ["character", "transition"],
    ["dialogue", "parenthetical"],
    ["parenthetical", "dialogue"],
    ["transition", "scene_heading"],
  ];
  for (const [from, to] of cases) {
    it(`empty ${from} transforms in place to ${to}`, () => {
      expect(onTab(ctx(from, ""))).toEqual({ kind: "transform", type: to });
      expect(NEXT_ON_TAB[from]).toBe(to);
    });
    it(`non-empty ${from} creates new ${to}`, () => {
      expect(onTab(ctx(from, "X"))).toEqual({ kind: "create", type: to });
    });
  }
});

describe("Backspace at start merges", () => {
  it("merges into previous element when caret is at 0", () => {
    expect(onBackspaceAtStart(ctx("dialogue", "hello", 0))).toEqual({
      kind: "merge",
    });
  });
  it("does nothing mid-text", () => {
    expect(onBackspaceAtStart(ctx("dialogue", "hello", 3))).toEqual({
      kind: "none",
    });
  });
  it("does nothing with a selection", () => {
    expect(
      onBackspaceAtStart({
        element: makeElement("dialogue", "hello"),
        caret: 0,
        hasSelection: true,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("Smart type detection", () => {
  it.each([
    "INT. HOUSE - DAY",
    "EXT. STREET - NIGHT",
    "INT./EXT. CAR - DUSK",
    "I/E. TRAIN - DAY",
    "EST. CITY SKYLINE",
  ])("detects scene heading: %s", (text) => {
    expect(detectTypeFromText(text, "action")).toBe("scene_heading");
  });
  it("detects lowercase int. prefix too", () => {
    expect(detectTypeFromText("int. kitchen - day", "action")).toBe(
      "scene_heading",
    );
  });
  it("detects CUT TO: as transition", () => {
    expect(detectTypeFromText("CUT TO:", "action")).toBe("transition");
  });
  it("detects FADE IN: as transition", () => {
    expect(detectTypeFromText("FADE IN:", "action")).toBe("transition");
  });
  it("does not convert plain action text", () => {
    expect(detectTypeFromText("He walks into the room.", "action")).toBeNull();
  });
  it('does not convert lowercase "cut to:" typed in action', () => {
    expect(detectTypeFromText("cut to:", "action")).toBeNull();
  });
  it("detects parenthetical inside dialogue", () => {
    expect(detectTypeFromText("(beat)", "dialogue")).toBe("parenthetical");
  });
  it("detects shots", () => {
    expect(detectTypeFromText("CLOSE ON the knife", "action")).toBe("shot");
  });
});

describe("Normalisation", () => {
  it("uppercases scene headings, characters, transitions, shots", () => {
    expect(normalizeText("scene_heading", "int. house - day")).toBe(
      "INT. HOUSE - DAY",
    );
    expect(normalizeText("character", "sarah")).toBe("SARAH");
    expect(normalizeText("transition", "cut to:")).toBe("CUT TO:");
    expect(normalizeText("shot", "close on")).toBe("CLOSE ON");
  });
  it("leaves action/dialogue untouched", () => {
    expect(normalizeText("action", "He Runs.")).toBe("He Runs.");
    expect(normalizeText("dialogue", "Hi there.")).toBe("Hi there.");
  });
  it("wraps parentheticals in parens", () => {
    expect(normalizeParenthetical("beat")).toBe("(beat)");
    expect(normalizeParenthetical("(beat")).toBe("(beat)");
    expect(normalizeParenthetical("(beat)")).toBe("(beat)");
    expect(normalizeParenthetical("")).toBe("");
  });
  it("canonical character names strip extensions", () => {
    expect(canonicalCharacterName("SARAH (V.O.)")).toBe("SARAH");
    expect(canonicalCharacterName("sarah (cont'd)")).toBe("SARAH");
    expect(canonicalCharacterName("  JOHN  DOE ")).toBe("JOHN DOE");
  });
});

describe("Type cycling", () => {
  it("cycles forward and wraps", () => {
    expect(cycleType("scene_heading", 1)).toBe("action");
    expect(cycleType("general", 1)).toBe("scene_heading");
  });
  it("cycles backward and wraps", () => {
    expect(cycleType("scene_heading", -1)).toBe("general");
  });
});
