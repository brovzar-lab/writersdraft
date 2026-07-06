import { describe, expect, it } from "vitest";
import {
  changedSinceLock,
  charactersInScene,
  wordsToday,
} from "./analysis";
import type { HistoryEntry, ScriptElement, TitlePage } from "../types";

let seq = 0;
function el(type: ScriptElement["type"], text = ""): ScriptElement {
  return { id: `e${seq++}`, type, text };
}

const TP: TitlePage = { title: "", author: "", contact: "", draftDate: "" };
function entry(
  label: string,
  at: number,
  elements: ScriptElement[],
  words: number,
): HistoryEntry {
  return { id: `h${seq++}`, at, label, elements, titlePage: TP, pageCount: 1, words };
}

describe("charactersInScene", () => {
  it("counts speeches per speaker within the scene only", () => {
    const heading = el("scene_heading", "INT. ROOM - DAY");
    const els: ScriptElement[] = [
      heading,
      el("action", "A room."),
      el("character", "VALERIA"),
      el("dialogue", "Hello."),
      el("character", "VOZ (V.O.)"),
      el("dialogue", "Who is this?"),
      el("character", "VALERIA"),
      el("dialogue", "You tell me."),
      el("scene_heading", "EXT. STREET - DAY"),
      el("character", "MARCO"),
      el("dialogue", "Not counted."),
    ];
    const result = charactersInScene(els, heading.id);
    expect(result).toEqual([
      { name: "VALERIA", speeches: 2 },
      { name: "VOZ", speeches: 1 },
    ]);
  });

  it("returns [] for a non-heading id", () => {
    const a = el("action", "x");
    expect(charactersInScene([a], a.id)).toEqual([]);
  });
});

describe("wordsToday", () => {
  const noon = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const yesterday = new Date(2026, 5, 14, 12, 0, 0).getTime();
  const earlierToday = new Date(2026, 5, 15, 9, 0, 0).getTime();

  it("is zero with no timeline", () => {
    expect(wordsToday([], 500, noon)).toBe(0);
  });

  it("uses the latest pre-midnight snapshot as baseline", () => {
    const tl = [
      entry("Autosave", yesterday, [], 900),
      entry("Autosave", earlierToday, [], 1200),
    ];
    // baseline is yesterday's 900 (last before local midnight).
    expect(wordsToday(tl, 1512, noon)).toBe(612);
  });

  it("uses the earliest snapshot when writing started today", () => {
    const tl = [entry("Autosave", earlierToday, [], 100)];
    expect(wordsToday(tl, 380, noon)).toBe(280);
  });

  it("can be negative on a cutting day", () => {
    const tl = [entry("Autosave", yesterday, [], 1000)];
    expect(wordsToday(tl, 850, noon)).toBe(-150);
  });
});

describe("changedSinceLock", () => {
  it("is empty when the script was never locked", () => {
    const els = [el("action", "a")];
    expect(changedSinceLock(els, []).size).toBe(0);
  });

  it("flags edited and newly-added elements against the lock snapshot", () => {
    const a = el("scene_heading", "INT. A");
    const b = el("action", "original");
    const locked = entry("Locked for production", 1000, [
      { ...a },
      { ...b },
    ], 2);
    // b edited, c added, a untouched.
    const current: ScriptElement[] = [
      { ...a },
      { ...b, text: "edited" },
      el("action", "brand new"),
    ];
    const changed = changedSinceLock(current, [locked]);
    expect(changed.has(a.id)).toBe(false);
    expect(changed.has(b.id)).toBe(true);
    expect(changed.size).toBe(2); // b + the new element
  });
});
