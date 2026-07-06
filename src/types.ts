/** Core domain types for WritersDraft. */

export type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'shot'
  | 'general'

export const ELEMENT_TYPES: ElementType[] = [
  'scene_heading',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
  'shot',
  'general',
]

export const ELEMENT_LABELS: Record<ElementType, string> = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
  shot: 'Shot',
  general: 'General',
}

/** A single formatted block of the screenplay. */
export interface ScriptElement {
  id: string
  type: ElementType
  text: string
  /** Scene number, assigned when the script is locked for production. */
  sceneNumber?: string
  /** Whether this element is locked (production workflow). */
  locked?: boolean
  /** Revision color name for production draft tracking. */
  revisionColor?: string
  /** Tag ids attached to this element (creative tracking). */
  tags?: string[]
  /** Alternate lines stored for this element (dialogue alts etc.). */
  alternates?: string[]
  /** Index of the active alternate; -1 or undefined = main text. */
  activeAlternate?: number
}

export interface SceneInfo {
  /** Element id of the scene heading. */
  id: string
  /** Index of the heading element within the script. */
  index: number
  heading: string
  sceneNumber?: string
  /** Beat-board color assigned to the scene. */
  color?: string
  /** Short synopsis shown on index cards. */
  synopsis?: string
}

export interface ScriptNote {
  id: string
  elementId: string
  author: string
  text: string
  createdAt: number
  resolved?: boolean
}

export interface ScriptTag {
  id: string
  name: string
  color: string
}

export interface CharacterProfile {
  name: string
  gender: 'female' | 'male' | 'nonbinary' | 'unspecified'
}

export interface TitlePage {
  title: string
  author: string
  contact: string
  draftDate: string
}

export type RevisionColor =
  | 'white' | 'blue' | 'pink' | 'yellow' | 'green'
  | 'goldenrod' | 'buff' | 'salmon' | 'cherry'

export const REVISION_COLOR_ORDER: RevisionColor[] = [
  'white', 'blue', 'pink', 'yellow', 'green',
  'goldenrod', 'buff', 'salmon', 'cherry',
]

export interface Script {
  id: string
  titlePage: TitlePage
  elements: ScriptElement[]
  /** Production state. */
  locked: boolean
  revisionColor: RevisionColor
  tags: ScriptTag[]
  notes: ScriptNote[]
  characters: CharacterProfile[]
  sceneMeta: Record<string, { color?: string; synopsis?: string }>
  updatedAt: number
}

/** One laid-out line on a page produced by the paginator. */
export interface PageLine {
  elementId: string
  elementIndex: number
  type: ElementType
  text: string
  /** Line index within the element's wrapped lines. */
  lineIndex: number
  /** True when this is a spacing (blank) line, a (MORE) or (CONT'D) marker. */
  kind: 'text' | 'blank' | 'more' | 'contd'
}

export interface Page {
  number: number
  lines: PageLine[]
}
