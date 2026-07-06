import { describe, it, expect, beforeEach } from 'vitest'
import { useScriptStore, emptyScript, makeElement, migrateScript } from './scriptStore'
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
  useScriptStore.setState({
    script: seedScript(),
    past: [],
    future: [],
    dirty: false,
    timeline: [],
    pendingRemote: null,
    lastSyncedAt: 0,
  })
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

describe('remote snapshots (data-loss regression)', () => {
  function remoteVersion(label: string): Script {
    const s = useScriptStore.getState().script
    return {
      ...s,
      elements: s.elements.map((el, i) =>
        i === 1 ? { ...el, text: label } : { ...el },
      ),
      updatedAt: s.updatedAt + 1000,
    }
  }

  it('applies a newer remote when local is clean, preserving the undo stack', () => {
    store().insertElementAfter(store().script.elements[0].id, 'action', 'Local edit')
    store().markSaved()
    const pastBefore = store().past.length
    const remote = remoteVersion('Remote text')
    expect(store().receiveRemote(remote)).toBe('applied')
    expect(store().script.elements[1].text).toBe('Remote text')
    // Undo history survives and the pre-remote state is one undo away.
    expect(store().past.length).toBe(pastBefore + 1)
    store().undo()
    expect(store().script.elements[1].text).toBe('Local edit')
  })

  it('NEVER overwrites a dirty local store; parks the remote as a conflict', () => {
    const id = store().script.elements[1].id
    store().checkpoint()
    store().updateElementText(id, 'Unsaved local typing')
    const remote = remoteVersion('Remote text')
    expect(store().receiveRemote(remote)).toBe('conflict')
    // Local content untouched, remote parked.
    expect(store().script.elements[1].text).toBe('Unsaved local typing')
    expect(store().pendingRemote).not.toBeNull()
    expect(store().dirty).toBe(true)
  })

  it('ignores already-synced snapshots (own echoes) and other scripts', () => {
    useScriptStore.setState({ lastSyncedAt: 5000 })
    const echo = { ...store().script, updatedAt: 5000 }
    expect(store().receiveRemote(echo)).toBe('ignored')
    const stale = { ...store().script, updatedAt: 4000 }
    expect(store().receiveRemote(stale)).toBe('ignored')
    const other = { ...remoteVersion('x'), id: 'different-script' }
    expect(store().receiveRemote(other)).toBe('ignored')
  })

  it('flags a conflict even when local typing outruns the remote clock', () => {
    // Concurrent editing: our keystrokes stamp updatedAt with Date.now(),
    // which is AFTER the collaborator's save. The remote must still park as
    // a conflict — comparing against the local timestamp would silently
    // discard (and then overwrite) the collaborator's version.
    useScriptStore.setState({ lastSyncedAt: 1000 })
    const remote = { ...store().script, updatedAt: 2000 } // newer than synced
    remote.elements = remote.elements.map((el, i) =>
      i === 1 ? { ...el, text: 'Collaborator edit' } : el,
    )
    const id = store().script.elements[1].id
    store().updateElementText(id, 'My in-flight typing') // stamps Date.now() >> 2000
    expect(store().script.updatedAt).toBeGreaterThan(remote.updatedAt)
    expect(store().receiveRemote(remote)).toBe('conflict')
    expect(store().pendingRemote).not.toBeNull()
    expect(store().script.elements[1].text).toBe('My in-flight typing')
  })

  it('does not mistake own echo for a conflict while typing', () => {
    // After our save syncs at t=5000, the server echo of that save must not
    // raise a banner just because we kept typing.
    useScriptStore.setState({ lastSyncedAt: 5000 })
    const id = store().script.elements[1].id
    store().updateElementText(id, 'still typing')
    const echo = { ...store().script, updatedAt: 5000 }
    expect(store().receiveRemote(echo)).toBe('ignored')
    expect(store().pendingRemote).toBeNull()
  })

  it('resolveConflict(keep-local) discards the remote and supersedes its timestamp', () => {
    const id = store().script.elements[1].id
    store().updateElementText(id, 'Mine')
    const remote = remoteVersion('Theirs')
    store().receiveRemote(remote)
    store().resolveConflict('keep-local')
    expect(store().pendingRemote).toBeNull()
    expect(store().script.elements[1].text).toBe('Mine')
    expect(store().dirty).toBe(true)
    expect(store().script.updatedAt).toBeGreaterThan(remote.updatedAt)
  })

  it('resolveConflict(take-remote) applies the remote with local one undo away', () => {
    const id = store().script.elements[1].id
    store().updateElementText(id, 'Mine')
    const remote = remoteVersion('Theirs')
    store().receiveRemote(remote)
    store().resolveConflict('take-remote')
    expect(store().pendingRemote).toBeNull()
    expect(store().script.elements[1].text).toBe('Theirs')
    store().undo()
    expect(store().script.elements[1].text).toBe('Mine')
  })
})

