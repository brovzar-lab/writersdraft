import { describe, it, expect, beforeEach } from "vitest";
import { useScriptStore, emptyScript, makeElement } from "./scriptStore";
import { parseFountainBody, elementsToFountain } from "../engine/fountain";
import type { Script } from "../types";

const store = () => useScriptStore.getState();

function seed(): Script {
  const s = emptyScript();
  s.elements = [
    makeElement("scene_heading", "INT. HOUSE - DAY"),
    makeElement("action", "Sunlight fills the room."),
    makeElement("character", "SARAH"),
    makeElement("dialogue", "What a beautiful morning."),
  ];
  return s;
}

beforeEach(() => {
  useScriptStore.setState({
    script: seed(),
    past: [],
    future: [],
    dirty: false,
    timeline: [],
  });
});

describe("parseFountainBody as the paste pipeline", () => {
  it("splits a raw pasted script into typed elements without blank-line conventions", () => {
    const parts = parseFountainBody(
      "INT. VAULT - NIGHT\nThe door creaks open.\nMOSS\n(whispering)\nNobody move.\nCUT TO:".split(
        "\n",
      ),
    );
    expect(parts.map((p) => p.type)).toEqual([
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
    ]);
  });

  it("detects shots and does not mistake them for character cues", () => {
    const parts = parseFountainBody([
      "CLOSE ON THE GAUGE",
      "The needle trembles.",
    ]);
    expect(parts.map((p) => p.type)).toEqual(["shot", "action"]);
  });

  it("round-trips through elementsToFountain preserving types", () => {
    const original = seed().elements;
    const parts = parseFountainBody(elementsToFountain(original).split("\n"));
    expect(parts.map((p) => [p.type, p.text])).toEqual(
      original.map((e) => [e.type, e.text]),
    );
  });
});

describe("pasteElements", () => {
  it("splits the target at the caret and inserts typed parts between the halves", () => {
    const target = store().script.elements[1]; // 'Sunlight fills the room.'
    const parts = parseFountainBody(["INT. CELLAR - NIGHT", "Darkness."]);
    const res = store().pasteElements(target.id, 8, parts)!;
    const els = store().script.elements;
    expect(els.map((e) => e.type)).toEqual([
      "scene_heading",
      "action",
      "scene_heading",
      "action",
      "action",
      "character",
      "dialogue",
    ]);
    expect(els[1].text).toBe("Sunlight");
    expect(els[2].text).toBe("INT. CELLAR - NIGHT");
    expect(els[4].text).toBe(" fills the room.");
    // Caret lands at the end of the pasted content.
    expect(res.focusId).toBe(parts[1].id);
    expect(res.offset).toBe("Darkness.".length);
  });

  it("drops empty halves when pasting at the start or end of an element", () => {
    const target = store().script.elements[1];
    store().pasteElements(target.id, 0, [makeElement("action", "Before.")]);
    const els = store().script.elements;
    expect(els[1].text).toBe("Before.");
    expect(els[2].text).toBe("Sunlight fills the room.");
    expect(els).toHaveLength(5);
  });

  it("replaces the [caret, replaceTo) span when given a selection", () => {
    const target = store().script.elements[1];
    store().pasteElements(target.id, 9, [makeElement("action", "floods")], 14);
    const els = store().script.elements;
    expect(els[1].text).toBe("Sunlight ");
    expect(els[2].text).toBe("floods");
    expect(els[3].text).toBe(" the room.");
  });

  it("is one undo step", () => {
    const target = store().script.elements[1];
    store().pasteElements(
      target.id,
      8,
      parseFountainBody(["INT. A - DAY", "B.", "C."]),
    );
    expect(store().script.elements.length).toBeGreaterThan(4);
    store().undo();
    expect(store().script.elements.map((e) => e.text)).toEqual([
      "INT. HOUSE - DAY",
      "Sunlight fills the room.",
      "SARAH",
      "What a beautiful morning.",
    ]);
  });
});

describe("deleteRange across element boundaries", () => {
  it("joins the start head to the end tail and removes everything between", () => {
    const els = store().script.elements;
    // From inside the action (offset 8) to inside the dialogue (offset 7).
    const res = store().deleteRange(els[1].id, 8, els[3].id, 7)!;
    const after = store().script.elements;
    expect(after.map((e) => e.type)).toEqual(["scene_heading", "action"]);
    expect(after[1].text).toBe("Sunlightbeautiful morning.");
    expect(res).toEqual({ focusId: after[1].id, offset: 8 });
  });

  it("normalises a backwards (focus-before-anchor) selection", () => {
    const els = store().script.elements;
    const res = store().deleteRange(els[3].id, 7, els[1].id, 8)!;
    expect(store().script.elements[1].text).toBe("Sunlightbeautiful morning.");
    expect(res.offset).toBe(8);
  });

  it("gives the survivor the END element type when the start element is consumed whole", () => {
    const els = store().script.elements;
    // From the very start of the SARAH cue into the dialogue: the cue is
    // gone; what survives is dialogue.
    const res = store().deleteRange(els[2].id, 0, els[3].id, 7)!;
    const after = store().script.elements;
    expect(after.map((e) => e.type)).toEqual([
      "scene_heading",
      "action",
      "dialogue",
    ]);
    expect(after[2].text).toBe("beautiful morning.");
    expect(res).toEqual({ focusId: after[2].id, offset: 0 });
  });

  it("handles a same-element range", () => {
    const els = store().script.elements;
    store().deleteRange(els[1].id, 0, els[1].id, 9);
    expect(store().script.elements[1].text).toBe("fills the room.");
  });

  it("is one undo step and restores every deleted element", () => {
    const els = store().script.elements;
    store().deleteRange(els[0].id, 4, els[3].id, 25);
    expect(store().script.elements).toHaveLength(1);
    store().undo();
    expect(store().script.elements.map((e) => e.text)).toEqual([
      "INT. HOUSE - DAY",
      "Sunlight fills the room.",
      "SARAH",
      "What a beautiful morning.",
    ]);
  });
});

describe("extractRange (copy)", () => {
  it("slices the boundary elements and clones whole middles, preserving types", () => {
    const els = store().script.elements;
    const parts = store().extractRange(els[1].id, 9, els[3].id, 4);
    expect(parts.map((p) => [p.type, p.text])).toEqual([
      ["action", "fills the room."],
      ["character", "SARAH"],
      ["dialogue", "What"],
    ]);
    // Non-mutating.
    expect(store().script.elements).toHaveLength(4);
    expect(store().past).toHaveLength(0);
  });

  it("copy → serialize → parse preserves element types end to end", () => {
    const els = store().script.elements;
    const parts = store().extractRange(els[0].id, 0, els[3].id, 25);
    const pasted = parseFountainBody(elementsToFountain(parts).split("\n"));
    expect(pasted.map((p) => p.type)).toEqual([
      "scene_heading",
      "action",
      "character",
      "dialogue",
    ]);
  });
});
