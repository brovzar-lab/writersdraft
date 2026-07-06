/**
 * Script document store: elements, title page, undo/redo, scenes, tags,
 * notes, production locking. Pure state — persistence lives in
 * src/firebase/sync.ts and localStorage autosave in App.
 */
import { create } from "zustand";
import type {
  CharacterProfile,
  ElementType,
  HistoryEntry,
  RevisionColor,
  SceneInfo,
  Script,
  ScriptElement,
  ScriptNote,
  ScriptTag,
  StoryDoc,
  TitlePage,
} from "../types";
import { ELEMENT_TYPES, REVISION_COLOR_ORDER } from "../types";
import { canonicalCharacterName, normalizeText } from "../engine/stateMachine";
import { pageCount } from "../engine/pagination";
import { countWords } from "../engine/analysis";

const TIMELINE_LIMIT = 100;

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeElement(type: ElementType, text = ""): ScriptElement {
  return { id: newId(), type, text };
}

export function emptyScript(): Script {
  return {
    id: newId(),
    titlePage: { title: "UNTITLED", author: "", contact: "", draftDate: "" },
    elements: [makeElement("scene_heading")],
    locked: false,
    revisionColor: "white",
    tags: [],
    notes: [],
    characters: [],
    sceneMeta: {},
    docs: [],
    updatedAt: 0,
  };
}

const VALID_TYPES = new Set<string>(ELEMENT_TYPES);
const VALID_REVISIONS = new Set<string>(REVISION_COLOR_ORDER);
const VALID_GENDERS = new Set(["female", "male", "nonbinary", "unspecified"]);
const VALID_DOC_KINDS = new Set(["treatment", "outline", "bio", "research"]);

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
const num = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : undefined;

function sanitizeElement(v: unknown): ScriptElement | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  const el: ScriptElement = {
    id: str(e.id) || newId(),
    type: VALID_TYPES.has(str(e.type)) ? (e.type as ElementType) : "action",
    text: str(e.text),
  };
  if (typeof e.sceneNumber === "string") el.sceneNumber = e.sceneNumber;
  if (typeof e.locked === "boolean") el.locked = e.locked;
  if (typeof e.revisionColor === "string") el.revisionColor = e.revisionColor;
  const tags = strArray(e.tags);
  if (tags) el.tags = tags;
  const alternates = strArray(e.alternates);
  if (alternates) el.alternates = alternates;
  if (typeof e.activeAlternate === "number")
    el.activeAlternate = e.activeAlternate;
  if (e.dual === "left" || e.dual === "right") el.dual = e.dual;
  return el;
}

/**
 * Validate and repair a script of unknown provenance (localStorage,
 * IndexedDB, Firestore, older app versions) so no malformed shape ever
 * reaches the store or the render tree. Never throws; always returns a
 * structurally valid Script.
 */
export function migrateScript(input: Partial<Script> | unknown): Script {
  const base = emptyScript();
  if (!input || typeof input !== "object") return base;
  const s = input as Record<string, unknown>;

  const elements = Array.isArray(s.elements)
    ? s.elements
        .map(sanitizeElement)
        .filter((e): e is ScriptElement => e !== null)
    : [];

  const tp = (s.titlePage ?? {}) as Record<string, unknown>;
  const tagsIn = Array.isArray(s.tags) ? s.tags : [];
  const notesIn = Array.isArray(s.notes) ? s.notes : [];
  const charsIn = Array.isArray(s.characters) ? s.characters : [];
  const docsIn = Array.isArray(s.docs) ? s.docs : [];

  const sceneMeta: Script["sceneMeta"] = {};
  if (s.sceneMeta && typeof s.sceneMeta === "object") {
    for (const [k, v] of Object.entries(
      s.sceneMeta as Record<string, unknown>,
    )) {
      if (v && typeof v === "object") {
        const m = v as Record<string, unknown>;
        sceneMeta[k] = {
          ...(typeof m.color === "string" ? { color: m.color } : {}),
          ...(typeof m.synopsis === "string" ? { synopsis: m.synopsis } : {}),
        };
      }
    }
  }

  return {
    id: str(s.id) || base.id,
    titlePage: {
      title: str(tp.title, base.titlePage.title),
      author: str(tp.author),
      contact: str(tp.contact),
      draftDate: str(tp.draftDate),
    },
    elements: elements.length ? elements : base.elements,
    locked: s.locked === true,
    revisionColor: VALID_REVISIONS.has(str(s.revisionColor))
      ? (s.revisionColor as RevisionColor)
      : "white",
    tags: tagsIn
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .filter((t) => typeof t.id === "string" && typeof t.name === "string")
      .map((t) => ({
        id: t.id as string,
        name: t.name as string,
        color: str(t.color, "#cbd5e1"),
      })),
    notes: notesIn
      .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
      .filter(
        (n) => typeof n.id === "string" && typeof n.elementId === "string",
      )
      .map((n) => ({
        id: n.id as string,
        elementId: n.elementId as string,
        author: str(n.author),
        text: str(n.text),
        createdAt: num(n.createdAt),
        ...(n.resolved === true ? { resolved: true } : {}),
      })),
    characters: charsIn
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .filter((c) => typeof c.name === "string")
      .map((c) => ({
        name: c.name as string,
        gender: VALID_GENDERS.has(str(c.gender))
          ? (c.gender as CharacterProfile["gender"])
          : "unspecified",
      })),
    sceneMeta,
    docs: docsIn
      .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
      .filter((d) => typeof d.id === "string")
      .map((d) => ({
        id: d.id as string,
        title: str(d.title, "Untitled"),
        kind: VALID_DOC_KINDS.has(str(d.kind))
          ? (d.kind as StoryDoc["kind"])
          : "research",
        content: str(d.content),
        updatedAt: num(d.updatedAt),
      })),
    updatedAt: num(s.updatedAt),
  };
}

