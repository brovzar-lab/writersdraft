import { describe, it, expect } from "vitest";
import {
  wrapText,
  paginate,
  elementLines,
  elementPageMap,
  LINES_PER_PAGE,
  ELEMENT_LAYOUT,
} from "./pagination";
import { makeElement } from "../stores/scriptStore";
import type { ScriptElement } from "../types";

describe("wrapText", () => {
  it("returns a single empty line for empty text", () => {
    expect(wrapText("", 60)).toEqual([""]);
  });
  it("keeps short text on one line", () => {
    expect(wrapText("Hello world", 60)).toEqual(["Hello world"]);
  });
  it("wraps at word boundaries", () => {
    expect(wrapText("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
  });
  it("never exceeds the column width", () => {
    const lines = wrapText("word ".repeat(50).trim(), 35);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(35);
  });
  it("hard-breaks single words longer than the width", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("respects explicit newlines", () => {
    expect(wrapText("a\nb", 10)).toEqual(["a", "b"]);
  });
});

describe("industry layout metrics", () => {
  it("uses 55 lines per page", () => {
    expect(LINES_PER_PAGE).toBe(55);
  });
  it('action is full 6.0" width (60 chars) at the left margin', () => {
    expect(ELEMENT_LAYOUT.action).toMatchObject({ indent: 0, width: 60 });
  });
  it('dialogue is 3.5" wide starting at 2.5"', () => {
    expect(ELEMENT_LAYOUT.dialogue).toMatchObject({ indent: 10, width: 35 });
  });
  it('character cue starts at 3.7"', () => {
    expect(ELEMENT_LAYOUT.character.indent).toBe(22);
  });
  it('parenthetical starts at 3.1"', () => {
    expect(ELEMENT_LAYOUT.parenthetical.indent).toBe(16);
  });
  it("transitions are right-aligned", () => {
    expect(ELEMENT_LAYOUT.transition.rightAlign).toBe(true);
  });
});

const scene = (text = "INT. HOUSE - DAY") => makeElement("scene_heading", text);
const action = (text: string) => makeElement("action", text);
const character = (text = "SARAH") => makeElement("character", text);
const dialogue = (text: string) => makeElement("dialogue", text);

describe("paginate", () => {
  it("produces one page for an empty script", () => {
    const pages = paginate([makeElement("scene_heading")]);
    expect(pages).toHaveLength(1);
    expect(pages[0].number).toBe(1);
  });

  it("a short scene fits on one page", () => {
    const pages = paginate([
      scene(),
      action("Sunlight."),
      character(),
      dialogue("Hello."),
    ]);
    expect(pages).toHaveLength(1);
    const kinds = pages[0].lines.map((l) => l.type + ":" + l.kind);
    expect(kinds[0]).toBe("scene_heading:text");
  });

  it("inserts spacing between blocks but never at the top of a page", () => {
    const pages = paginate([scene(), action("One."), action("Two.")]);
    const lines = pages[0].lines;
    expect(lines[0].kind).toBe("text"); // no leading blank
    // scene heading, blank, action, blank, action
    expect(lines.map((l) => l.kind)).toEqual([
      "text",
      "blank",
      "text",
      "blank",
      "text",
    ]);
  });

  it("never emits a page with more than LINES_PER_PAGE lines", () => {
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 120; i++)
      els.push(action(`Beat ${i}. Something happens here.`));
    const pages = paginate(els);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages)
      expect(p.lines.length).toBeLessThanOrEqual(LINES_PER_PAGE);
  });

  it("numbers pages sequentially from 1", () => {
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 200; i++) els.push(action(`Line ${i}`));
    const pages = paginate(els);
    pages.forEach((p, i) => expect(p.number).toBe(i + 1));
  });

  it("never orphans a scene heading at the bottom of a page", () => {
    // Fill so the heading would land exactly on the last line.
    const els: ScriptElement[] = [scene("INT. FIRST - DAY")];
    for (let i = 0; i < 26; i++) els.push(action(`Beat ${i}`)); // 1 + 26*2 = 53 lines
    els.push(scene("INT. SECOND - DAY")); // would start at line 55
    els.push(action("After."));
    const pages = paginate(els);
    for (const p of pages) {
      const last = p.lines[p.lines.length - 1];
      expect(last.type === "scene_heading" && last.kind === "text").toBe(false);
    }
    // The second heading must be on page 2 with its action.
    const map = elementPageMap(pages);
    expect(map.get(els[27].id)).toBe(2);
    expect(map.get(els[28].id)).toBe(2);
  });

  it("never separates a character cue from its dialogue", () => {
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 26; i++) els.push(action(`Beat ${i}`));
    els.push(character("SARAH"));
    els.push(dialogue("Hi."));
    const pages = paginate(els);
    for (const p of pages) {
      const last = p.lines[p.lines.length - 1];
      expect(last.type === "character" && last.kind === "text").toBe(false);
    }
  });

  it("splits long dialogue with (MORE) and CHARACTER (CONT'D)", () => {
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 24; i++) els.push(action(`Beat ${i}`));
    els.push(character("SARAH"));
    // A monologue long enough to cross the page boundary.
    els.push(dialogue("word ".repeat(120).trim()));
    const pages = paginate(els);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const p1 = pages.find((p) => p.lines.some((l) => l.kind === "more"));
    expect(p1).toBeDefined();
    const moreLine = p1!.lines[p1!.lines.length - 1];
    expect(moreLine.kind).toBe("more");
    expect(moreLine.text).toBe("(MORE)");
    const p2 = pages[p1!.number]; // next page (number is 1-based)
    expect(p2.lines[0].kind).toBe("contd");
    expect(p2.lines[0].text).toBe("SARAH (CONT'D)");
  });

  it("splits very long action blocks across pages without loss", () => {
    const longAction = action("word ".repeat(800).trim());
    const pages = paginate([scene(), longAction]);
    const textLines = pages
      .flatMap((p) => p.lines)
      .filter((l) => l.kind === "text" && l.elementId === longAction.id);
    expect(textLines.length).toBe(elementLines(longAction).length);
    // Content round-trips.
    const joined = textLines.map((l) => l.text).join(" ");
    expect(joined).toBe(longAction.text);
  });

  it("carries the cue when a short dialogue moves whole to the next page (orphan regression)", () => {
    // Fill to exactly 52 lines so the cue (gap+1) would end on line 54,
    // leaving one line — too few for a 2-line dialogue, which then moves
    // whole. Before the fix, page 1 ended with an orphaned "SARAH".
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 24; i++) els.push(action(`Beat ${i}`)); // 1 + 48 = 49
    els.push(action("z".repeat(60) + " " + "w".repeat(20))); // +3 = 52
    els.push(character("SARAH"));
    els.push(dialogue("x".repeat(35) + " " + "y".repeat(35))); // 2 lines
    const pages = paginate(els);
    expect(pages.length).toBe(2);
    const lastLine = pages[0].lines[pages[0].lines.length - 1];
    expect(lastLine.type).not.toBe("character");
    expect(lastLine.kind).toBe("text"); // no dangling blank either
    // Cue and dialogue land together at the top of page 2.
    expect(pages[1].lines[0]).toMatchObject({
      type: "character",
      kind: "text",
      text: "SARAH",
    });
    expect(pages[1].lines[1].type).toBe("dialogue");
    // No lines lost.
    const dialogueLines = pages
      .flatMap((p) => p.lines)
      .filter((l) => l.type === "dialogue" && l.kind === "text");
    expect(dialogueLines).toHaveLength(2);
  });

  it("carries cue AND parenthetical when the dialogue flushes", () => {
    // 51 lines, then cue(+gap)=53, paren=54, leaving 1 line for a 2-line speech.
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 25; i++) els.push(action(`Beat ${i}`)); // 1 + 50 = 51
    els.push(character("SARAH"));
    els.push(makeElement("parenthetical", "(quietly)"));
    els.push(dialogue("x".repeat(35) + " " + "y".repeat(35)));
    const pages = paginate(els);
    expect(pages.length).toBe(2);
    const p1Last = pages[0].lines[pages[0].lines.length - 1];
    expect(["character", "parenthetical"]).not.toContain(p1Last.type);
    expect(pages[1].lines[0]).toMatchObject({
      type: "character",
      text: "SARAH",
    });
    expect(pages[1].lines[1].type).toBe("parenthetical");
    expect(pages[1].lines[2].type).toBe("dialogue");
  });

  it("carries the cue when a LONG dialogue cannot start under it", () => {
    // Cue lands with a single line left; a >2-line dialogue needs 2 to start.
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 24; i++) els.push(action(`Beat ${i}`));
    els.push(action("z".repeat(60) + " " + "w".repeat(20))); // 52 lines total
    els.push(character("SARAH"));
    els.push(dialogue("word ".repeat(120).trim())); // many lines
    const pages = paginate(els);
    const p1Last = pages[0].lines[pages[0].lines.length - 1];
    expect(p1Last.type).not.toBe("character");
    expect(pages[1].lines[0]).toMatchObject({
      type: "character",
      text: "SARAH",
    });
  });

  it("elementPageMap reports the page each element starts on", () => {
    const els: ScriptElement[] = [scene()];
    for (let i = 0; i < 80; i++) els.push(action(`Beat ${i}`));
    const pages = paginate(els);
    const map = elementPageMap(pages);
    expect(map.get(els[0].id)).toBe(1);
    expect(map.get(els[els.length - 1].id)).toBe(pages.length);
  });

  it("is deterministic", () => {
    const els = [scene(), action("One."), character(), dialogue("Two.")];
    expect(paginate(els)).toEqual(paginate(els));
  });
});
