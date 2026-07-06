/**
 * Fountain (plain-text screenplay format) import/export.
 * Gives WritersDraft a structured interchange format: every element keeps a
 * UUID on import and round-trips as a typed entity.
 */
import type { Script, ScriptElement, ElementType } from '../types'
import { makeElement, emptyScript, newId } from '../stores/scriptStore'

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[. ]/i
const TRANSITION_RE = /^[A-Z0-9 '\-.]+TO:$/
const TRANSITION_EXACT = new Set(['FADE IN:', 'FADE OUT.', 'CUT TO BLACK.', 'FADE TO BLACK.'])
const CHARACTER_RE = /^[A-Z0-9 '\-.()]+$/

export function exportFountain(script: Script): string {
  const tp = script.titlePage
  const head = [
    `Title: ${tp.title}`,
    tp.author ? `Author: ${tp.author}` : null,
    tp.contact ? `Contact: ${tp.contact}` : null,
    tp.draftDate ? `Draft date: ${tp.draftDate}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Group: dialogue lines must directly follow their character cue.
  const out: string[] = []
  script.elements.forEach((el, i) => {
    if (el.text === '') return
    const prev = script.elements[i - 1]
    const glue =
      (el.type === 'dialogue' || el.type === 'parenthetical') &&
      prev &&
      (prev.type === 'character' || prev.type === 'parenthetical' || prev.type === 'dialogue')
    if (out.length > 0 && !glue) out.push('')
    out.push(formatFountainLine(el))
  })
  return `${head}\n\n${out.join('\n')}\n`
}

function formatFountainLine(el: ScriptElement): string {
  switch (el.type) {
    case 'scene_heading': {
      const up = el.text.toUpperCase()
      return SCENE_RE.test(up) ? up : `.${up}`
    }
    case 'character':
      return el.text.toUpperCase()
    case 'transition': {
      const up = el.text.toUpperCase()
      return TRANSITION_RE.test(up) || TRANSITION_EXACT.has(up) ? up : `> ${up}`
    }
    case 'shot':
      return el.text.toUpperCase()
    default:
      return el.text
  }
}

/** Parse Fountain text into a Script (each block gets a fresh UUID). */
export function importFountain(text: string): Script {
  const script = emptyScript()
  script.id = newId()
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  // Title page: leading `Key: value` block ended by a blank line.
  let i = 0
  const tpRe = /^([A-Za-z ]+):\s*(.*)$/
  while (i < lines.length && tpRe.test(lines[i])) {
    const [, key, value] = lines[i].match(tpRe)!
    const k = key.trim().toLowerCase()
    if (k === 'title') script.titlePage.title = value.trim()
    else if (k === 'author' || k === 'authors' || k === 'written by') script.titlePage.author = value.trim()
    else if (k === 'contact') script.titlePage.contact = value.trim()
    else if (k === 'draft date') script.titlePage.draftDate = value.trim()
    i++
  }

  const elements: ScriptElement[] = []
  let inDialogueBlock = false

  for (; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (line === '') {
      inDialogueBlock = false
      continue
    }

    let type: ElementType
    let textOut = line

    if (line.startsWith('.') && !line.startsWith('..')) {
      type = 'scene_heading'
      textOut = line.slice(1).trim().toUpperCase()
    } else if (SCENE_RE.test(line)) {
      type = 'scene_heading'
      textOut = line.toUpperCase()
    } else if (line.startsWith('>') && !line.endsWith('<')) {
      type = 'transition'
      textOut = line.slice(1).trim().toUpperCase()
    } else if (TRANSITION_EXACT.has(line.toUpperCase()) || (TRANSITION_RE.test(line) && line === line.toUpperCase())) {
      type = 'transition'
      textOut = line.toUpperCase()
    } else if (inDialogueBlock && line.startsWith('(')) {
      type = 'parenthetical'
    } else if (inDialogueBlock) {
      type = 'dialogue'
    } else if (
      CHARACTER_RE.test(line) &&
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      i + 1 < lines.length &&
      lines[i + 1].trim() !== ''
    ) {
      type = 'character'
      inDialogueBlock = true
      elements.push(makeElement(type, textOut))
      continue
    } else {
      type = 'action'
    }
    if (type !== 'dialogue' && type !== 'parenthetical') inDialogueBlock = false
    elements.push(makeElement(type, textOut))
  }

  script.elements = elements.length ? elements : [makeElement('scene_heading')]
  return script
}
