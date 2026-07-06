/**
 * Script analytics: per-character dialogue statistics and gender balance.
 */
import type { CharacterProfile, ScriptElement } from '../types'
import { canonicalCharacterName } from './stateMachine'

export interface CharacterStats {
  name: string
  gender: CharacterProfile['gender']
  /** Number of dialogue blocks spoken. */
  speeches: number
  /** Total words across all dialogue. */
  words: number
  /** Scenes (by heading index) the character speaks in. */
  scenes: number
}

export interface GenderBreakdown {
  speeches: Record<CharacterProfile['gender'], number>
  words: Record<CharacterProfile['gender'], number>
  characters: Record<CharacterProfile['gender'], number>
}

export function countWords(text: string): number {
  const t = text.trim()
  if (t === '') return 0
  return t.split(/\s+/).length
}

/** Compute stats for every speaking character in the script. */
export function characterStats(
  elements: ScriptElement[],
  profiles: CharacterProfile[] = [],
): CharacterStats[] {
  const genderOf = new Map(profiles.map((p) => [p.name.toUpperCase(), p.gender]))
  const stats = new Map<string, CharacterStats>()
  const scenesSpokenIn = new Map<string, Set<number>>()

  let currentSpeaker: string | null = null
  let sceneIndex = -1

  for (const el of elements) {
    if (el.type === 'scene_heading') {
      sceneIndex++
      currentSpeaker = null
    } else if (el.type === 'character') {
      const name = canonicalCharacterName(el.text)
      currentSpeaker = name || null
    } else if (el.type === 'dialogue' && currentSpeaker) {
      let s = stats.get(currentSpeaker)
      if (!s) {
        s = {
          name: currentSpeaker,
          gender: genderOf.get(currentSpeaker) ?? 'unspecified',
          speeches: 0,
          words: 0,
          scenes: 0,
        }
        stats.set(currentSpeaker, s)
        scenesSpokenIn.set(currentSpeaker, new Set())
      }
      s.speeches++
      s.words += countWords(el.text)
      if (sceneIndex >= 0) scenesSpokenIn.get(currentSpeaker)!.add(sceneIndex)
    } else if (el.type === 'action' || el.type === 'transition' || el.type === 'shot') {
      currentSpeaker = el.type === 'action' ? currentSpeaker : null
    }
  }

  for (const [name, s] of stats) {
    s.scenes = scenesSpokenIn.get(name)?.size ?? 0
  }
  return [...stats.values()].sort((a, b) => b.words - a.words)
}

const EMPTY_GENDER_RECORD = (): Record<CharacterProfile['gender'], number> => ({
  female: 0,
  male: 0,
  nonbinary: 0,
  unspecified: 0,
})

/** Aggregate speech/word counts by gender. */
export function genderBreakdown(stats: CharacterStats[]): GenderBreakdown {
  const out: GenderBreakdown = {
    speeches: EMPTY_GENDER_RECORD(),
    words: EMPTY_GENDER_RECORD(),
    characters: EMPTY_GENDER_RECORD(),
  }
  for (const s of stats) {
    out.speeches[s.gender] += s.speeches
    out.words[s.gender] += s.words
    out.characters[s.gender] += 1
  }
  return out
}
