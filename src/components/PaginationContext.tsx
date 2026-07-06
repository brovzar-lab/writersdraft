/**
 * One pagination per keystroke, shared by everyone who needs it (editor,
 * status bar, scene navigator, print). Uses the incremental paginator, which
 * reuses every page before the edit point.
 */
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import {
  elementPageMap,
  paginateIncremental,
  type PaginationCache,
} from '../engine/pagination'
import type { Page } from '../types'

export interface PaginationValue {
  pages: Page[]
  /** 1-based page number each element starts on. */
  pageOf: Map<string, number>
}

const PaginationCtx = createContext<PaginationValue | null>(null)

export function PaginationProvider({ children }: { children: ReactNode }) {
  const elements = useScriptStore((s) => s.script.elements)
  const cacheRef = useRef<PaginationCache | null>(null)
  const pages = useMemo(() => {
    const next = paginateIncremental(elements, cacheRef.current)
    cacheRef.current = { elements, pages: next }
    return next
  }, [elements])
  const value = useMemo(() => ({ pages, pageOf: elementPageMap(pages) }), [pages])
  return <PaginationCtx.Provider value={value}>{children}</PaginationCtx.Provider>
}

export function usePagination(): PaginationValue {
  const v = useContext(PaginationCtx)
  if (!v) throw new Error('usePagination must be used inside PaginationProvider')
  return v
}
