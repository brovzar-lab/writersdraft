import { describe, it, expect } from "vitest";
import {
  paginate,
  paginateIncremental,
  type PaginationCache,
} from "./pagination";
import { makeElement } from "../stores/scriptStore";
import type { ElementType, ScriptElement } from "../types";

/** Deterministic PRNG so failures reproduce. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES: ElementType[] = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "shot",
];

function randomScript(rnd: () => number, size: number): ScriptElement[] {
  const out: ScriptElement[] = [];
  for (let i = 0; i < size; i++) {
    const type = TYPES[Math.floor(rnd() * TYPES.length)];
    const words =
      Math.floor(rnd() * (type === "dialogue" || type === "action" ? 60 : 6)) +
      1;
    out.push(
      makeElement(
        type,
        Array.from({ length: words }, (_, w) => `w${i}x${w}`).join(" "),
      ),
    );
  }
  return out;
}

/** Apply one random structural edit, immutably (like the store does). */
function randomEdit(
  rnd: () => number,
  elements: ScriptElement[],
): ScriptElement[] {
  const next = [...elements];
  const at = Math.floor(rnd() * next.length);
  const kind = rnd();
  if (kind < 0.4) {
    // text edit (typing)
    next[at] = {
      ...next[at],
      text: next[at].text + " typed" + Math.floor(rnd() * 100),
    };
  } else if (kind < 0.6) {
    // insert
    next.splice(
      at,
      0,
      makeElement(TYPES[Math.floor(rnd() * TYPES.length)], "inserted text"),
    );
  } else if (kind < 0.75) {
    // delete
    if (next.length > 1) next.splice(at, 1);
  } else if (kind < 0.9) {
    // retype element (Tab flows)
    next[at] = { ...next[at], type: TYPES[Math.floor(rnd() * TYPES.length)] };
  } else {
    // move a chunk (beat board reorder)
    const len = Math.min(next.length - at, 1 + Math.floor(rnd() * 5));
    const chunk = next.splice(at, len);
    next.splice(Math.floor(rnd() * (next.length + 1)), 0, ...chunk);
  }
  return next;
}

describe("paginateIncremental equivalence with paginate()", () => {
  it("matches the full paginator across 300 random edits (cache chained)", () => {
    const rnd = mulberry32(42);
    let elements = randomScript(rnd, 400);
    let cache: PaginationCache = { elements, pages: paginate(elements) };
    expect(paginateIncremental(elements, cache)).toEqual(cache.pages);

    for (let step = 0; step < 300; step++) {
      elements = randomEdit(rnd, elements);
      const incremental = paginateIncremental(elements, cache);
      const full = paginate(elements);
      expect(incremental).toEqual(full);
      cache = { elements, pages: incremental };
    }
  });

  it("matches when editing the very first and very last element", () => {
    const rnd = mulberry32(7);
    const elements = randomScript(rnd, 300);
    const cache: PaginationCache = { elements, pages: paginate(elements) };

    const first = [...elements];
    first[0] = { ...first[0], text: "INT. CHANGED - DAY" };
    expect(paginateIncremental(first, cache)).toEqual(paginate(first));

    const last = [...elements];
    last[last.length - 1] = { ...last[last.length - 1], text: "changed tail" };
    expect(paginateIncremental(last, cache)).toEqual(paginate(last));
  });

  it("reuses leading pages for a late edit", () => {
    const rnd = mulberry32(99);
    const elements = randomScript(rnd, 500);
    const pages = paginate(elements);
    expect(pages.length).toBeGreaterThan(10);
    const cache: PaginationCache = { elements, pages };
    const edited = [...elements];
    const at = edited.length - 3;
    edited[at] = { ...edited[at], text: "late edit" };
    const incremental = paginateIncremental(edited, cache);
    // Correct AND actually incremental: early pages are the same objects.
    expect(incremental).toEqual(paginate(edited));
    expect(incremental[0]).toBe(pages[0]);
    expect(incremental[1]).toBe(pages[1]);
  });

  it("handles no cache, empty cache, identical arrays", () => {
    const elements = [makeElement("scene_heading", "INT. A - DAY")];
    expect(paginateIncremental(elements, null)).toEqual(paginate(elements));
    const cache = { elements, pages: paginate(elements) };
    expect(paginateIncremental(elements, cache)).toBe(cache.pages);
  });
});