interface Snapshot {
  elements: ScriptElement[];
  titlePage: TitlePage;
}

const HISTORY_LIMIT = 200;

/** Outcome of offering a remote snapshot to the store. */
export type RemoteReceiveResult = "applied" | "conflict" | "ignored";

export interface ScriptState {
  script: Script;
  /** Undo/redo stacks of structural snapshots. */
  past: Snapshot[];
  future: Snapshot[];
  dirty: boolean;
  /** A newer remote version that arrived while local edits were unsaved. */
  pendingRemote: Script | null;
  /**
   * updatedAt of the last version this session loaded from or wrote to the
   * cloud. Remote snapshots are judged against THIS, not the local typing
   * timestamp — during concurrent editing the local clock always outruns
   * the remote save, and comparing against it would silently discard the
   * collaborator's version.
   */
  lastSyncedAt: number;

  loadScript: (s: Script) => void;
  /**
   * Offer a remote snapshot. Applied only when it is new AND the local
   * store is clean; applying preserves the undo stack (the pre-remote state
   * is pushed onto it). A new remote over a dirty store parks in
   * pendingRemote for the user to resolve — remote data never silently
   * overwrites unsaved work.
   */
  receiveRemote: (remote: Script) => RemoteReceiveResult;
  resolveConflict: (choice: "keep-local" | "take-remote") => void;
  /** Record a successful cloud write of the version stamped `at`. */
  markSynced: (at: number) => void;
  setTitlePage: (tp: Partial<TitlePage>) => void;

  updateElementText: (id: string, text: string) => void;
  setElementType: (id: string, type: ElementType) => void;
  insertElementAfter: (
    afterId: string,
    type: ElementType,
    text?: string,
  ) => string;
  splitElement: (id: string, caret: number, tailType: ElementType) => string;
  mergeWithPrevious: (id: string) => { prevId: string; joinAt: number } | null;
  removeElement: (id: string) => void;
  moveScene: (fromHeadingId: string, toHeadingId: string) => void;

  // Clipboard & cross-block editing (input fidelity). Each mutation is ONE
  // history entry, so one Ctrl+Z reverses a whole paste or range delete.
  /**
   * Insert typed elements at a caret position: the target element splits at
   * `caret`, `parts` land between the halves (empty halves are dropped).
   * `replaceTo` extends the split into a replacement: target text between
   * caret and replaceTo is consumed. Returns where the caret belongs after.
   */
  pasteElements: (
    targetId: string,
    caret: number,
    parts: ScriptElement[],
    replaceTo?: number,
  ) => { focusId: string; offset: number } | null;
  /**
   * Delete everything between two carets, possibly in different elements:
   * the start element keeps its head plus the end element's tail; elements
   * in between are removed. Start/end order is normalised.
   */
  deleteRange: (
    startId: string,
    startOffset: number,
    endId: string,
    endOffset: number,
  ) => { focusId: string; offset: number } | null;
  /** Non-mutating: the elements covered by a range, texts sliced to it. */
  extractRange: (
    startId: string,
    startOffset: number,
    endId: string,
    endOffset: number,
  ) => ScriptElement[];

