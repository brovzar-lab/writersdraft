/**
 * Script document store: elements, title page, undo/redo, scenes, tags,
 * notes, production locking. Pure state — persistence lives in
 * src/firebase/sync.ts and localStorage autosave in App.
 */
import { create } from 'zustand'
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
} from '../types'
import { REVISION_COLOR_ORDER } from '../types'
import { normalizeText } from '../engine/stateMachine'
import { pageCount } from '../engine/pagination'
import { countWords } from '../engine/analysis'

const TIMELINE_LIMIT = 100

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function makeElement(type: ElementType, text = ''): ScriptElement {
  return { id: newId(), type, text }
}

export function emptyScript(): Script {
  return {
    id: newId(),
    titlePage: { title: 'UNTITLED', author: '', contact: '', draftDate: '' },
    elements: [makeElement('scene_heading')],
    locked: false,
    revisionColor: 'white',
    tags: [],
    notes: [],
    characters: [],
    sceneMeta: {},
    docs: [],
    updatedAt: 0,
  }
}

/** Fill in fields missing from scripts saved by older versions. */
export function migrateScript(s: Partial<Script>): Script {
  return { ...emptyScript(), ...s, docs: s.docs ?? [], sceneMeta: s.sceneMeta ?? {} }
}

interface Snapshot {
  elements: ScriptElement[]
  titlePage: TitlePage
}

const HISTORY_LIMIT = 200

export interface ScriptState {
  script: Script
  /** Undo/redo stacks of structural snapshots. */
  past: Snapshot[]
  future: Snapshot[]
  dirty: boolean

  loadScript: (s: Script) => void
  setTitlePage: (tp: Partial<TitlePage>) => void

  updateElementText: (id: string, text: string) => void
  setElementType: (id: string, type: ElementType) => void
  insertElementAfter: (afterId: string, type: ElementType, text?: string) => string
  splitElement: (id: string, caret: number, tailType: ElementType) => string
  mergeWithPrevious: (id: string) => { prevId: string; joinAt: number } | null
  removeElement: (id: string) => void
  moveScene: (fromHeadingId: string, toHeadingId: string) => void

  undo: () => void
  redo: () => void
  checkpoint: () => void

  // Scenes / beat board
  scenes: () => SceneInfo[]
  setSceneMeta: (headingId: string, meta: { color?: string; synopsis?: string }) => void

  // Tags & notes (creative tracking)
  addTag: (name: string, color: string) => ScriptTag
  removeTag: (tagId: string) => void
  toggleElementTag: (elementId: string, tagId: string) => void
  addNote: (elementId: string, author: string, text: string) => ScriptNote
  resolveNote: (noteId: string) => void

  // Alternate lines (version history lite)
  addAlternate: (elementId: string, text: string) => void
  setActiveAlternate: (elementId: string, index: number | undefined) => void

  // Characters (analytics support)
  setCharacterGender: (name: string, gender: CharacterProfile['gender']) => void

  // Story bible docs (treatment / outline / bios / research)
  addDoc: (kind: StoryDoc['kind'], title: string) => StoryDoc
  updateDoc: (id: string, patch: Partial<Pick<StoryDoc, 'title' | 'content' | 'kind'>>) => void
  removeDoc: (id: string) => void

  // Version timeline
  timeline: HistoryEntry[]
  recordSnapshot: (label: string) => HistoryEntry | null
  restoreSnapshot: (id: string) => void
  loadTimeline: (t: HistoryEntry[]) => void

  // Production workflow
  lockScript: () => void
  unlockScript: () => void
  bumpRevision: () => RevisionColor
  markDirty: () => void
  markSaved: () => void
}

function snapshot(s: Script): Snapshot {
  return { elements: s.elements, titlePage: s.titlePage }
}

