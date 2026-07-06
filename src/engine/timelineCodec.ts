/**
 * Persistence codec for the version timeline.
 *
 * In memory the timeline keeps full element arrays (cheap — snapshots share
 * unchanged element objects). Serialized naively, 100 snapshots of a
 * feature-length script are tens of megabytes, which is what killed the old
 * localStorage timeline. At rest each entry is therefore stored either as a
 * keyframe (full elements) or as a delta against the previous entry:
 * a common prefix/suffix length plus the replaced middle slice. Edits are
 * local, so deltas are tiny.
 *
 * The encoded timeline is pruned to a byte budget from the oldest end, and
 * the oldest surviving entry is always re-encoded as a keyframe.
 */
import type { HistoryEntry, ScriptElement, TitlePage } from "../types";

export const TIMELINE_BYTE_BUDGET = 8 * 1024 * 1024;
const KEYFRAME_EVERY = 10;

export interface StoredTimelineEntry {
  id: string;
  at: number;
  label: string;
  pageCount: number;
  words: number;
  titlePage: TitlePage;
  /** Keyframe: the complete element array. */
  full?: ScriptElement[];
  /** Delta against the previous entry's elements. */
  delta?: { prefix: number; suffix: number; middle: ScriptElement[] };
}

export interface StoredTimeline {
  v: 1;
  entries: StoredTimelineEntry[];
}

/** Field-level equality; entries loaded from disk lose reference sharing. */
function sameElement(a: ScriptElement, b: ScriptElement): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.text === b.text &&
    a.sceneNumber === b.sceneNumber &&
    a.locked === b.locked &&
    a.revisionColor === b.revisionColor &&
    sameStringArray(a.tags, b.tags) &&
    sameStringArray(a.alternates, b.alternates) &&
    a.activeAlternate === b.activeAlternate
  );
}

function sameStringArray(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function computeDelta(
  prev: ScriptElement[],
  cur: ScriptElement[],
): { prefix: number; suffix: number; middle: ScriptElement[] } {
  const max = Math.min(prev.length, cur.length);
  let prefix = 0;
  while (prefix < max && sameElement(prev[prefix], cur[prefix])) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    sameElement(prev[prev.length - 1 - suffix], cur[cur.length - 1 - suffix])
  ) {
    suffix++;
  }
  return { prefix, suffix, middle: cur.slice(prefix, cur.length - suffix) };
}

function applyDelta(
  prev: ScriptElement[],
  delta: { prefix: number; suffix: number; middle: ScriptElement[] },
): ScriptElement[] {
  return [
    ...prev.slice(0, delta.prefix),
    ...delta.middle,
    ...prev.slice(prev.length - delta.suffix),
  ];
}

function encodeEntry(
  entry: HistoryEntry,
  prevElements: ScriptElement[] | null,
  forceKeyframe: boolean,
): StoredTimelineEntry {
  const base: StoredTimelineEntry = {
    id: entry.id,
    at: entry.at,
    label: entry.label,
    pageCount: entry.pageCount,
    words: entry.words,
    titlePage: entry.titlePage,
  };
  if (forceKeyframe || !prevElements) {
    base.full = entry.elements;
    return base;
  }
  const delta = computeDelta(prevElements, entry.elements);
  // A delta bigger than the content itself gains nothing — keyframe instead.
  if (delta.middle.length >= entry.elements.length) {
    base.full = entry.elements;
  } else {
    base.delta = delta;
  }
  return base;
}

function entrySize(e: StoredTimelineEntry): number {
  // Approximate serialized bytes; exact enough to enforce a budget.
  return JSON.stringify(e).length;
}

/**
 * Encode the in-memory timeline for storage, pruning the oldest entries
 * until the whole encoded timeline fits within `budgetBytes`. The newest
 * entry always survives.
 */
export function encodeTimeline(
  entries: HistoryEntry[],
  budgetBytes: number = TIMELINE_BYTE_BUDGET,
): StoredTimeline {
  if (entries.length === 0) return { v: 1, entries: [] };

  const encodeAll = (list: HistoryEntry[]): StoredTimelineEntry[] =>
    list.map((entry, i) =>
      encodeEntry(
        entry,
        i === 0 ? null : list[i - 1].elements,
        i % KEYFRAME_EVERY === 0,
      ),
    );

  let list = entries;
  let encoded = encodeAll(list);
  let total = encoded.reduce((a, e) => a + entrySize(e), 0);

  while (total > budgetBytes && list.length > 1) {
    // Drop the oldest entry; the new head re-encodes as a keyframe.
    list = list.slice(1);
    encoded = encodeAll(list);
    total = encoded.reduce((a, e) => a + entrySize(e), 0);
  }

  return { v: 1, entries: encoded };
}

/** Reconstruct full HistoryEntry objects from an encoded timeline. */
export function decodeTimeline(stored: StoredTimeline | null): HistoryEntry[] {
  if (!stored || stored.v !== 1 || !Array.isArray(stored.entries)) return [];
  const out: HistoryEntry[] = [];
  let prev: ScriptElement[] | null = null;
  for (const e of stored.entries) {
    let elements: ScriptElement[];
    if (e.full) {
      elements = e.full;
    } else if (e.delta && prev) {
      elements = applyDelta(prev, e.delta);
    } else {
      // Corrupt chain (delta with no base): skip this entry and everything
      // chained to it, rather than reconstructing wrong content. Entries
      // already decoded remain valid restore points.
      prev = null;
      continue;
    }
    out.push({
      id: e.id,
      at: e.at,
      label: e.label,
      pageCount: e.pageCount,
      words: e.words,
      titlePage: e.titlePage,
      elements,
    });
    prev = elements;
  }
  return out;
}