  undo: () => void;
  redo: () => void;
  checkpoint: () => void;

  // Scenes / beat board
  scenes: () => SceneInfo[];
  setSceneMeta: (
    headingId: string,
    meta: { color?: string; synopsis?: string },
  ) => void;

  // Tags & notes (creative tracking)
  addTag: (name: string, color: string) => ScriptTag;
  removeTag: (tagId: string) => void;
  toggleElementTag: (elementId: string, tagId: string) => void;
  addNote: (elementId: string, author: string, text: string) => ScriptNote;
  resolveNote: (noteId: string) => void;

  // Alternate lines (version history lite)
  addAlternate: (elementId: string, text: string) => void;
  setActiveAlternate: (elementId: string, index: number | undefined) => void;

  // Characters (analytics support)
  setCharacterGender: (
    name: string,
    gender: CharacterProfile["gender"],
  ) => void;

  // Story bible docs (treatment / outline / bios / research)
  addDoc: (kind: StoryDoc["kind"], title: string) => StoryDoc;
  updateDoc: (
    id: string,
    patch: Partial<Pick<StoryDoc, "title" | "content" | "kind">>,
  ) => void;
  removeDoc: (id: string) => void;

  // Version timeline
  timeline: HistoryEntry[];
  recordSnapshot: (label: string) => HistoryEntry | null;
  restoreSnapshot: (id: string) => void;
  loadTimeline: (t: HistoryEntry[]) => void;

  // Production workflow
  lockScript: () => void;
  unlockScript: () => void;
  bumpRevision: () => RevisionColor;
  /**
   * Rename every character cue whose canonical name matches `from` to `to`
   * (extensions like "(V.O.)" preserved). One history entry. Returns the
   * number of cues rewritten.
   */
  renameCharacter: (from: string, to: string) => number;
  markDirty: () => void;
  markSaved: () => void;
}

function snapshot(s: Script): Snapshot {
  return { elements: s.elements, titlePage: s.titlePage };
}

