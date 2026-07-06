import { describe, it, expect } from 'vitest'
import { encodeTimeline, decodeTimeline } from './timelineCodec'
import { makeElement } from '../stores/scriptStore'
import type { HistoryEntry, ScriptElement, TitlePage } from '../types'

const TP: TitlePage = { title: 'T', author: 'A', contact: '', draftDate: '' }

let n = 0
function entry(elements: ScriptElement[], label = 'snap'): HistoryEntry {
  return {
    id: `e${n++}`,
    at: 1000 + n,
    label,
    elements,
    titlePage: TP,
    pageCount: 1,
    words: elements.length,
  }
}

function baseElements(count: number): ScriptElement[] {
  const out: ScriptElement[] = []
  for (let i = 0; i < count; i++) out.push(makeElement('action', `Beat ${i}`))
  return out
}

describe('timeline codec round-trip', () => {
  it('round-trips a single entry', () => {
    const e = entry(baseElements(5))
    const decoded = decodeTimeline(encodeTimeline([e]))
    expect(decoded).toHaveLength(1)
    expect(decoded[0].elements).toEqual(e.elements)
    expect(decoded[0].label).toBe(e.label)
  })

  it('round-trips a sequence of local edits losslessly', () => {
    const base = baseElements(50)
    const entries: HistoryEntry[] = [entry(base)]
    let cur = base
    // Simulate 30 snapshots with local edits: text changes, inserts, deletes.
    for (let i = 0; i < 30; i++) {
      cur = [...cur]
      const at = (i * 7) % cur.length
      if (i % 3 === 0) cur[at] = { ...cur[at], text: cur[at].text + ' edited' }
      else if (i % 3 === 1) cur.splice(at, 0, makeElement('action', `inserted ${i}`))
      else cur.splice(at, 1)
      entries.push(entry(cur))
    }
    const decoded = decodeTimeline(encodeTimeline(entries))
    expect(decoded).toHaveLength(entries.length)
    for (let i = 0; i < entries.length; i++) {
      expect(decoded[i].elements).toEqual(entries[i].elements)
      expect(decoded[i].id).toBe(entries[i].id)
    }
  })

  it('deltas are much smaller than keyframes for local edits', () => {
    const base = baseElements(500)
    const changed = [...base]
    changed[250] = { ...changed[250], text: 'One line changed.' }
    const stored = encodeTimeline([entry(base), entry(changed)])
    expect(stored.entries[0].full).toBeDefined()
    expect(stored.entries[1].delta).toBeDefined()
    expect(stored.entries[1].delta!.middle).toHaveLength(1)
  })

  it('survives serialization (reference sharing lost) without bloating', () => {
    const base = baseElements(100)
    const changed = [...base]
    changed[10] = { ...changed[10], text: 'x' }
    const entries = [entry(base), entry(changed)]
    // Simulate a load-from-disk: deep clone breaks reference identity.
    const reloaded = decodeTimeline(
      JSON.parse(JSON.stringify(encodeTimeline(entries))),
    ) as HistoryEntry[]
    const reEncoded = encodeTimeline(reloaded)
    expect(reEncoded.entries[1].delta).toBeDefined()
    expect(reEncoded.entries[1].delta!.middle).toHaveLength(1)
  })
})

describe('timeline byte budget', () => {
  it('prunes oldest entries to fit the budget, keeping the newest', () => {
    const entries: HistoryEntry[] = []
    let cur = baseElements(200)
    entries.push(entry(cur, 'oldest'))
    for (let i = 0; i < 20; i++) {
      cur = [...cur]
      cur[i] = { ...cur[i], text: `changed ${i} ${'x'.repeat(100)}` }
      entries.push(entry(cur, `edit ${i}`))
    }
    const fullSize = JSON.stringify(encodeTimeline(entries)).length
    const budget = Math.floor(fullSize / 3)
    const stored = encodeTimeline(entries, budget)
    expect(stored.entries.length).toBeLessThan(entries.length)
    expect(stored.entries.length).toBeGreaterThan(0)
    // Newest entry always survives and content is intact.
    const decoded = decodeTimeline(stored)
    const newest = decoded[decoded.length - 1]
    expect(newest.label).toBe('edit 19')
    expect(newest.elements).toEqual(entries[entries.length - 1].elements)
    // Oldest surviving entry must decode (i.e. head was re-keyframed).
    expect(decoded).toHaveLength(stored.entries.length)
  })

  it('keeps at least the newest entry even under an impossible budget', () => {
    const entries = [entry(baseElements(100)), entry(baseElements(100))]
    const stored = encodeTimeline(entries, 10)
    expect(stored.entries).toHaveLength(1)
    const decoded = decodeTimeline(stored)
    expect(decoded).toHaveLength(1)
  })
})

describe('timeline corruption tolerance', () => {
  it('returns [] for null or malformed input', () => {
    expect(decodeTimeline(null)).toEqual([])
    expect(decodeTimeline({ v: 1, entries: 'nope' } as never)).toEqual([])
  })

  it('skips delta entries whose base is missing instead of fabricating content', () => {
    const a = baseElements(10)
    const b = [...a]
    b[3] = { ...b[3], text: 'changed' }
    const stored = encodeTimeline([entry(a), entry(b)])
    // Corrupt: drop the keyframe, leaving an orphan delta.
    const corrupt = { v: 1 as const, entries: stored.entries.slice(1) }
    expect(decodeTimeline(corrupt)).toEqual([])
  })
})