describe('migrateScript validation', () => {
  it('returns a valid empty script for garbage input', () => {
    for (const garbage of [null, undefined, 42, 'text', [], { elements: 'nope' }]) {
      const s = migrateScript(garbage as never)
      expect(Array.isArray(s.elements)).toBe(true)
      expect(s.elements.length).toBeGreaterThan(0)
      expect(typeof s.id).toBe('string')
      expect(typeof s.titlePage.title).toBe('string')
    }
  })

  it('repairs malformed elements instead of crashing', () => {
    const s = migrateScript({
      id: 'x',
      elements: [
        { id: 'a', type: 'action', text: 'ok' },
        { id: 'b', type: 'not-a-type', text: 'coerced' },
        { id: 'c', type: 'dialogue', text: 42 },
        'garbage',
        null,
        { type: 'action', text: 'missing id' },
      ],
    } as never)
    expect(s.elements).toHaveLength(4)
    expect(s.elements[1].type).toBe('action') // coerced from invalid
    expect(s.elements[2].text).toBe('') // non-string text dropped
    expect(s.elements[3].id).toBeTruthy() // id backfilled
  })

  it('strips foreign fields (ownerId, savedAt) from cloud documents', () => {
    const s = migrateScript({
      id: 'x',
      elements: [makeElement('action', 'Hi')],
      ownerId: 'someone',
      savedAt: { seconds: 1 },
    } as never)
    expect('ownerId' in s).toBe(false)
    expect('savedAt' in s).toBe(false)
  })

  it('coerces invalid revision colors and genders', () => {
    const s = migrateScript({
      id: 'x',
      elements: [makeElement('action', 'Hi')],
      revisionColor: 'purple',
      characters: [{ name: 'SARAH', gender: 'robot' }, { gender: 'female' }],
    } as never)
    expect(s.revisionColor).toBe('white')
    expect(s.characters).toHaveLength(1)
    expect(s.characters[0].gender).toBe('unspecified')
  })
})

describe('story bible docs', () => {
  it('adds, updates and removes docs', () => {
    const d = store().addDoc('treatment', 'Draft one')
    expect(store().script.docs).toHaveLength(1)
    store().updateDoc(d.id, { content: 'A heist gone wrong.' })
    expect(store().script.docs[0].content).toBe('A heist gone wrong.')
    store().removeDoc(d.id)
    expect(store().script.docs).toHaveLength(0)
  })

  it('migrateScript backfills missing fields from older saves', () => {
    const legacy = { id: 'x', elements: [makeElement('action', 'Hi')] }
    const s = migrateScript(legacy as never)
    expect(s.docs).toEqual([])
    expect(s.sceneMeta).toEqual({})
    expect(s.tags).toEqual([])
    expect(s.elements[0].text).toBe('Hi')
  })

  it('migrateScript preserves valid dual-dialogue marks and drops bogus ones', () => {
    const input = {
      id: 'x',
      elements: [
        { ...makeElement('character', 'A'), dual: 'left' },
        { ...makeElement('dialogue', 'Hi'), dual: 'right' },
        { ...makeElement('action', 'Later.'), dual: 'sideways' },
      ],
    }
    const s = migrateScript(input as never)
    expect(s.elements[0].dual).toBe('left')
    expect(s.elements[1].dual).toBe('right')
    expect(s.elements[2].dual).toBeUndefined()
  })
})

describe('version timeline', () => {
  it('records snapshots with page and word counts', () => {
    const e = store().recordSnapshot('First')
    expect(e).not.toBeNull()
    expect(e!.pageCount).toBeGreaterThanOrEqual(1)
    expect(e!.words).toBeGreaterThan(0)
    expect(store().timeline).toHaveLength(1)
  })

  it('skips duplicate snapshots of identical content', () => {
    store().recordSnapshot('First')
    expect(store().recordSnapshot('Dup')).toBeNull()
    expect(store().timeline).toHaveLength(1)
  })

  it('restores a snapshot and the restore itself is undoable', () => {
    const snap = store().recordSnapshot('Before edits')!
    const id = store().script.elements[1].id
    store().checkpoint()
    store().updateElementText(id, 'Changed.')
    store().restoreSnapshot(snap.id)
    expect(store().script.elements[1].text).toBe('Sunlight fills the room.')
    store().undo()
    expect(store().script.elements[1].text).toBe('Changed.')
  })
})

describe('uiStore', () => {
  it('focus mode hides the sidebar', () => {
    useUiStore.setState({ focusMode: false, sidebarOpen: true })
    useUiStore.getState().toggleFocusMode()
    expect(useUiStore.getState().focusMode).toBe(true)
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })
  it('tracks persistent-storage grant state for the status bar', () => {
    useUiStore.setState({ storagePersist: null })
    useUiStore.getState().setStoragePersist('denied')
    expect(useUiStore.getState().storagePersist).toBe('denied')
    useUiStore.getState().setStoragePersist('granted')
    expect(useUiStore.getState().storagePersist).toBe('granted')
  })

  it('guest banner dismissal is session-scoped state; banner can open the account menu', () => {
    useUiStore.setState({ guestBannerDismissed: false, accountMenuOpen: false })
    useUiStore.getState().setAccountMenuOpen(true)
    expect(useUiStore.getState().accountMenuOpen).toBe(true)
    useUiStore.getState().dismissGuestBanner()
    expect(useUiStore.getState().guestBannerDismissed).toBe(true)
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