export const useScriptStore = create<ScriptState>((set, get) => {
  /** Push current state onto the undo stack and apply a mutation. */
  const withHistory = (fn: (s: Script) => Partial<Script>) =>
    set((state) => {
      const past = [...state.past, snapshot(state.script)].slice(
        -HISTORY_LIMIT,
      );
      return {
        past,
        future: [],
        dirty: true,
        script: { ...state.script, ...fn(state.script), updatedAt: Date.now() },
      };
    });

  /** Apply a mutation without a history entry (typing coalesces via checkpoint). */
  const withoutHistory = (fn: (s: Script) => Partial<Script>) =>
    set((state) => ({
      dirty: true,
      script: { ...state.script, ...fn(state.script), updatedAt: Date.now() },
    }));

  return {
    script: emptyScript(),
    past: [],
    future: [],
    dirty: false,
    pendingRemote: null,
    lastSyncedAt: 0,

    loadScript: (s) =>
      set({
        script: s,
        past: [],
        future: [],
        dirty: false,
        pendingRemote: null,
        lastSyncedAt: s.updatedAt,
      }),

    receiveRemote: (remote) => {
      const state = get();
      if (remote.id !== state.script.id) return "ignored";
      // Echoes of our own saves and stale snapshots carry a timestamp we
      // have already synced — drop them.
      if (remote.updatedAt <= state.lastSyncedAt) return "ignored";
      if (state.dirty) {
        set({ pendingRemote: remote });
        return "conflict";
      }
      set({
        pendingRemote: null,
        past: [...state.past, snapshot(state.script)].slice(-HISTORY_LIMIT),
        future: [],
        dirty: false,
        script: remote,
        lastSyncedAt: remote.updatedAt,
      });
      return "applied";
    },

    markSynced: (at) =>
      set((state) => ({ lastSyncedAt: Math.max(state.lastSyncedAt, at) })),

    resolveConflict: (choice) =>
      set((state) => {
        const remote = state.pendingRemote;
        if (!remote) return {};
        if (choice === "keep-local") {
          // The kept version must outrank the rejected remote even when the
          // remote writer's clock runs fast, or the conflict re-triggers.
          return {
            pendingRemote: null,
            dirty: true,
            script: {
              ...state.script,
              updatedAt: Math.max(Date.now(), remote.updatedAt + 1),
            },
          };
        }
        // take-remote: the local version stays reachable via undo.
        return {
          pendingRemote: null,
          past: [...state.past, snapshot(state.script)].slice(-HISTORY_LIMIT),
          future: [],
          dirty: false,
          script: remote,
          lastSyncedAt: Math.max(state.lastSyncedAt, remote.updatedAt),
        };
      }),

    setTitlePage: (tp) =>
      withHistory((s) => ({ titlePage: { ...s.titlePage, ...tp } })),

    checkpoint: () =>
      set((state) => {
        const last = state.past[state.past.length - 1];
        if (last && last.elements === state.script.elements) return {};
        return {
          past: [...state.past, snapshot(state.script)].slice(-HISTORY_LIMIT),
          future: [],
        };
      }),

    updateElementText: (id, text) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) => (el.id === id ? { ...el, text } : el)),
      })),

    setElementType: (id, type) =>
      withHistory((s) => ({
        elements: s.elements.map((el) =>
          el.id === id
            ? { ...el, type, text: normalizeText(type, el.text) }
            : el,
        ),
      })),

    insertElementAfter: (afterId, type, text = "") => {
      const el = makeElement(type, text);
      withHistory((s) => {
        const i = s.elements.findIndex((e) => e.id === afterId);
        const elements = [...s.elements];
        elements.splice(i + 1, 0, el);
        return { elements };
      });
      return el.id;
    },

    splitElement: (id, caret, tailType) => {
      const tail = makeElement(tailType);
      withHistory((s) => {
        const i = s.elements.findIndex((e) => e.id === id);
        if (i < 0) return {};
        const head = s.elements[i];
        tail.text = head.text.slice(caret);
        const elements = [...s.elements];
        elements[i] = { ...head, text: head.text.slice(0, caret) };
        elements.splice(i + 1, 0, tail);
        return { elements };
      });
      return tail.id;
    },

    mergeWithPrevious: (id) => {
      const s = get().script;
      const i = s.elements.findIndex((e) => e.id === id);
      if (i <= 0) return null;
      const prev = s.elements[i - 1];
      const cur = s.elements[i];
      const joinAt = prev.text.length;
      withHistory((sc) => {
        const elements = [...sc.elements];
        elements[i - 1] = { ...prev, text: prev.text + cur.text };
        elements.splice(i, 1);
        return { elements };
      });
      return { prevId: prev.id, joinAt };
    },

    removeElement: (id) =>
      withHistory((s) => {
        const elements = s.elements.filter((e) => e.id !== id);
        // A script always has at least one element.
        return {
          elements: elements.length ? elements : [makeElement("scene_heading")],
        };
      }),

    pasteElements: (targetId, caret, parts, replaceTo) => {
      if (parts.length === 0) return null;
      const s = get().script;
      const i = s.elements.findIndex((e) => e.id === targetId);
      if (i < 0) return null;
      const target = s.elements[i];
      const head = target.text.slice(0, caret);
      const tail = target.text.slice(Math.max(replaceTo ?? caret, caret));
      const insert: ScriptElement[] = [];
      if (head !== "") insert.push({ ...target, text: head });
      insert.push(...parts);
      if (tail !== "")
        insert.push({ ...makeElement(target.type, tail), tags: target.tags });
      withHistory((sc) => {
        const elements = [...sc.elements];
        elements.splice(i, 1, ...insert);
        return { elements };
      });
      const last = parts[parts.length - 1];
      return { focusId: last.id, offset: last.text.length };
    },

    deleteRange: (startId, startOffset, endId, endOffset) => {
      const s = get().script;
      let si = s.elements.findIndex((e) => e.id === startId);
      let ei = s.elements.findIndex((e) => e.id === endId);
      if (si < 0 || ei < 0) return null;
      let so = startOffset;
      let eo = endOffset;
      if (si > ei || (si === ei && so > eo)) {
        [si, ei] = [ei, si];
        [so, eo] = [eo, so];
      }
      const start = s.elements[si];
      const end = s.elements[ei];
      // When the range begins at the very start of the start element, that
      // element is consumed whole — the survivor is the end element's tail
      // and keeps the END element's type/identity (a cut cue must not leave
      // a character-typed shell holding leftover dialogue).
      const merged =
        si === ei
          ? { ...start, text: start.text.slice(0, so) + start.text.slice(eo) }
          : so === 0
            ? { ...end, text: end.text.slice(eo) }
            : { ...start, text: start.text.slice(0, so) + end.text.slice(eo) };
      withHistory((sc) => {
        const elements = [...sc.elements];
        elements.splice(si, ei - si + 1, merged);
        return {
          elements: elements.length ? elements : [makeElement("scene_heading")],
        };
      });
      return { focusId: merged.id, offset: so };
    },

    extractRange: (startId, startOffset, endId, endOffset) => {
      const s = get().script;
      let si = s.elements.findIndex((e) => e.id === startId);
      let ei = s.elements.findIndex((e) => e.id === endId);
      if (si < 0 || ei < 0) return [];
      let so = startOffset;
      let eo = endOffset;
      if (si > ei || (si === ei && so > eo)) {
        [si, ei] = [ei, si];
        [so, eo] = [eo, so];
      }
      if (si === ei) {
        return [{ ...s.elements[si], text: s.elements[si].text.slice(so, eo) }];
      }
      const out: ScriptElement[] = [
        { ...s.elements[si], text: s.elements[si].text.slice(so) },
      ];
      for (let k = si + 1; k < ei; k++) out.push({ ...s.elements[k] });
      out.push({ ...s.elements[ei], text: s.elements[ei].text.slice(0, eo) });
      return out;
    },

    moveScene: (fromHeadingId, toHeadingId) => {
      if (fromHeadingId === toHeadingId) return;
      withHistory((s) => {
        const bounds = (headingId: string): [number, number] | null => {
          const start = s.elements.findIndex((e) => e.id === headingId);
          if (start < 0 || s.elements[start].type !== "scene_heading")
            return null;
          let end = start + 1;
          while (
            end < s.elements.length &&
            s.elements[end].type !== "scene_heading"
          )
            end++;
          return [start, end];
        };
        const from = bounds(fromHeadingId);
        const to = bounds(toHeadingId);
        if (!from || !to) return {};
        const elements = [...s.elements];
        const chunk = elements.splice(from[0], from[1] - from[0]);
        // Recompute target index after removal.
        let target = elements.findIndex((e) => e.id === toHeadingId);
        if (target < 0) target = elements.length;
        else if (from[0] < to[0]) {
          // Moving down: insert after the target scene.
          let end = target + 1;
          while (
            end < elements.length &&
            elements[end].type !== "scene_heading"
          )
            end++;
          target = end;
        }
        elements.splice(target, 0, ...chunk);
        return { elements };
      });
    },

    undo: () =>
      set((state) => {
        const prev = state.past[state.past.length - 1];
        if (!prev) return {};
        return {
          past: state.past.slice(0, -1),
          future: [snapshot(state.script), ...state.future],
          dirty: true,
          script: { ...state.script, ...prev },
        };
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0];
        if (!next) return {};
        return {
          future: state.future.slice(1),
          past: [...state.past, snapshot(state.script)],
          dirty: true,
          script: { ...state.script, ...next },
        };
      }),

    scenes: () => {
      const s = get().script;
      const out: SceneInfo[] = [];
      s.elements.forEach((el, index) => {
        if (el.type === "scene_heading") {
          out.push({
            id: el.id,
            index,
            heading: el.text || "(empty scene heading)",
            sceneNumber: el.sceneNumber,
            color: s.sceneMeta[el.id]?.color,
            synopsis: s.sceneMeta[el.id]?.synopsis,
          });
        }
      });
      return out;
    },

    setSceneMeta: (headingId, meta) =>
      withoutHistory((s) => ({
        sceneMeta: {
          ...s.sceneMeta,
          [headingId]: { ...s.sceneMeta[headingId], ...meta },
        },
      })),

    addTag: (name, color) => {
      const tag: ScriptTag = { id: newId(), name, color };
      withoutHistory((s) => ({ tags: [...s.tags, tag] }));
      return tag;
    },

    removeTag: (tagId) =>
      withoutHistory((s) => ({
        tags: s.tags.filter((t) => t.id !== tagId),
        elements: s.elements.map((el) =>
          el.tags?.includes(tagId)
            ? { ...el, tags: el.tags.filter((t) => t !== tagId) }
            : el,
        ),
      })),

    toggleElementTag: (elementId, tagId) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) => {
          if (el.id !== elementId) return el;
          const tags = el.tags ?? [];
          return {
            ...el,
            tags: tags.includes(tagId)
              ? tags.filter((t) => t !== tagId)
              : [...tags, tagId],
          };
        }),
      })),

    addNote: (elementId, author, text) => {
      const note: ScriptNote = {
        id: newId(),
        elementId,
        author,
        text,
        createdAt: Date.now(),
      };
      withoutHistory((s) => ({ notes: [...s.notes, note] }));
      return note;
    },

    resolveNote: (noteId) =>
      withoutHistory((s) => ({
        notes: s.notes.map((n) =>
          n.id === noteId ? { ...n, resolved: true } : n,
        ),
      })),

    addAlternate: (elementId, text) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) =>
          el.id === elementId
            ? { ...el, alternates: [...(el.alternates ?? []), text] }
            : el,
        ),
      })),

    setActiveAlternate: (elementId, index) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) => {
          if (el.id !== elementId) return el;
          if (index === undefined) return { ...el, activeAlternate: undefined };
          const alts = el.alternates ?? [];
          if (index < 0 || index >= alts.length) return el;
          // Swap: current text becomes an alternate, chosen alternate becomes text.
          const newAlts = [...alts];
          const chosen = newAlts[index];
          newAlts[index] = el.text;
          return {
            ...el,
            text: chosen,
            alternates: newAlts,
            activeAlternate: index,
          };
        }),
      })),

    addDoc: (kind, title) => {
      const docItem: StoryDoc = {
        id: newId(),
        kind,
        title,
        content: "",
        updatedAt: Date.now(),
      };
      withoutHistory((s) => ({ docs: [...s.docs, docItem] }));
      return docItem;
    },

    updateDoc: (id, patch) =>
      withoutHistory((s) => ({
        docs: s.docs.map((d) =>
          d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
        ),
      })),

    removeDoc: (id) =>
      withoutHistory((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),

    timeline: [],

    loadTimeline: (timeline) =>
      set({ timeline: timeline.slice(-TIMELINE_LIMIT) }),

    recordSnapshot: (label) => {
      const s = get().script;
      const last = get().timeline[get().timeline.length - 1];
      // Skip no-op snapshots: identical element content to the latest entry.
      if (last && JSON.stringify(last.elements) === JSON.stringify(s.elements))
        return null;
      const entry: HistoryEntry = {
        id: newId(),
        at: Date.now(),
        label,
        elements: s.elements,
        titlePage: s.titlePage,
        pageCount: pageCount(s.elements),
        words: s.elements.reduce((a, el) => a + countWords(el.text), 0),
      };
      set((state) => ({
        timeline: [...state.timeline, entry].slice(-TIMELINE_LIMIT),
      }));
      return entry;
    },

    restoreSnapshot: (id) => {
      const entry = get().timeline.find((e) => e.id === id);
      if (!entry) return;
      withHistory(() => ({
        elements: entry.elements,
        titlePage: entry.titlePage,
      }));
    },

    setCharacterGender: (name, gender) =>
      withoutHistory((s) => {
        const key = name.toUpperCase();
        const existing = s.characters.find((c) => c.name === key);
        const characters = existing
          ? s.characters.map((c) => (c.name === key ? { ...c, gender } : c))
          : [...s.characters, { name: key, gender }];
        return { characters };
      }),

    lockScript: () =>
      withHistory((s) => {
        let n = 0;
        const elements = s.elements.map((el) =>
          el.type === "scene_heading"
            ? { ...el, sceneNumber: String(++n), locked: true }
            : { ...el, locked: true },
        );
        return { elements, locked: true };
      }),

    unlockScript: () =>
      withHistory((s) => ({
        locked: false,
        elements: s.elements.map((el) => ({ ...el, locked: false })),
      })),

    bumpRevision: () => {
      const s = get().script;
      const i = REVISION_COLOR_ORDER.indexOf(s.revisionColor);
      const next = REVISION_COLOR_ORDER[(i + 1) % REVISION_COLOR_ORDER.length];
      withoutHistory(() => ({ revisionColor: next }));
      return next;
    },

    renameCharacter: (from, to) => {
      const FROM = canonicalCharacterName(from);
      const TO = canonicalCharacterName(to);
      if (!FROM || !TO || FROM === TO) return 0;
      const match = (el: ScriptElement) =>
        el.type === "character" && canonicalCharacterName(el.text) === FROM;
      const count = get().script.elements.filter(match).length;
      if (count === 0) return 0;
      withHistory((s) => ({
        elements: s.elements.map((el) => {
          if (!match(el)) return el;
          const ext = el.text.match(/\([^)]*\)\s*$/)?.[0] ?? "";
          return { ...el, text: ext ? `${TO} ${ext}` : TO };
        }),
      }));
      return count;
    },

    markDirty: () => set({ dirty: true }),
    markSaved: () => set({ dirty: false }),
  };
});
