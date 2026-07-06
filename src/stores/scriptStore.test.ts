import { describe, it, expect, beforeEach } from 'vitest'
import { useScriptStore, emptyScript, makeElement } from './scriptStore'
import { useUiStore } from './uiStore'
import { characterStats, genderBreakdown } from '../engine/analysis'
import { exportFountain, importFountain } from '../engine/fountain'
import type { Script } from '../types'

const store = () => useScriptStore.getState()

function seedScript(): Script {
  const s = emptyScript()
  s.elements = [
    makeElement('scene_heading', 'INT. HOUSE - DAY'),
    makeElement('action', 'Sunlight fills the room.'),
    makeElement('character', 'SARAH'),
    makeElement('dialogue', 'What a beautiful morning.'),
    makeElement('scene_heading', 'EXT. STREET - NIGHT'),
    makeElement('action', 'Rain.'),
  ]
  return s
}

beforeEach(() => {
  useScriptStore.setState({ script: seedScript(), past: [], future: [], dirty: false })
})

describe('scriptStore element CRUD', () => {
  it('updates element text without recording history', () => {
    const id = store().script.elements[1].id
    store().updateElementText(id, 'New text')
    expect(store().script.elements[1].text).toBe('New text')
    expect(store().past).toHaveLength(0)
    expect(store().dirty).toBe(true)
  })

  it('changes element type and normalizes text', () => {
    const id = store().script.elements[1].id
    store().updateElementText(id, 'int. barn - day')
    store().setElementType(id, 'scene_heading')
    expect(store().script.elements[1].type).toBe('scene_heading')
    expect(store().script.elements[1].text).toBe('INT. BARN - DAY')
  })

  it('inserts a new element after a given one', () => {
    const afterId = store().script.elements[0].id
    const newId = store().insertElementAfter(afterId, 'action', 'Boom.')
    expect(store().script.elements[1].id).toBe(newId)
    expect(store().script.elements[1]).toMatchObject({ type: 'action', text: 'Boom.' })
    expect(store().script.elements).toHaveLength(7)
  })

  it('splits an element at the caret', () => {
    const el = store().script.elements[1] // 'Sunlight fills the room.'
    const tailId = store().splitElement(el.id, 8, 'action')
    expect(store().script.elements[1].text).toBe('Sunlight')
    expect(store().script.elements[2].id).toBe(tailId)
    expect(store().script.elements[2].text).toBe(' fills the room.')
  })

  it('merges an element into the previous one and reports the join point', () => {
    const el = store().script.elements[3] // dialogue
    const res = store().mergeWithPrevious(el.id)
    expect(res).not.toBeNull()
    expect(res!.prevId).toBe(store().script.elements[2].id)
    expect(res!.joinAt).toBe('SARAH'.length)
    expect(store().script.elements[2].text).toBe('SARAHWhat a beautiful morning.')
    expect(store().script.elements).toHaveLength(5)
  })

  it('cannot merge the first element', () => {
    expect(store().mergeWithPrevious(store().script.elements[0].id)).toBeNull()
  })

  it('removing the last element leaves a fresh scene heading', () => {
    for (const el of [...store().script.elements]) store().removeElement(el.id)
    expect(store().script.elements).toHaveLength(1)
    expect(store().script.elements[0].type).toBe('scene_heading')
  })
})

describe('undo/redo', () => {
  it('undoes and redoes structural changes', () => {
    const before = store().script.elements.length
    store().insertElementAfter(store().script.elements[0].id, 'action', 'X')
    expect(store().script.elements).toHaveLength(before + 1)
    store().undo()
    expect(store().script.elements).toHaveLength(before)
    store().redo()
    expect(store().script.elements).toHaveLength(before + 1)
  })

  it('checkpoint coalesces typing into one undo step', () => {
    const id = store().script.elements[1].id
    store().checkpoint()
    store().updateElementText(id, 'a')
    store().updateElementText(id, 'ab')
    store().updateElementText(id, 'abc')
    store().undo()
    expect(store().script.elements[1].text).toBe('Sunlight fills the room.')
  })

  it('new edits clear the redo stack', () => {
    store().insertElementAfter(store().script.elements[0].id, 'action', 'X')
    store().undo()
    store().insertElementAfter(store().script.elements[0].id, 'action', 'Y')
    store().redo() // should be a no-op
    expect(store().script.elements.filter((e) => e.text === 'X')).toHaveLength(0)
  })
})

describe('scenes and beat board', () => {
  it('extracts scene list with indices', () => {
    const scenes = store().scenes()
    expect(scenes).toHaveLength(2)
    expect(scenes[0].heading).toBe('INT. HOUSE - DAY')
    expect(scenes[1].index).toBe(4)
  })

  it('stores scene color and synopsis', () => {
    const scenes = store().scenes()
    store().setSceneMeta(scenes[0].id, { color: '#f87171', synopsis: 'Opening image' })
    const updated = store().scenes()
    expect(updated[0].color).toBe('#f87171')
    expect(updated[0].synopsis).toBe('Opening image')
  })

  it('reorders whole scenes via moveScene', () => {
    const scenes = store().scenes()
    store().moveScene(scenes[1].id, scenes[0].id)
    const after = store().scenes()
    expect(after[0].heading).toBe('EXT. STREET - NIGHT')
    expect(after[1].heading).toBe('INT. HOUSE - DAY')
    // Scene contents move with their heading.
    expect(store().script.elements[1].text).toBe('Rain.')
  })
})

