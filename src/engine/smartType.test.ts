import { describe, it, expect } from 'vitest'
import { buildContext, locationOf, suggest } from './smartType'
import { makeElement } from '../stores/scriptStore'

const els = [
  makeElement('scene_heading', "INT. MABEL'S DINER - NIGHT"),
  makeElement('character', 'MABEL'),
  makeElement('dialogue', 'We close at ten.'),
  makeElement('character', 'STRANGER (V.O.)'),
  makeElement('dialogue', 'Four minutes.'),
  makeElement('scene_heading', 'EXT. PARKING LOT - NIGHT'),
  makeElement('character', 'MABEL'),
]

const ctx = buildContext(els)

describe('buildContext', () => {
  it('collects unique canonical character names, most recent first', () => {
    expect(ctx.characters).toEqual(['MABEL', 'STRANGER'])
  })
  it('collects locations stripped of prefix and time', () => {
    expect(ctx.locations).toEqual(['PARKING LOT', "MABEL'S DINER"])
  })
})

describe('locationOf', () => {
  it('strips prefix and time', () => {
    expect(locationOf('INT. KITCHEN - DAY')).toBe('KITCHEN')
    expect(locationOf('EXT. ROOFTOP - CONTINUOUS')).toBe('ROOFTOP')
    expect(locationOf('I/E. CAR - DAY')).toBe('CAR')
  })
  it('handles headings without a time', () => {
    expect(locationOf('INT. BASEMENT')).toBe('BASEMENT')
  })
})

describe('suggest: character cues', () => {
  it('completes character names by prefix, case-insensitively', () => {
    expect(suggest('character', 'ma', ctx)).toEqual([
      { text: 'MABEL', completion: 'BEL' },
    ])
  })
  it('offers nothing on an empty cue or an exact match', () => {
    expect(suggest('character', '', ctx)).toEqual([])
    expect(suggest('character', 'MABEL', ctx)).toEqual([])
  })
  it('suggests extensions after an open paren', () => {
    const out = suggest('character', 'MABEL (V', ctx)
    expect(out[0]).toEqual({ text: 'MABEL (V.O.)', completion: '.O.)' })
  })
})

describe('suggest: scene headings', () => {
  it('offers prefixes while typing the prefix', () => {
    const out = suggest('scene_heading', 'IN', ctx)
    expect(out.map((s) => s.text)).toEqual(['INT. ', 'INT./EXT. '])
  })
  it('offers known locations right after the prefix', () => {
    const out = suggest('scene_heading', 'INT. ', ctx)
    expect(out.map((s) => s.text)).toEqual(["INT. PARKING LOT", "INT. MABEL'S DINER"])
  })
  it('completes a partially typed location', () => {
    const out = suggest('scene_heading', 'INT. MAB', ctx)
    expect(out).toEqual([{ text: "INT. MABEL'S DINER", completion: "EL'S DINER" }])
  })
  it('offers times of day after the dash', () => {
    const out = suggest('scene_heading', 'INT. KITCHEN - D', ctx)
    expect(out.map((s) => s.text)).toEqual([
      'INT. KITCHEN - DAY',
      'INT. KITCHEN - DUSK',
      'INT. KITCHEN - DAWN',
    ])
  })
})

describe('suggest: transitions and everything else', () => {
  it('completes standard transitions', () => {
    expect(suggest('transition', 'SM', ctx)[0].text).toBe('SMASH CUT TO:')
  })
  it('suggests nothing for action/dialogue', () => {
    expect(suggest('action', 'INT', ctx)).toEqual([])
    expect(suggest('dialogue', 'ma', ctx)).toEqual([])
  })
})