export const useScriptStore = create<ScriptState>((set, get) => {
  /** Push current state onto the undo stack and apply a mutation. */
  const withHistory = (fn: (s: Script) => Partial<Script>) =>
    set((state) => {
      const past = [...state.past, snapshot(state.script)].slice(-HISTORY_LIMIT)
      return {
        past,
        future: [],
        dirty: true,
        script: { ...state.script, ...fn(state.script), updatedAt: Date.now() },
      }
    })

  /** Apply a mutation without a history entry (typing coalesces via checkpoint). */
  const withoutHistory = (fn: (s: Script) => Partial<Script>) =>
    set((state) => ({
      dirty: true,
      script: { ...state.script, ...fn(state.script), updatedAt: Date.now() },
    }))

  return {
    script: emptyScript(),
    past: [],
    future: [],
    dirty: false,

    loadScript: (s) => set({ script: s, past: [], future: [], dirty: false }),

    setTitlePage: (tp) =>
      withHistory((s) => ({ titlePage: { ...s.titlePage, ...tp } })),

    checkpoint: () =>
      set((state) => {
        const last = state.past[state.past.length - 1]
        if (last && last.elements === state.script.elements) return {}
        return {
          past: [...state.past, snapshot(state.script)].slice(-HISTORY_LIMIT),
          future: [],
        }
      }),

    updateElementText: (id, text) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) => (el.id === id ? { ...el, text } : el)),
      })),

    setElementType: (id, type) =>
      withHistory((s) => ({
        elements: s.elements.map((el) =>
          el.id === id ? { ...el, type, text: normalizeText(type, el.text) } : el,
        ),
      })),

    insertElementAfter: (afterId, type, text = '') => {
      const el = makeElement(type, text)
      withHistory((s) => {
        const i = s.elements.findIndex((e) => e.id === afterId)
        const elements = [...s.elements]
        elements.splice(i + 1, 0, el)
        return { elements }
      })
      return el.id
    },

    splitElement: (id, caret, tailType) => {
      const tail = makeElement(tailType)
      withHistory((s) => {
        const i = s.elements.findIndex((e) => e.id === id)
        if (i < 0) return {}
        const head = s.elements[i]
        tail.text = head.text.slice(caret)
        const elements = [...s.elements]
        elements[i] = { ...head, text: head.text.slice(0, caret) }
        elements.splice(i + 1, 0, tail)
        return { elements }
      })
      return tail.id
    },

    mergeWithPrevious: (id) => {
      const s = get().script
      const i = s.elements.findIndex((e) => e.id === id)
      if (i <= 0) return null
      const prev = s.elements[i - 1]
      const cur = s.elements[i]
      const joinAt = prev.text.length
      withHistory((sc) => {
        const elements = [...sc.elements]
        elements[i - 1] = { ...prev, text: prev.text + cur.text }
        elements.splice(i, 1)
        return { elements }
      })
      return { prevId: prev.id, joinAt }
    },

    removeElement: (id) =>
      withHistory((s) => {
        const elements = s.elements.filter((e) => e.id !== id)
        // A script always has at least one element.
        return { elements: elements.length ? elements : [makeElement('scene_heading')] }
      }),

    moveScene: (fromHeadingId, toHeadingId) => {
      if (fromHeadingId === toHeadingId) return
      withHistory((s) => {
        const bounds = (headingId: string): [number, number] | null => {
          const start = s.elements.findIndex((e) => e.id === headingId)
          if (start < 0 || s.elements[start].type !== 'scene_heading') return null
          let end = start + 1
          while (end < s.elements.length && s.elements[end].type !== 'scene_heading') end++
          return [start, end]
        }
        const from = bounds(fromHeadingId)
        const to = bounds(toHeadingId)
        if (!from || !to) return {}
        const elements = [...s.elements]
        const chunk = elements.splice(from[0], from[1] - from[0])
        // Recompute target index after removal.
        let target = elements.findIndex((e) => e.id === toHeadingId)
        if (target < 0) target = elements.length
        else if (from[0] < to[0]) {
          // Moving down: insert after the target scene.
          let end = target + 1
          while (end < elements.length && elements[end].type !== 'scene_heading') end++
          target = end
        }
        elements.splice(target, 0, ...chunk)
        return { elements }
      })
    },

    undo: () =>
      set((state) => {
        const prev = state.past[state.past.length - 1]
        if (!prev) return {}
        return {
          past: state.past.slice(0, -1),
          future: [snapshot(state.script), ...state.future],
          dirty: true,
          script: { ...state.script, ...prev },
        }
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0]
        if (!next) return {}
        return {
          future: state.future.slice(1),
          past: [...state.past, snapshot(state.script)],
          dirty: true,
          script: { ...state.script, ...next },
        }
      }),

    scenes: () => {
      const s = get().script
      const out: SceneInfo[] = []
      s.elements.forEach((el, index) => {
        if (el.type === 'scene_heading') {
          out.push({
            id: el.id,
            index,
            heading: el.text || '(empty scene heading)',
            sceneNumber: el.sceneNumber,
            color: s.sceneMeta[el.id]?.color,
            synopsis: s.sceneMeta[el.id]?.synopsis,
          })
        }
      })
      return out
    },

    setSceneMeta: (headingId, meta) =>
      withoutHistory((s) => ({
        sceneMeta: {
          ...s.sceneMeta,
          [headingId]: { ...s.sceneMeta[headingId], ...meta },
        },
      })),

    addTag: (name, color) => {
      const tag: ScriptTag = { id: newId(), name, color }
      withoutHistory((s) => ({ tags: [...s.tags, tag] }))
      return tag
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
          if (el.id !== elementId) return el
          const tags = el.tags ?? []
          return {
            ...el,
            tags: tags.includes(tagId) ? tags.filter((t) => t !== tagId) : [...tags, tagId],
          }
        }),
      })),

    addNote: (elementId, author, text) => {
      const note: ScriptNote = { id: newId(), elementId, author, text, createdAt: Date.now() }
      withoutHistory((s) => ({ notes: [...s.notes, note] }))
      return note
    },

    resolveNote: (noteId) =>
      withoutHistory((s) => ({
        notes: s.notes.map((n) => (n.id === noteId ? { ...n, resolved: true } : n)),
      })),

    addAlternate: (elementId, text) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) =>
          el.id === elementId ? { ...el, alternates: [...(el.alternates ?? []), text] } : el,
        ),
      })),

    setActiveAlternate: (elementId, index) =>
      withoutHistory((s) => ({
        elements: s.elements.map((el) => {
          if (el.id !== elementId) return el
          if (index === undefined) return { ...el, activeAlternate: undefined }
          const alts = el.alternates ?? []
          if (index < 0 || index >= alts.length) return el
          // Swap: current text becomes an alternate, chosen alternate becomes text.
          const newAlts = [...alts]
          const chosen = newAlts[index]
          newAlts[index] = el.text
          return { ...el, text: chosen, alternates: newAlts, activeAlternate: index }
        }),
      })),

    addDoc: (kind, title) => {
      const docItem: StoryDoc = { id: newId(), kind, title, content: '', updatedAt: Date.now() }
      withoutHistory((s) => ({ docs: [...s.docs, docItem] }))
      return docItem
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

    loadTimeline: (timeline) => set({ timeline: timeline.slice(-TIMELINE_LIMIT) }),

    recordSnapshot: (label) => {
      const s = get().script
      const last = get().timeline[get().timeline.length - 1]
      // Skip no-op snapshots: identical element content to the latest entry.
      if (last && JSON.stringify(last.elements) === JSON.stringify(s.elements)) return null
      const entry: HistoryEntry = {
        id: newId(),
        at: Date.now(),
        label,
        elements: s.elements,
        titlePage: s.titlePage,
        pageCount: pageCount(s.elements),
        words: s.elements.reduce((a, el) => a + countWords(el.text), 0),
      }
      set((state) => ({ timeline: [...state.timeline, entry].slice(-TIMELINE_LIMIT) }))
      return entry
    },

    restoreSnapshot: (id) => {
      const entry = get().timeline.find((e) => e.id === id)
      if (!entry) return
      withHistory(() => ({ elements: entry.elements, titlePage: entry.titlePage }))
    },

    setCharacterGender: (name, gender) =>
      withoutHistory((s) => {
        const key = name.toUpperCase()
        const existing = s.characters.find((c) => c.name === key)
        const characters = existing
          ? s.characters.map((c) => (c.name === key ? { ...c, gender } : c))
          : [...s.characters, { name: key, gender }]
        return { characters }
      }),

    lockScript: () =>
      withHistory((s) => {
        let n = 0
        const elements = s.elements.map((el) =>
          el.type === 'scene_heading'
            ? { ...el, sceneNumber: String(++n), locked: true }
            : { ...el, locked: true },
        )
        return { elements, locked: true }
      }),

    unlockScript: () =>
      withHistory((s) => ({
        locked: false,
        elements: s.elements.map((el) => ({ ...el, locked: false })),
      })),

    bumpRevision: () => {
      const s = get().script
      const i = REVISION_COLOR_ORDER.indexOf(s.revisionColor)
      const next = REVISION_COLOR_ORDER[(i + 1) % REVISION_COLOR_ORDER.length]
      withoutHistory(() => ({ revisionColor: next }))
      return next
    },

    markDirty: () => set({ dirty: true }),
    markSaved: () => set({ dirty: false }),
  }
})