describe('production workflow', () => {
  it('locking assigns scene numbers', () => {
    store().lockScript()
    const s = store().script
    expect(s.locked).toBe(true)
    const headings = s.elements.filter((e) => e.type === 'scene_heading')
    expect(headings.map((h) => h.sceneNumber)).toEqual(['1', '2'])
  })

  it('bumpRevision follows the industry color order', () => {
    expect(store().bumpRevision()).toBe('blue')
    expect(store().bumpRevision()).toBe('pink')
    expect(store().bumpRevision()).toBe('yellow')
  })
})

describe('tags, notes, alternates', () => {
  it('tags elements and filters by tag', () => {
    const tag = store().addTag('Subplot A', '#60a5fa')
    const el = store().script.elements[1]
    store().toggleElementTag(el.id, tag.id)
    expect(store().script.elements[1].tags).toContain(tag.id)
    store().toggleElementTag(el.id, tag.id)
    expect(store().script.elements[1].tags).not.toContain(tag.id)
  })

  it('removing a tag strips it from elements', () => {
    const tag = store().addTag('Theme', '#fbbf24')
    const el = store().script.elements[1]
    store().toggleElementTag(el.id, tag.id)
    store().removeTag(tag.id)
    expect(store().script.tags).toHaveLength(0)
    expect(store().script.elements[1].tags ?? []).not.toContain(tag.id)
  })

  it('adds and resolves notes', () => {
    const el = store().script.elements[3]
    const note = store().addNote(el.id, 'Billy', 'Punch this line up')
    expect(store().script.notes).toHaveLength(1)
    store().resolveNote(note.id)
    expect(store().script.notes[0].resolved).toBe(true)
  })

  it('swaps alternate dialogue lines', () => {
    const el = store().script.elements[3]
    store().addAlternate(el.id, 'Ugh, morning already?')
    store().setActiveAlternate(el.id, 0)
    expect(store().script.elements[3].text).toBe('Ugh, morning already?')
    expect(store().script.elements[3].alternates).toContain('What a beautiful morning.')
  })
})

describe('uiStore', () => {
  it('focus mode hides the sidebar', () => {
    useUiStore.setState({ focusMode: false, sidebarOpen: true })
    useUiStore.getState().toggleFocusMode()
    expect(useUiStore.getState().focusMode).toBe(true)
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })
  it('caret handoff request round-trips', () => {
    useUiStore.getState().requestCaret('el-1', 5)
    expect(useUiStore.getState().pendingCaret).toEqual({ elementId: 'el-1', offset: 5 })
    useUiStore.getState().clearPendingCaret()
    expect(useUiStore.getState().pendingCaret).toBeNull()
  })
})

describe('analysis engine', () => {
  it('counts speeches, words and scenes per character', () => {
    const s = store().script
    s.elements.push(
      makeElement('character', 'SARAH (V.O.)'),
      makeElement('dialogue', 'Three more words here.'),
      makeElement('character', 'JOHN'),
      makeElement('dialogue', 'Hi.'),
    )
    const stats = characterStats(s.elements, [{ name: 'SARAH', gender: 'female' }])
    const sarah = stats.find((x) => x.name === 'SARAH')!
    expect(sarah.speeches).toBe(2)
    expect(sarah.words).toBe(4 + 4)
    expect(sarah.scenes).toBe(2)
    expect(sarah.gender).toBe('female')
    const john = stats.find((x) => x.name === 'JOHN')!
    expect(john.speeches).toBe(1)
    expect(john.gender).toBe('unspecified')
  })

  it('aggregates by gender', () => {
    const bd = genderBreakdown([
      { name: 'A', gender: 'female', speeches: 3, words: 30, scenes: 2 },
      { name: 'B', gender: 'male', speeches: 1, words: 5, scenes: 1 },
      { name: 'C', gender: 'female', speeches: 2, words: 10, scenes: 1 },
    ])
    expect(bd.words.female).toBe(40)
    expect(bd.words.male).toBe(5)
    expect(bd.characters.female).toBe(2)
    expect(bd.speeches.female).toBe(5)
  })
})

describe('fountain round-trip', () => {
  it('exports and re-imports preserving structure', () => {
    const s = store().script
    s.titlePage.title = 'THE HEIST'
    s.titlePage.author = 'Billy Rovzar'
    const text = exportFountain(s)
    expect(text).toContain('Title: THE HEIST')
    expect(text).toContain('INT. HOUSE - DAY')
    const back = importFountain(text)
    expect(back.titlePage.title).toBe('THE HEIST')
    const types = back.elements.map((e) => e.type)
    expect(types).toEqual([
      'scene_heading', 'action', 'character', 'dialogue', 'scene_heading', 'action',
    ])
    expect(back.elements[3].text).toBe('What a beautiful morning.')
    // Every element is a distinct entity with its own id.
    const ids = new Set(back.elements.map((e) => e.id))
    expect(ids.size).toBe(back.elements.length)
  })

  it('imports forced scene headings and transitions', () => {
    const s = importFountain('Title: X\n\n.MONTAGE\n\nStuff happens.\n\n> SMASH CUT TO:\n')
    expect(s.elements[0]).toMatchObject({ type: 'scene_heading', text: 'MONTAGE' })
    expect(s.elements[1]).toMatchObject({ type: 'action' })
    expect(s.elements[2]).toMatchObject({ type: 'transition', text: 'SMASH CUT TO:' })
  })
})
